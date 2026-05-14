import { appEnv, isMistralConfigured } from "@/lib/env";

const MISTRAL_API_BASE_URL = "https://api.mistral.ai/v1";
const MISTRAL_IMAGE_URL = `${MISTRAL_API_BASE_URL}/image/generate`;

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

const RATIO_DIMS: Record<ImageRatio, { width: number; height: number }> = {
  "1:1": { width: 1024, height: 1024 },
  "16:9": { width: 1280, height: 720 },
  "9:16": { width: 720, height: 1280 },
  "3:2": { width: 1200, height: 800 },
  "2:3": { width: 800, height: 1200 },
  "4:3": { width: 1200, height: 900 },
};

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

function mistralHeaders(json = true): Record<string, string> {
  if (!isMistralConfigured) {
    throw new Error("Supernova is not configured. Set VITE_MISTRAL_API_KEY.");
  }
  return {
    Authorization: `Bearer ${appEnv.mistral.imageApiKey}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

export function buildImagePrompt(prompt: string, style: ImageStyle, ratio: ImageRatio = "1:1") {
  const hint = STYLE_HINTS[style];
  const qualityHint = STYLE_QUALITY_SUFFIX[style] ?? "strong composition, high detail, crisp subject separation";
  return [prompt.trim(), hint, qualityHint, `aspect ratio ${ratio}`, NEGATIVE_HINT].filter(Boolean).join(", ");
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read generated image"));
    reader.readAsDataURL(blob);
  });
}

function asImageUrl(value: string, mime = "image/png") {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("data:image/")) {
    return trimmed;
  }
  if (/^[A-Za-z0-9+/=\s]+$/.test(trimmed) && trimmed.length > 120) {
    return `data:${mime};base64,${trimmed.replace(/\s/g, "")}`;
  }
  return "";
}

function collectImages(value: unknown, urls = new Set<string>()): Set<string> {
  if (!value) return urls;
  if (Array.isArray(value)) {
    value.forEach((item) => collectImages(item, urls));
    return urls;
  }
  if (typeof value !== "object") return urls;

  const row = value as Record<string, unknown>;
  const direct = row.url ?? row.image_url ?? row.b64_json ?? row.base64 ?? row.image;
  if (typeof direct === "string") {
    const mime = typeof row.mime_type === "string" ? row.mime_type : typeof row.mime === "string" ? row.mime : "image/png";
    const url = asImageUrl(direct, mime);
    if (url) urls.add(url);
  }

  for (const key of ["images", "data", "output", "outputs", "files", "artifacts", "content"]) {
    if (key in row) collectImages(row[key], urls);
  }

  return urls;
}

function collectFileIds(value: unknown, ids = new Set<string>()): Set<string> {
  if (!value) return ids;
  if (Array.isArray(value)) {
    value.forEach((item) => collectFileIds(item, ids));
    return ids;
  }
  if (typeof value !== "object") return ids;

  const row = value as Record<string, unknown>;
  if (typeof row.file_id === "string" && row.file_id.trim()) ids.add(row.file_id.trim());

  for (const key of ["content", "outputs", "output", "data", "files", "artifacts", "messages"]) {
    if (key in row) collectFileIds(row[key], ids);
  }

  return ids;
}

async function downloadMistralFile(fileId: string, signal?: AbortSignal): Promise<string[]> {
  const endpoints = [
    `${MISTRAL_API_BASE_URL}/files/${encodeURIComponent(fileId)}/content`,
    `${MISTRAL_API_BASE_URL}/files/${encodeURIComponent(fileId)}/download`,
  ];

  let lastError = "";
  for (const endpoint of endpoints) {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: mistralHeaders(false),
      signal,
    });
    const contentType = response.headers.get("content-type") ?? "";

    if (!response.ok) {
      lastError = `${response.status} ${await response.text().catch(() => response.statusText)}`;
      continue;
    }

    if (contentType.startsWith("image/") || contentType === "application/octet-stream") {
      return [await blobToDataUrl(await response.blob())];
    }

    const text = await response.text();
    try {
      return [...collectImages(JSON.parse(text))];
    } catch {
      const url = asImageUrl(text, contentType || "image/png");
      return url ? [url] : [];
    }
  }

  throw new Error(`Could not download generated Mistral file ${fileId}: ${lastError}`);
}

async function extractMistralImages(data: unknown, count: number, signal?: AbortSignal) {
  const urls = [...collectImages(data)];
  for (const fileId of collectFileIds(data)) {
    if (urls.length >= count) break;
    urls.push(...(await downloadMistralFile(fileId, signal)));
  }
  return [...new Set(urls)].slice(0, count);
}

async function readImageResponse(response: Response, count: number, signal?: AbortSignal) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.startsWith("image/") || contentType === "application/octet-stream") {
    return [await blobToDataUrl(await response.blob())];
  }

  const text = await response.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    const url = asImageUrl(text, contentType || "image/png");
    return url ? [url] : [];
  }

  return extractMistralImages(data, count, signal);
}

async function generateDirectImage(prompt: string, ratio: ImageRatio, count: number, signal?: AbortSignal) {
  const dims = RATIO_DIMS[ratio];
  const response = await fetch(MISTRAL_IMAGE_URL, {
    method: "POST",
    headers: mistralHeaders(),
    signal,
    body: JSON.stringify({
      model: appEnv.mistral.imageModel,
      prompt,
      n: count,
      count,
      width: dims.width,
      height: dims.height,
      response_format: "url",
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Mistral image endpoint ${response.status}: ${detail.slice(0, 260) || response.statusText}`);
  }

  return readImageResponse(response, count, signal);
}

async function generateWithImageAgent(prompt: string, count: number, signal?: AbortSignal) {
  const agentResponse = await fetch(`${MISTRAL_API_BASE_URL}/agents`, {
    method: "POST",
    headers: mistralHeaders(),
    signal,
    body: JSON.stringify({
      model: appEnv.mistral.imageModel,
      name: "Supernova Image Agent",
      description: "Generates images for Supernova.",
      instructions: "Use the image_generation tool whenever the user asks for an image.",
      tools: [{ type: "image_generation" }],
      completion_args: { temperature: 0.3, top_p: 0.95 },
    }),
  });

  if (!agentResponse.ok) {
    const detail = await agentResponse.text().catch(() => "");
    throw new Error(`Mistral image agent ${agentResponse.status}: ${detail.slice(0, 260) || agentResponse.statusText}`);
  }

  const agent = (await agentResponse.json()) as { id?: string };
  if (!agent.id) throw new Error("Mistral image agent response did not include an agent id.");

  const conversationResponse = await fetch(`${MISTRAL_API_BASE_URL}/conversations`, {
    method: "POST",
    headers: mistralHeaders(),
    signal,
    body: JSON.stringify({
      agent_id: agent.id,
      inputs: prompt,
    }),
  });

  if (!conversationResponse.ok) {
    const detail = await conversationResponse.text().catch(() => "");
    throw new Error(`Mistral image conversation ${conversationResponse.status}: ${detail.slice(0, 260) || conversationResponse.statusText}`);
  }

  return readImageResponse(conversationResponse, count, signal);
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

  let urls: string[] = [];
  let directError: unknown;
  try {
    urls = await generateDirectImage(finalPrompt, ratio, count, opts.signal);
  } catch (error) {
    directError = error;
    urls = await generateWithImageAgent(finalPrompt, count, opts.signal);
  }

  if (!urls.length) {
    const detail = directError instanceof Error ? ` Direct endpoint: ${directError.message}` : "";
    throw new Error(`Mistral returned no generated image.${detail}`);
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
