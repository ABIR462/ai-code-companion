import { appEnv, isMistralConfigured } from "@/lib/env";

export type ChatPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | ChatPart[];
};

const MISTRAL_VISION_MODEL = "pixtral-12b-2409";
const MISTRAL_TEXT_MODEL = appEnv.mistral.model || "mistral-small-latest";

function headers() {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${appEnv.mistral.apiKey}`,
  };
}

/** Fast non-streaming chat used for short replies and image captions. */
export async function chatOnce(
  messages: ChatMessage[],
  options: { vision?: boolean; signal?: AbortSignal; maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  if (!isMistralConfigured) throw new Error("Mistral API key is not configured");
  const model = options.vision ? MISTRAL_VISION_MODEL : MISTRAL_TEXT_MODEL;
  const resp = await fetch(appEnv.mistral.chatEndpoint, {
    method: "POST",
    headers: headers(),
    signal: options.signal,
    body: JSON.stringify({
      model,
      messages,
      temperature: options.temperature ?? 0.5,
      max_tokens: options.maxTokens ?? 1024,
    }),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`Mistral ${resp.status}: ${txt.slice(0, 200)}`);
  }
  const data = await resp.json();
  return String(data?.choices?.[0]?.message?.content ?? "").trim();
}

/** Streaming chat that emits deltas; supports text + image inputs (vision auto). */
export async function streamChat(
  messages: ChatMessage[],
  onDelta: (chunk: string, full: string) => void,
  options: { signal?: AbortSignal; maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  if (!isMistralConfigured) throw new Error("Mistral API key is not configured");

  const usesImages = messages.some(
    (m) => Array.isArray(m.content) && m.content.some((p) => p.type === "image_url"),
  );
  const model = usesImages ? MISTRAL_VISION_MODEL : MISTRAL_TEXT_MODEL;

  const resp = await fetch(appEnv.mistral.chatEndpoint, {
    method: "POST",
    headers: headers(),
    signal: options.signal,
    body: JSON.stringify({
      model,
      messages,
      temperature: options.temperature ?? 0.6,
      max_tokens: options.maxTokens ?? 2048,
      stream: true,
    }),
  });

  if (!resp.ok || !resp.body) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`Mistral ${resp.status}: ${txt.slice(0, 200)}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      let line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload);
        const delta = json?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) {
          full += delta;
          onDelta(delta, full);
        }
      } catch {
        buffer = line + "\n" + buffer;
        break;
      }
    }
  }
  return full;
}

/* ───────────── Image generation (any style, not only realistic) ───────────── */

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
  "1:1":  { w: 1024, h: 1024 },
  "16:9": { w: 1280, h: 720 },
  "9:16": { w: 720, h: 1280 },
  "3:2":  { w: 1200, h: 800 },
  "2:3":  { w: 800, h: 1200 },
  "4:3":  { w: 1200, h: 900 },
};

const STYLE_HINTS: Record<ImageStyle, string> = {
  auto:         "",
  realistic:    "ultra realistic photography, sharp focus, natural lighting, 8k",
  anime:        "anime illustration, cel shaded, vibrant colors, studio ghibli inspired",
  illustration: "modern flat illustration, clean shapes, harmonious palette",
  "3d":         "3d render, octane, soft global illumination, glossy materials",
  pixel:        "pixel art, 32-bit, crisp edges, limited palette",
  logo:         "minimal vector logo, flat, on solid white background, centered",
  sketch:       "hand-drawn pencil sketch, shading, paper texture",
  watercolor:   "watercolor painting, soft washes, paper grain, expressive brush",
  cyberpunk:    "cyberpunk, neon lights, rain reflections, blade runner mood",
};

export type GeneratedImage = {
  url: string;
  prompt: string;
  style: ImageStyle;
  ratio: ImageRatio;
  seed: number;
};

export function buildImagePrompt(prompt: string, style: ImageStyle) {
  const hint = STYLE_HINTS[style];
  return hint ? `${prompt}, ${hint}` : prompt;
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
  });
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params.toString()}`;
}

/** Wait for an <img> to actually load — gives reliable progress + error UX. */
export function loadImage(src: string, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("aborted"));
    const img = new Image();
    const onAbort = () => { img.src = ""; reject(new Error("aborted")); };
    signal?.addEventListener("abort", onAbort, { once: true });
    img.crossOrigin = "anonymous";
    img.onload = () => { signal?.removeEventListener("abort", onAbort); resolve(); };
    img.onerror = () => { signal?.removeEventListener("abort", onAbort); reject(new Error("Image render failed — try again")); };
    img.src = src;
  });
}

export async function generateImage(opts: {
  prompt: string;
  style?: ImageStyle;
  ratio?: ImageRatio;
  count?: number;
  signal?: AbortSignal;
}): Promise<GeneratedImage[]> {
  const style = opts.style ?? "auto";
  const ratio = opts.ratio ?? "1:1";
  const count = Math.min(Math.max(opts.count ?? 1, 1), 4);
  const finalPrompt = buildImagePrompt(opts.prompt, style);
  const out: GeneratedImage[] = [];
  for (let i = 0; i < count; i++) {
    const seed = Date.now() + Math.floor(Math.random() * 100000) + i;
    const url = pollinationsUrl(finalPrompt, ratio, seed);
    await loadImage(url, opts.signal);
    out.push({ url, prompt: finalPrompt, style, ratio, seed });
  }
  return out;
}

/* ───────────── Helpers ───────────── */

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

/** Detect "/image ..." or "/img ..." or "draw ... " intents */
export function detectImageIntent(text: string): { isImage: boolean; prompt: string } {
  const t = text.trim();
  const m = t.match(/^\/(image|img|draw|generate)\s+([\s\S]+)/i);
  if (m) return { isImage: true, prompt: m[2].trim() };
  if (/^(draw|generate|create|make)\s+(an?|the)?\s*(image|picture|photo|illustration|logo|poster|wallpaper|banner)\s+/i.test(t)) {
    return { isImage: true, prompt: t.replace(/^(draw|generate|create|make)\s+(an?|the)?\s*/i, "") };
  }
  return { isImage: false, prompt: t };
}
