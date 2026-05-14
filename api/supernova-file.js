const MISTRAL_API_BASE_URL = "https://api.mistral.ai/v1";

function getApiKey() {
  const apiKey =
    process.env.MISTRAL_IMAGE_API_KEY ||
    process.env.VITE_MISTRAL_IMAGE_API_KEY ||
    process.env.MISTRAL_API_KEY ||
    process.env.VITE_MISTRAL_API_KEY;

  if (!apiKey) {
    const err = new Error("Missing Mistral image API key. Set MISTRAL_IMAGE_API_KEY in Vercel Environment Variables.");
    err.status = 500;
    throw err;
  }

  return apiKey;
}

async function fetchFile(fileId, apiKey) {
  const endpoints = [
    `${MISTRAL_API_BASE_URL}/files/${encodeURIComponent(fileId)}/content`,
    `${MISTRAL_API_BASE_URL}/files/${encodeURIComponent(fileId)}/download`,
  ];

  let lastError = "";
  for (const endpoint of endpoints) {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (response.ok) return response;
    lastError = `${response.status} ${(await response.text().catch(() => response.statusText)).slice(0, 180)}`;
  }

  const err = new Error(`Could not download generated Mistral file: ${lastError}`);
  err.status = 502;
  throw err;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const rawUrl = req.url || "";
    const parsed = new URL(rawUrl, "http://localhost");
    const fileId = parsed.searchParams.get("fileId");
    if (!fileId) return res.status(400).json({ error: "fileId is required" });

    const response = await fetchFile(fileId, getApiKey());
    const contentType = response.headers.get("content-type") || "image/png";
    const buffer = Buffer.from(await response.arrayBuffer());

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.setHeader("Content-Length", String(buffer.length));
    return res.status(200).end(buffer);
  } catch (error) {
    const status = Number(error.status) || 500;
    return res.status(status >= 400 && status < 600 ? status : 500).json({
      error: error.message || "Could not stream Supernova image",
    });
  }
};
