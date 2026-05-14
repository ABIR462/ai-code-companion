const MISTRAL_API_BASE_URL = "https://api.mistral.ai/v1";

const RATIO_DIMS = {
  "1:1": { width: 1024, height: 1024 },
  "16:9": { width: 1280, height: 720 },
  "9:16": { width: 720, height: 1280 },
  "3:2": { width: 1200, height: 800 },
  "2:3": { width: 800, height: 1200 },
  "4:3": { width: 1200, height: 900 },
};

function getImageConfig() {
  const apiKey =
    process.env.MISTRAL_IMAGE_API_KEY ||
    process.env.VITE_MISTRAL_IMAGE_API_KEY ||
    process.env.MISTRAL_API_KEY ||
    process.env.VITE_MISTRAL_API_KEY;
  const imageModel = process.env.MISTRAL_IMAGE_MODEL || process.env.VITE_MISTRAL_IMAGE_MODEL || "mistral-image-latest";
  const agentModel = process.env.MISTRAL_IMAGE_AGENT_MODEL || process.env.VITE_MISTRAL_IMAGE_AGENT_MODEL || "mistral-medium-latest";

  if (!apiKey) {
    const err = new Error("Missing Mistral image API key. Set MISTRAL_IMAGE_API_KEY or VITE_MISTRAL_IMAGE_API_KEY.");
    err.status = 500;
    throw err;
  }

  return { apiKey, imageModel, agentModel };
}

function jsonHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

function fileHeaders(apiKey) {
  return { Authorization: `Bearer ${apiKey}` };
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

  const direct = value.url || value.image_url || value.b64_json || value.base64 || value.image;
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

async function readMistralResponse(response, apiKey, count) {
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
    urls.push(...(await downloadMistralFile(fileId, apiKey)));
  }
  return [...new Set(urls)].slice(0, count);
}

async function downloadMistralFile(fileId, apiKey) {
  const endpoints = [
    `${MISTRAL_API_BASE_URL}/files/${encodeURIComponent(fileId)}/content`,
    `${MISTRAL_API_BASE_URL}/files/${encodeURIComponent(fileId)}/download`,
  ];

  let lastError = "";
  for (const endpoint of endpoints) {
    const response = await fetch(endpoint, { method: "GET", headers: fileHeaders(apiKey) });
    const contentType = response.headers.get("content-type") || "";

    if (!response.ok) {
      lastError = `${response.status} ${(await response.text().catch(() => response.statusText)).slice(0, 180)}`;
      continue;
    }

    if (contentType.startsWith("image/") || contentType === "application/octet-stream") {
      return [toDataUrl(await response.arrayBuffer(), contentType || "image/png")];
    }

    return readMistralResponse(response, apiKey, 1);
  }

  throw new Error(`Could not download generated Mistral file ${fileId}: ${lastError}`);
}

async function generateDirect({ apiKey, imageModel, prompt, ratio, count }) {
  const dims = RATIO_DIMS[ratio] || RATIO_DIMS["1:1"];
  const response = await fetch(`${MISTRAL_API_BASE_URL}/image/generate`, {
    method: "POST",
    headers: jsonHeaders(apiKey),
    body: JSON.stringify({
      model: imageModel,
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
    const err = new Error(`Direct image endpoint ${response.status}: ${detail.slice(0, 240) || response.statusText}`);
    err.status = response.status;
    throw err;
  }

  return readMistralResponse(response, apiKey, count);
}

async function createImageAgent({ apiKey, agentModel }) {
  const response = await fetch(`${MISTRAL_API_BASE_URL}/agents`, {
    method: "POST",
    headers: jsonHeaders(apiKey),
    body: JSON.stringify({
      model: agentModel,
      name: "Supernova Image Agent",
      description: "Generates images for Supernova.",
      instructions: "Use the image_generation tool whenever the user asks for an image.",
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

async function generateWithAgent({ apiKey, agentModel, prompt, count }) {
  const agentId = await createImageAgent({ apiKey, agentModel });
  const response = await fetch(`${MISTRAL_API_BASE_URL}/conversations`, {
    method: "POST",
    headers: jsonHeaders(apiKey),
    body: JSON.stringify({ agent_id: agentId, inputs: prompt }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const err = new Error(`Image conversation ${response.status}: ${detail.slice(0, 240) || response.statusText}`);
    err.status = response.status;
    throw err;
  }

  return readMistralResponse(response, apiKey, count);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const config = getImageConfig();
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const prompt = String(body.prompt || "").trim();
    const ratio = RATIO_DIMS[body.ratio] ? body.ratio : "1:1";
    const count = Math.min(Math.max(Number(body.count) || 1, 1), 4);

    if (!prompt) return res.status(400).json({ error: "Prompt is required" });

    let urls = [];
    let directError = null;
    try {
      urls = await generateDirect({ ...config, prompt, ratio, count });
    } catch (error) {
      directError = error;
      urls = await generateWithAgent({ ...config, prompt, count });
    }

    if (!urls.length) {
      return res.status(502).json({
        error: "Mistral returned no generated image.",
        detail: directError ? directError.message : undefined,
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
