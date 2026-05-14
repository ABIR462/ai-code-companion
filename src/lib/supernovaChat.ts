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

const STYLE_HINTS: Record<ImageStyle, string> = {
  auto: "",
  realistic:
    "ultra realistic photography, professional color grading, lifelike materials, sharp focal plane, natural light",
  anime: "anime key visual, polished cel shading, expressive character design, dynamic framing",
  illustration: "editorial illustration, clean silhouette language, refined composition, tasteful palette",
  "3d": "premium 3d render, cinematic global illumination, detailed materials, studio lighting",
  pixel: "high-end pixel art, crisp edges, readable clusters, intentional palette",
  logo: "minimal vector identity mark, clean geometry, balanced negative space, no extra words",
  sketch: "hand-drawn graphite sketch, confident linework, expressive shading, paper texture",
  watercolor: "watercolor illustration, layered washes, pigment bloom, textured paper",
  cyberpunk: "cyberpunk atmosphere, neon reflections, futuristic cinematic lighting",
};

const STYLE_QUALITY_SUFFIX: Partial<Record<ImageStyle, string>> = {
  realistic: "85mm lens look, realistic depth of field, subtle filmic contrast",
  anime: "clean line art, anatomy consistency, polished background rendering",
  illustration: "publication-ready detail, elegant shape language",
  "3d": "premium product-shot clarity, believable reflections",
  logo: "flat background, centered composition, brand-ready",
};

const NEGATIVE_HINT = "no watermark, no signature, no malformed text, no duplicated subjects, no muddy details";

export type GeneratedImage = {
  url: string;
  prompt: string;
  style: ImageStyle;
  ratio: ImageRatio;
  seed: number;
};

export function buildImagePrompt(prompt: string, style: ImageStyle, ratio: ImageRatio = "1:1") {
  const hint = STYLE_HINTS[style];
  const qualityHint = STYLE_QUALITY_SUFFIX[style] ?? "strong composition, high detail, crisp subject separation";
  return [prompt.trim(), hint, qualityHint, `aspect ratio ${ratio}`, NEGATIVE_HINT].filter(Boolean).join(", ");
}

async function prefetchImageUrl(url: string, signal?: AbortSignal): Promise<void> {
  if (url.startsWith("data:") || typeof window === "undefined") return;
  await new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("aborted", "AbortError"));
    const image = new window.Image();
    const onAbort = () => {
      image.src = "";
      reject(new DOMException("aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    image.onload = () => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    image.onerror = () => {
      signal?.removeEventListener("abort", onAbort);
      reject(new Error("Generated image URL could not be loaded."));
    };
    image.src = url;
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
  const finalPrompt = buildImagePrompt(opts.prompt, style, ratio);

  const response = await fetch("/api/supernova-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: opts.signal,
    body: JSON.stringify({ prompt: finalPrompt, ratio, count }),
  });

  const text = await response.text();
  let data: { images?: { url?: string }[]; error?: string; detail?: string };
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text || "Supernova backend returned a non-JSON response." };
  }

  if (!response.ok) {
    throw new Error([data.error || `Supernova backend failed (${response.status})`, data.detail].filter(Boolean).join(" "));
  }

  const urls = (data.images ?? []).map((image) => image.url).filter((url): url is string => !!url);
  if (!urls.length) {
    throw new Error("Supernova backend returned no image.");
  }

  await Promise.all(urls.map((url) => prefetchImageUrl(url, opts.signal)));
  return urls.map((url, index) => ({
    url,
    prompt: finalPrompt,
    style,
    ratio,
    seed: (Date.now() + index * 9973) >>> 0,
  }));
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
  const trimmed = text.trim();
  const slashCommand = trimmed.match(/^\/(image|img|draw|generate)\s+([\s\S]+)/i);
  if (slashCommand) return { isImage: true, prompt: slashCommand[2].trim() };
  return {
    isImage: /^(draw|generate|create|make)\s+(an?|the)?\s*(image|picture|photo|illustration|logo|poster|wallpaper|banner)\s+/i.test(
      trimmed,
    ),
    prompt: trimmed,
  };
}
