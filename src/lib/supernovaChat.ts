import { appEnv, isGeminiConfigured } from "@/lib/env";

export type ChatPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | ChatPart[];
};

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const CHAT_MODEL = "gemini-flash-latest";

/* ── Convert our ChatMessage[] to Gemini format ── */
function toGeminiContents(messages: ChatMessage[]) {
  const systemInstruction: string[] = [];
  const contents: any[] = [];

  for (const m of messages) {
    if (m.role === "system") {
      systemInstruction.push(typeof m.content === "string" ? m.content : m.content.filter(p => p.type === "text").map(p => (p as any).text).join("\n"));
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
        } else if (p.type === "image_url") {
          const url = p.image_url.url;
          if (url.startsWith("data:")) {
            const match = url.match(/^data:(image\/\w+);base64,(.+)/);
            if (match) {
              parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
            }
          } else {
            parts.push({ text: `[Image: ${url}]` });
          }
        }
      }
    }
    if (parts.length) contents.push({ role, parts });
  }
  return { systemInstruction: systemInstruction.length ? { parts: [{ text: systemInstruction.join("\n") }] } : undefined, contents };
}

/** Fast non-streaming chat used for short replies and image captions. */
export async function chatOnce(
  messages: ChatMessage[],
  options: { vision?: boolean; signal?: AbortSignal; maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  if (!isGeminiConfigured) throw new Error("Gemini API key is not configured");
  const { systemInstruction, contents } = toGeminiContents(messages);
  const url = `${GEMINI_BASE}/models/${CHAT_MODEL}:generateContent?key=${appEnv.gemini.apiKey}`;
  const resp = await fetch(url, {
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
    throw new Error(`Gemini ${resp.status}: ${txt.slice(0, 200)}`);
  }
  const data = await resp.json();
  return String(data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
}

/** Streaming chat that emits deltas; supports text + image inputs (vision auto). */
export async function streamChat(
  messages: ChatMessage[],
  onDelta: (chunk: string, full: string) => void,
  options: { signal?: AbortSignal; maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  if (!isGeminiConfigured) throw new Error("Gemini API key is not configured");

  const { systemInstruction, contents } = toGeminiContents(messages);
  const url = `${GEMINI_BASE}/models/${CHAT_MODEL}:streamGenerateContent?alt=sse&key=${appEnv.gemini.apiKey}`;
  const resp = await fetch(url, {
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
    throw new Error(`Gemini ${resp.status}: ${txt.slice(0, 200)}`);
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
        const delta = json?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (typeof delta === "string" && delta) {
          full += delta;
          onDelta(delta, full);
        }
      } catch {
        // partial JSON, skip
      }
    }
  }
  return full;
}

/* ───────────── Image generation via Gemini Imagen 4 API ───────────── */

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

const IMAGEN_RATIOS: Record<ImageRatio, string> = {
  "1:1": "1:1",
  "16:9": "16:9",
  "9:16": "9:16",
  "3:2": "4:3",   // closest supported
  "2:3": "3:4",   // closest supported
  "4:3": "4:3",
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
  const finalPrompt = buildImagePrompt(opts.prompt, style);

  const imagenRatio = IMAGEN_RATIOS[ratio];
  const url = `${GEMINI_BASE}/models/imagen-4.0-generate-001:predict?key=${appEnv.gemini.apiKey}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: opts.signal,
    body: JSON.stringify({
      instances: [{ prompt: finalPrompt }],
      parameters: {
        sampleCount: count,
        aspectRatio: imagenRatio,
      },
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    // Fallback to Pollinations if Imagen fails (e.g. safety filter)
    console.warn("Imagen API failed, falling back to Pollinations:", resp.status, txt.slice(0, 200));
    return fallbackPollinations(finalPrompt, style, ratio, count, opts.signal);
  }

  const data = await resp.json();
  const predictions = data?.predictions ?? [];

  if (!predictions.length) {
    // Fallback if no predictions returned (safety filter etc.)
    return fallbackPollinations(finalPrompt, style, ratio, count, opts.signal);
  }

  const out: GeneratedImage[] = [];
  for (let i = 0; i < predictions.length; i++) {
    const b64 = predictions[i]?.bytesBase64Encoded;
    if (b64) {
      const dataUrl = `data:image/png;base64,${b64}`;
      out.push({ url: dataUrl, prompt: finalPrompt, style, ratio, seed: Date.now() + i });
    }
  }

  return out.length ? out : fallbackPollinations(finalPrompt, style, ratio, count, opts.signal);
}

/** Fallback to Pollinations when Imagen API fails */
async function fallbackPollinations(
  prompt: string, style: ImageStyle, ratio: ImageRatio, count: number, signal?: AbortSignal
): Promise<GeneratedImage[]> {
  const out: GeneratedImage[] = [];
  for (let i = 0; i < count; i++) {
    const seed = Date.now() + Math.floor(Math.random() * 100000) + i;
    const imageUrl = pollinationsUrl(prompt, ratio, seed);
    // Pre-load
    await new Promise<void>((resolve, reject) => {
      if (signal?.aborted) return reject(new Error("aborted"));
      const img = new window.Image();
      const onAbort = () => { img.src = ""; reject(new Error("aborted")); };
      signal?.addEventListener("abort", onAbort, { once: true });
      img.crossOrigin = "anonymous";
      img.onload = () => { signal?.removeEventListener("abort", onAbort); resolve(); };
      img.onerror = () => { signal?.removeEventListener("abort", onAbort); reject(new Error("Image failed")); };
      img.src = imageUrl;
    });
    out.push({ url: imageUrl, prompt, style, ratio, seed });
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
