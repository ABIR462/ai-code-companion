import { appEnv, isOpenRouterConfigured } from "@/lib/env";

const OPENROUTER_CHAT_URL = `${appEnv.openrouter.apiBaseUrl.replace(/\/$/, "")}/chat/completions`;
const MISTRAL_IMAGE_URL = "https://api.mistral.ai/v1/image/generate";

function openRouterHeaders(): Record<string, string> {
  if (!isOpenRouterConfigured) {
    throw new Error("OpenRouter is not configured. Set VITE_OPENROUTER_API_KEY.");
  }
  return {
    Authorization: `Bearer ${appEnv.openrouter.apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": typeof window !== "undefined" ? window.location.origin : "https://matrixbook.app",
    "X-OpenRouter-Title": "Matrixbook Supernova",
  };
}

export type ChatPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | ChatPart[];
};

function toOpenAIMessages(messages: ChatMessage[]): { role: string; content: unknown }[] {
  const systemChunks: string[] = [];
  const out: { role: string; content: unknown }[] = [];

  for (const m of messages) {
    if (m.role === "system") {
      const c =
        typeof m.content === "string"
          ? m.content
          : m.content
              .filter((p) => p.type === "text")
              .map((p) => (p as { text: string }).text)
              .join("\n");
      systemChunks.push(c);
      continue;
    }
    if (m.role === "assistant") {
      out.push({
        role: "assistant",
        content: typeof m.content === "string" ? m.content : "",
      });
      continue;
    }
    if (typeof m.content === "string") {
      out.push({ role: "user", content: m.content });
    } else {
      const parts = m.content.map((p) => {
        if (p.type === "text") return { type: "text", text: p.text };
        const url = p.image_url.url;
        return { type: "image_url", image_url: { url } };
      });
      out.push({ role: "user", content: parts });
    }
  }

  const sys = systemChunks.length ? [{ role: "system", content: systemChunks.join("\n\n") }] : [];
  return [...sys, ...out];
}

function extractText(data: unknown): string {
  const d = data as Record<string, unknown>;
  const choices = d?.choices as unknown[] | undefined;
  if (choices?.[0]) {
    const ch = choices[0] as Record<string, unknown>;
    const msg = ch.message as Record<string, unknown> | undefined;
    const content = msg?.content;
    if (typeof content === "string") return content.trim();
    if (Array.isArray(content)) {
      return content
        .map((part: unknown) => {
          const p = part as Record<string, unknown>;
          return typeof p?.text === "string" ? p.text : "";
        })
        .join("")
        .trim();
    }
  }
  return "";
}

async function chatOnceOpenRouter(
  messages: ChatMessage[],
  options: { signal?: AbortSignal; maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  const resp = await fetch(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers: openRouterHeaders(),
    signal: options.signal,
    body: JSON.stringify({
      model: appEnv.openrouter.chatModel,
      messages: toOpenAIMessages(messages),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2048,
    }),
  });
  const txt = await resp.text();
  if (!resp.ok) throw new Error(`OpenRouter ${resp.status}: ${txt.slice(0, 280)}`);
  let data: unknown;
  try {
    data = JSON.parse(txt);
  } catch {
    return txt.trim();
  }
  const text = extractText(data);
  if (!text) throw new Error("OpenRouter returned an empty response");
  return text;
}

async function chatOnceNvidia(
  messages: ChatMessage[],
  options: { signal?: AbortSignal; maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  void messages;
  void options;
  throw new Error("NVIDIA chat removed. Use OpenRouter.");
}

export async function chatOnce(
  messages: ChatMessage[],
  options: { vision?: boolean; signal?: AbortSignal; maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  if (isOpenRouterConfigured) {
    return chatOnceOpenRouter(messages, options);
  }
  throw new Error("Configure VITE_OPENROUTER_API_KEY for Supernova chat.");
}

function processSseLine(
  rawLine: string,
  onDelta: (chunk: string, full: string) => void,
  getFull: () => string,
  setFull: (s: string) => void,
) {
  const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
  if (!line.trim() || line.startsWith(":")) return;
  if (!line.startsWith("data:")) return;
  const payload = line.slice(5).trim();
  if (!payload || payload === "[DONE]") return;
  try {
    const json = JSON.parse(payload) as {
      choices?: { delta?: { content?: string | unknown[] } }[];
    };
    const deltaRaw = json?.choices?.[0]?.delta?.content;
    let delta = "";
    if (typeof deltaRaw === "string") delta = deltaRaw;
    else if (Array.isArray(deltaRaw)) {
      delta = deltaRaw
        .map((part: unknown) => {
          const p = part as Record<string, unknown>;
          return typeof p?.text === "string" ? p.text : "";
        })
        .join("");
    }
    if (delta) {
      const next = getFull() + delta;
      setFull(next);
      onDelta(delta, next);
    }
  } catch {
    /* ignore malformed chunk */
  }
}

async function streamOpenRouterChat(
  messages: ChatMessage[],
  onDelta: (chunk: string, full: string) => void,
  options: { signal?: AbortSignal; maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  const resp = await fetch(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers: openRouterHeaders(),
    signal: options.signal,
    body: JSON.stringify({
      model: appEnv.openrouter.chatModel,
      messages: toOpenAIMessages(messages),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2048,
      stream: true,
    }),
  });

  if (!resp.ok || !resp.body) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`OpenRouter ${resp.status}: ${detail.slice(0, 240)}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  const getFull = () => full;
  const setFull = (s: string) => {
    full = s;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      processSseLine(line, onDelta, getFull, setFull);
    }
  }
  if (buffer.trim()) buffer.split("\n").forEach((line) => processSseLine(line, onDelta, getFull, setFull));
  return full.trim();
}

async function streamNvidiaChat(
  messages: ChatMessage[],
  onDelta: (chunk: string, full: string) => void,
  options: { signal?: AbortSignal; maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  void messages;
  void onDelta;
  void options;
  throw new Error("NVIDIA streaming removed. Use OpenRouter.");
}

export async function streamChat(
  messages: ChatMessage[],
  onDelta: (chunk: string, full: string) => void,
  options: { signal?: AbortSignal; maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  if (isOpenRouterConfigured) {
    return streamOpenRouterChat(messages, onDelta, options);
  }
  throw new Error("Configure VITE_OPENROUTER_API_KEY for Supernova chat.");
}

export type ImageStyle =
  | "auto"
  | "realistic"
  | "anime"
  | "illustration"
  | "3d"
  | "pixel"
  | "logo"
  | "sketch"
  | "watercolor"
  | "cyberpunk";

export type ImageRatio = "1:1" | "16:9" | "9:16" | "3:2" | "2:3" | "4:3";

const RATIO_DIMS: Record<ImageRatio, { w: number; h: number }> = {
  "1:1": { w: 1024, h: 1024 },
  "16:9": { w: 1280, h: 720 },
  "9:16": { w: 720, h: 1280 },
  "3:2": { w: 1200, h: 800 },
  "2:3": { w: 800, h: 1200 },
  "4:3": { w: 1200, h: 900 },
};

const OPENROUTER_IMAGE_ASPECT_RATIO: Record<ImageRatio, string> = {
  "1:1": "1:1",
  "16:9": "16:9",
  "9:16": "9:16",
  "3:2": "3:2",
  "2:3": "2:3",
  "4:3": "4:3",
};

const STYLE_HINTS: Record<ImageStyle, string> = {
  auto: "",
  realistic:
    "ultra realistic photography, professional color grading, lifelike skin and materials, sharp focal plane, natural light, premium lens rendering",
  anime: "anime key visual, polished cel shading, expressive faces, dynamic framing, vibrant palette, cinematic lighting",
  illustration: "editorial illustration, clean silhouette language, refined composition, high contrast focal hierarchy, tasteful palette",
  "3d": "premium 3d render, cinematic global illumination, believable reflections, detailed materials, polished studio lighting",
  pixel: "high-end pixel art, crisp edges, readable clusters, intentional palette control, game-ready composition",
  logo: "minimal vector identity mark, clean geometry, balanced negative space, brand-ready, no mockup scene",
  sketch: "hand-drawn graphite sketch, confident linework, expressive shading, subtle paper texture",
  watercolor: "watercolor illustration, layered washes, pigment bloom, textured paper, elegant brush rhythm",
  cyberpunk: "cyberpunk atmosphere, neon reflections, dense city mood, volumetric haze, futuristic cinematic lighting",
};

const STYLE_QUALITY_SUFFIX: Partial<Record<ImageStyle, string>> = {
  realistic: "85mm lens look, realistic depth of field, subtle filmic contrast",
  anime: "clean line art, anatomy consistency, polished background rendering",
  illustration: "publication-ready detail, elegant shape language",
  "3d": "octane-quality finish, premium product-shot clarity",
  logo: "flat background, centered composition, no bevels unless requested, no extra words",
};

const NEGATIVE_HINT =
  "no watermark, no signature, no extra text, no duplicated subjects, no deformed anatomy, no muddy details";

export type GeneratedImage = {
  url: string;
  prompt: string;
  style: ImageStyle;
  ratio: ImageRatio;
  seed: number;
};

export function buildImagePrompt(prompt: string, style: ImageStyle, ratio: ImageRatio = "1:1") {
  const hint = STYLE_HINTS[style];
  const ratioHint = `aspect ratio ${ratio}`;
  const qualityHint = STYLE_QUALITY_SUFFIX[style] ?? "strong composition, high detail, crisp subject separation";
  return [prompt.trim(), hint, qualityHint, ratioHint, NEGATIVE_HINT]
    .filter(Boolean)
    .join(", ");
}

export function pollinationsUrl(prompt: string, ratio: ImageRatio, seed: number, model = "flux") {
  const { w, h } = RATIO_DIMS[ratio];
  const params = new URLSearchParams({
    width: String(w),
    height: String(h),
    seed: String(seed),
    model,
    nologo: "true",
    enhance: "true",
    safe: "true",
  });
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params.toString()}`;
}

type OrMsgImage = { image_url?: { url?: string }; url?: string; data?: string };

function extractOpenRouterMessageImages(data: unknown): string[] {
  const d = data as {
    choices?: { message?: { images?: OrMsgImage[]; content?: unknown } }[];
  };
  const msg = d?.choices?.[0]?.message;
  const urls: string[] = [];
  if (Array.isArray(msg?.images)) {
    for (const im of msg.images) {
      const u = im?.image_url?.url || im?.url;
      if (typeof u === "string" && u) urls.push(u);
    }
  }
  const content = msg?.content;
  if (Array.isArray(content)) {
    for (const part of content) {
      const p = part as { type?: string; image_url?: { url?: string } };
      if (p?.type === "image_url" && p.image_url?.url) urls.push(p.image_url.url);
    }
  }
  return urls;
}

async function generateOneOpenRouterImage(
  prompt: string,
  ratio: ImageRatio,
  referenceDataUrls: string[] | undefined,
  signal?: AbortSignal,
): Promise<string[]> {
  if (!appEnv.openrouter.imageModel) {
    throw new Error("No OpenRouter image model configured.");
  }
  const hasRefs = !!referenceDataUrls?.length;
  const safePrompt =
    hasRefs && !prompt.trim()
      ? "Edit the attached image(s) to match the requested style and aspect ratio. Preserve key subject details unless asked."
      : prompt;

  const resp = await fetch(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers: openRouterHeaders(),
    signal,
    body: JSON.stringify({
      model: appEnv.openrouter.imageModel,
      messages: [
        {
          role: "user",
          content: hasRefs
            ? [
                ...(referenceDataUrls ?? []).map((url) => ({ type: "image_url", image_url: { url } })),
                { type: "text", text: safePrompt },
              ]
            : safePrompt,
        },
      ],
      modalities: ["image"],
      image_config: {
        aspect_ratio: OPENROUTER_IMAGE_ASPECT_RATIO[ratio],
      },
    }),
  });

  const txt = await resp.text();
  if (!resp.ok) {
    throw new Error(`OpenRouter image (${appEnv.openrouter.imageModel}) ${resp.status}: ${txt.slice(0, 400)}`);
  }
  let data: unknown;
  try {
    data = JSON.parse(txt);
  } catch {
    throw new Error(`OpenRouter image non-JSON: ${txt.slice(0, 240)}`);
  }
  const urls = extractOpenRouterMessageImages(data);
  if (!urls.length) {
    const maybeText = extractText(data);
    throw new Error([
      "OpenRouter returned no images.",
      "Confirm the model supports `modalities: [image]` and your key has access.",
      maybeText ? `Response text: ${maybeText.slice(0, 220)}` : "",
    ].filter(Boolean).join(" "));
  }
  return urls;
}

async function generateOpenRouterImageBatch(
  finalPrompt: string,
  style: ImageStyle,
  ratio: ImageRatio,
  count: number,
  referenceDataUrls: string[] | undefined,
  signal?: AbortSignal,
): Promise<GeneratedImage[]> {
  const out: GeneratedImage[] = [];
  for (let i = 0; i < count; i++) {
    const baseSeed = (Date.now() + i * 9973) >>> 0;
    const urls = await generateOneOpenRouterImage(finalPrompt, ratio, referenceDataUrls, signal);
    for (let j = 0; j < urls.length; j++) {
      out.push({
        url: urls[j],
        prompt: finalPrompt,
        style,
        ratio,
        seed: baseSeed + j,
      });
      if (out.length >= count) return out.slice(0, count);
    }
  }
  return out.slice(0, count);
}

async function prefetchImageUrl(url: string, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("aborted", "AbortError"));
    const img = new window.Image();
    const onAbort = () => {
      img.src = "";
      reject(new DOMException("aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    img.onload = () => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    img.onerror = () => {
      signal?.removeEventListener("abort", onAbort);
      reject(new Error("Image failed"));
    };
    img.src = url;
  });
}

/**
 * Text-to-image priority: OpenRouter image model (modalities image+text) → NVIDIA GenAI → Pollinations.
 */
export async function generateImage(opts: {
  prompt: string;
  style?: ImageStyle;
  ratio?: ImageRatio;
  count?: number;
  signal?: AbortSignal;
  /** Reference image(s) for edit / variation flows (data URLs or https). */
  referenceDataUrls?: string[];
}): Promise<GeneratedImage[]> {
  const style = opts.style ?? "auto";
  const ratio = opts.ratio ?? "1:1";
  const count = Math.min(Math.max(opts.count ?? 1, 1), 4);
  const finalPrompt = buildImagePrompt(opts.prompt, style, ratio);
  const refs = opts.referenceDataUrls?.filter(Boolean);

  if (isOpenRouterConfigured && appEnv.openrouter.imageModel) {
    try {
      return await generateOpenRouterImageBatch(finalPrompt, style, ratio, count, refs, opts.signal);
    } catch (error) {
      console.warn("OpenRouter image generation failed, falling back to Pollinations.", error);
      if (refs?.length) throw error;
    }
  }

  if (!refs?.length) {
    const out: GeneratedImage[] = [];
    for (let i = 0; i < count; i++) {
      const seed = (Date.now() + i * 9973) >>> 0;
      const url = pollinationsUrl(finalPrompt, ratio, seed, appEnv.supernova.imageModel);
      await prefetchImageUrl(url, opts.signal);
      out.push({ url, prompt: finalPrompt, style, ratio, seed });
    }
    return out;
  }

  if (!isOpenRouterConfigured) {
    throw new Error("Reference-image editing still requires VITE_OPENROUTER_API_KEY plus an image-capable VITE_OPENROUTER_IMAGE_MODEL.");
  }

  throw new Error(
    "Configure VITE_OPENROUTER_IMAGE_MODEL with an image-capable OpenRouter model to use reference-image editing in Supernova.",
  );
}

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export function detectImageIntent(text: string): { isImage: boolean; prompt: string } {
  const t = text.trim();
  const m = t.match(/^\/(image|img|draw|generate)\s+([\s\S]+)/i);
  if (m) return { isImage: true, prompt: m[2].trim() };
  if (
    /^(draw|generate|create|make)\s+(an?|the)?\s*(image|picture|photo|illustration|logo|poster|wallpaper|banner)\s+/i.test(
      t,
    )
  ) {
    return { isImage: true, prompt: t.replace(/^(draw|generate|create|make)\s+(an?|the)?\s*/i, "") };
  }
  return { isImage: false, prompt: t };
}

async function generateImage({
  prompt,
  style,
  ratio,
  count,
  signal,
}: {
  prompt: string;
  style: string;
  ratio: string;
  count: number;
  signal?: AbortSignal;
}): Promise<{ url: string }[]> {
  const response = await fetch(MISTRAL_IMAGE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${appEnv.mistral.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: appEnv.mistral.imageModel,
      prompt,
      style,
      ratio,
      count,
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Mistral API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.images;
}

export { generateImage };
