import { appEnv, isGeminiConfigured } from "@/lib/env";

export type ChatPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | ChatPart[];
};

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

function geminiModelUrl(model: string, method: "generateContent" | "streamGenerateContent") {
  const alt = method === "streamGenerateContent" ? "&alt=sse" : "";
  return `${GEMINI_BASE}/models/${model}:${method}?key=${appEnv.gemini.apiKey}${alt}`;
}

function toGeminiContents(messages: ChatMessage[]) {
  const systemInstruction: string[] = [];
  const contents: any[] = [];

  for (const m of messages) {
    if (m.role === "system") {
      systemInstruction.push(
        typeof m.content === "string"
          ? m.content
          : m.content.filter((p) => p.type === "text").map((p) => (p as any).text).join("\n"),
      );
      continue;
    }

    const role = m.role === "assistant" ? "model" : "user";
    const parts: any[] = [];
    if (typeof m.content === "string") {
      parts.push({ text: m.content });
    } else {
      for (const p of m.content) {
        if (p.type === "text") {
          parts.push({ text: p.text });
        } else {
          const url = p.image_url.url;
          const match = url.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
          if (match) parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
          else parts.push({ text: `[Image URL: ${url}]` });
        }
      }
    }
    if (parts.length) contents.push({ role, parts });
  }

  return {
    systemInstruction: systemInstruction.length ? { parts: [{ text: systemInstruction.join("\n") }] } : undefined,
    contents,
  };
}

function extractGeminiText(data: any) {
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((part: any) => (typeof part?.text === "string" ? part.text : "")).join("").trim();
}

export async function chatOnce(
  messages: ChatMessage[],
  options: { vision?: boolean; signal?: AbortSignal; maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  if (!isGeminiConfigured) throw new Error("Gemini API key is not configured");
  const { systemInstruction, contents } = toGeminiContents(messages);
  const resp = await fetch(geminiModelUrl(appEnv.gemini.chatModel, "generateContent"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: options.signal,
    body: JSON.stringify({
      ...(systemInstruction ? { systemInstruction } : {}),
      contents,
      generationConfig: {
        temperature: options.temperature ?? 0.5,
        maxOutputTokens: options.maxTokens ?? 1024,
      },
    }),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`Gemini ${resp.status}: ${txt.slice(0, 240)}`);
  }
  return extractGeminiText(await resp.json());
}

export async function streamChat(
  messages: ChatMessage[],
  onDelta: (chunk: string, full: string) => void,
  options: { signal?: AbortSignal; maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  if (!isGeminiConfigured) throw new Error("Gemini API key is not configured");

  const { systemInstruction, contents } = toGeminiContents(messages);
  const resp = await fetch(geminiModelUrl(appEnv.gemini.chatModel, "streamGenerateContent"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: options.signal,
    body: JSON.stringify({
      ...(systemInstruction ? { systemInstruction } : {}),
      contents,
      generationConfig: {
        temperature: options.temperature ?? 0.6,
        maxOutputTokens: options.maxTokens ?? 2048,
      },
    }),
  });

  if (!resp.ok || !resp.body) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`Gemini ${resp.status}: ${txt.slice(0, 240)}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  const processLine = (rawLine: string) => {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    try {
      const delta = extractGeminiText(JSON.parse(payload));
      if (delta) {
        full += delta;
        onDelta(delta, full);
      }
    } catch {
      buffer = `${line}\n${buffer}`;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      processLine(line);
    }
  }
  if (buffer.trim()) buffer.split("\n").forEach(processLine);
  return full;
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

const STYLE_HINTS: Record<ImageStyle, string> = {
  auto: "",
  realistic: "ultra realistic photography, sharp focus, natural lighting, 8k detail",
  anime: "anime illustration, cel shaded, vibrant colors, cinematic composition",
  illustration: "modern editorial illustration, clean shapes, harmonious palette",
  "3d": "premium 3d render, soft global illumination, glossy detailed materials",
  pixel: "pixel art, crisp edges, limited palette, retro game style",
  logo: "minimal vector logo, centered on solid white background, clean geometry",
  sketch: "hand-drawn pencil sketch, expressive shading, paper texture",
  watercolor: "watercolor painting, soft washes, paper grain, expressive brushwork",
  cyberpunk: "cyberpunk, neon lights, rain reflections, futuristic city mood",
};

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
  return [prompt, hint, ratioHint, "high quality, detailed, no text artifacts unless requested"]
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
  });
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params.toString()}`;
}

function extractGeminiImages(data: any, prompt: string, style: ImageStyle, ratio: ImageRatio): GeneratedImage[] {
  const parts = data?.candidates?.flatMap((candidate: any) => candidate?.content?.parts ?? []) ?? [];
  return parts.flatMap((part: any, index: number) => {
    const inline = part?.inlineData ?? part?.inline_data;
    const b64 = inline?.data;
    const mime = inline?.mimeType ?? inline?.mime_type ?? "image/png";
    return b64 ? [{ url: `data:${mime};base64,${b64}`, prompt, style, ratio, seed: Date.now() + index }] : [];
  });
}

async function generateGeminiImage(prompt: string, style: ImageStyle, ratio: ImageRatio, signal?: AbortSignal) {
  const resp = await fetch(geminiModelUrl(appEnv.gemini.imageModel, "generateContent"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.8,
        responseModalities: ["TEXT", "IMAGE"],
      },
    }),
  });

  const data = await resp.json().catch(async () => ({ error: { message: await resp.text().catch(() => "") } }));
  if (!resp.ok) {
    throw new Error(`Gemini image ${resp.status}: ${(data?.error?.message ?? "request failed").slice(0, 240)}`);
  }

  const images = extractGeminiImages(data, prompt, style, ratio);
  if (!images.length) {
    const finishReason = data?.candidates?.[0]?.finishReason;
    const text = extractGeminiText(data);
    throw new Error(`Gemini returned no image${finishReason ? ` (${finishReason})` : ""}${text ? `: ${text.slice(0, 160)}` : ""}`);
  }
  return images;
}

export async function generateImage(opts: {
  prompt: string;
  style?: ImageStyle;
  ratio?: ImageRatio;
  count?: number;
  signal?: AbortSignal;
}): Promise<GeneratedImage[]> {
  if (!isGeminiConfigured) throw new Error("Gemini API key is not configured");

  const style = opts.style ?? "auto";
  const ratio = opts.ratio ?? "1:1";
  const count = Math.min(Math.max(opts.count ?? 1, 1), 4);
  const finalPrompt = buildImagePrompt(opts.prompt, style, ratio);
  const out: GeneratedImage[] = [];

  try {
    for (let i = 0; i < count; i++) {
      const batch = await generateGeminiImage(finalPrompt, style, ratio, opts.signal);
      out.push(...batch);
      if (out.length >= count) break;
    }
    return out.slice(0, count);
  } catch (error) {
    console.warn("Gemini image API failed, using visual fallback:", error);
    return fallbackPollinations(finalPrompt, style, ratio, count, opts.signal);
  }
}

async function fallbackPollinations(
  prompt: string,
  style: ImageStyle,
  ratio: ImageRatio,
  count: number,
  signal?: AbortSignal,
): Promise<GeneratedImage[]> {
  const out: GeneratedImage[] = [];
  for (let i = 0; i < count; i++) {
    const seed = Date.now() + Math.floor(Math.random() * 100000) + i;
    const imageUrl = pollinationsUrl(prompt, ratio, seed);
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
      img.src = imageUrl;
    });
    out.push({ url: imageUrl, prompt, style, ratio, seed });
  }
  return out;
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
  if (/^(draw|generate|create|make)\s+(an?|the)?\s*(image|picture|photo|illustration|logo|poster|wallpaper|banner)\s+/i.test(t)) {
    return { isImage: true, prompt: t.replace(/^(draw|generate|create|make)\s+(an?|the)?\s*/i, "") };
  }
  return { isImage: false, prompt: t };
}
