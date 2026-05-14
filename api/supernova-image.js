const MISTRAL_API_BASE_URL = "https://api.mistral.ai/v1";

const ALLOWED_RATIOS = new Set(["1:1", "16:9", "9:16", "3:2", "2:3", "4:3"]);
const REQUEST_TIMEOUT_MS = 55_000;

function withTimeout(signalLabel, task) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return Promise.resolve()
    .then(() => task(controller.signal))
    .catch((error) => {
      if (error && error.name === "AbortError") {
        const err = new Error(`${signalLabel} timed out after ${Math.round(REQUEST_TIMEOUT_MS / 1000)}s`);
        err.status = 504;
        throw err;
      }
      throw error;
    })
    .finally(() => clearTimeout(timer));
}

function getImageConfig() {
  const apiKey =
    process.env.MISTRAL_IMAGE_API_KEY ||
    process.env.VITE_MISTRAL_IMAGE_API_KEY ||
    process.env.MISTRAL_API_KEY ||
    process.env.VITE_MISTRAL_API_KEY;
  const imageModel = process.env.MISTRAL_IMAGE_MODEL || process.env.VITE_MISTRAL_IMAGE_MODEL || "mistral-image-latest";
  const agentId = process.env.MISTRAL_IMAGE_AGENT_ID || process.env.VITE_MISTRAL_IMAGE_AGENT_ID || "";
  const agentModel =
    process.env.MISTRAL_IMAGE_AGENT_MODEL ||
    process.env.VITE_MISTRAL_IMAGE_AGENT_MODEL ||
    process.env.MISTRAL_AGENT_MODEL ||
    "mistral-medium-latest";

  if (!apiKey) {
    const err = new Error("Missing Mistral image API key. Set MISTRAL_IMAGE_API_KEY in Vercel Environment Variables.");
    err.status = 500;
    throw err;
  }

  return { apiKey, imageModel, agentId, agentModel };
}

function jsonHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

function toDataUrl(buffer, contentType = "image/png") {
  return `data:${contentType};base64,${Buffer.from(buffer).toString("base64")}`;
}

function asImageUrl(value, mime = "image/png") {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("data:image/")) return trimmed;
  if (/^[A-Za-z0-9+/=\s]+$/.test(trimmed) && trimmed.length > 120) {
    return `data:${mime};base64,${trimmed.replace(/\s/g, "")}`;
  }
  return "";
}

function collectImages(value, urls = new Set()) {
  if (!value) return urls;
  if (Array.isArray(value)) {
    value.forEach((item) => collectImages(item, urls));
    return urls;
  }
  if (typeof value !== "object") return urls;

  const direct =
    value.url ||
    (value.image_url && typeof value.image_url === "object" ? value.image_url.url : value.image_url) ||
    value.b64_json ||
    value.base64 ||
    value.image;
  if (typeof direct === "string") {
    const url = asImageUrl(direct, value.mime_type || value.mime || "image/png");
    if (url) urls.add(url);
  }

  for (const key of ["images", "data", "output", "outputs", "files", "artifacts", "content"]) {
    if (key in value) collectImages(value[key], urls);
  }

  return urls;
}

function collectFileIds(value, ids = new Set()) {
  if (!value) return ids;
  if (Array.isArray(value)) {
    value.forEach((item) => collectFileIds(item, ids));
    return ids;
  }
  if (typeof value !== "object") return ids;

  if (typeof value.file_id === "string" && value.file_id.trim()) ids.add(value.file_id.trim());

  for (const key of ["content", "outputs", "output", "data", "files", "artifacts", "messages"]) {
    if (key in value) collectFileIds(value[key], ids);
  }

  return ids;
}

function fileIdToImageUrl(fileId) {
  return `/api/supernova-file?fileId=${encodeURIComponent(fileId)}`;
}

async function readMistralResponse(response, count) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.startsWith("image/") || contentType === "application/octet-stream") {
    return [toDataUrl(await response.arrayBuffer(), contentType || "image/png")];
  }

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const url = asImageUrl(text, contentType || "image/png");
    return url ? [url] : [];
  }

  const urls = [...collectImages(data)];
  for (const fileId of collectFileIds(data)) {
    if (urls.length >= count) break;
    urls.push(fileIdToImageUrl(fileId));
  }
  return [...new Set(urls)].slice(0, count);
}

async function createImageAgent({ apiKey, agentModel, imageModel, signal }) {
  const response = await fetch(`${MISTRAL_API_BASE_URL}/agents`, {
    method: "POST",
    headers: jsonHeaders(apiKey),
    signal,
    body: JSON.stringify({
      model: agentModel,
      name: "Supernova Image Agent",
      description: "Generates images for Supernova.",
      instructions: `Use the image_generation tool whenever the user asks for an image. Preferred image model label from configuration: ${imageModel}.`,
      tools: [{ type: "image_generation" }],
      completion_args: { temperature: 0.3, top_p: 0.95 },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const err = new Error(`Image agent ${response.status}: ${detail.slice(0, 240) || response.statusText}`);
    err.status = response.status;
    throw err;
  }

  const data = await response.json();
  if (!data.id) throw new Error("Mistral image agent response did not include an agent id.");
  return data.id;
}

async function generateWithAgent({ apiKey, agentId: configuredAgentId, agentModel, imageModel, prompt, count, signal }) {
  const agentId = configuredAgentId || (await createImageAgent({ apiKey, agentModel, imageModel, signal }));
  const response = await fetch(`${MISTRAL_API_BASE_URL}/conversations`, {
    method: "POST",
    headers: jsonHeaders(apiKey),
    signal,
    body: JSON.stringify({ agent_id: agentId, inputs: prompt }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const err = new Error(`Image conversation ${response.status}: ${detail.slice(0, 240) || response.statusText}`);
    err.status = response.status;
    throw err;
  }

  return readMistralResponse(response, count);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const config = getImageConfig();
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const prompt = String(body.prompt || "").trim();
    const ratio = ALLOWED_RATIOS.has(body.ratio) ? body.ratio : "1:1";
    const count = Math.min(Math.max(Number(body.count) || 1, 1), 4);

    if (!prompt) return res.status(400).json({ error: "Prompt is required" });

    const promptWithRatio = `${prompt}\n\nRequired aspect ratio: ${ratio}.`;
    const urls = await withTimeout("Mistral image generation", (signal) => {
      return generateWithAgent({ ...config, prompt: promptWithRatio, count, signal });
    });

    if (!urls.length) {
      return res.status(502).json({
        error: "Mistral returned no generated image.",
      });
    }

    return res.status(200).json({ images: urls.map((url) => ({ url })) });
  } catch (error) {
    const status = Number(error.status) || 500;
    return res.status(status >= 400 && status < 600 ? status : 500).json({
      error: error.message || "Supernova image generation failed",
    });
  }
};
