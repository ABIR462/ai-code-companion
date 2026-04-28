import { appEnv, sambanovaMissingEnvKeys } from "@/lib/env";

export const SAMBANOVA_CHAT_URL = appEnv.sambanova.chatEndpoint;
export const SAMBANOVA_MODEL = appEnv.sambanova.model;
export const SAMBANOVA_KEY_STORAGE = "matrix_sambanova_api_key";

export function getStoredSambaNovaKey() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(SAMBANOVA_KEY_STORAGE)?.trim() ?? "";
}

export function saveStoredSambaNovaKey(key: string) {
  if (typeof window === "undefined") return;
  const next = key.trim();
  if (next) window.localStorage.setItem(SAMBANOVA_KEY_STORAGE, next);
  else window.localStorage.removeItem(SAMBANOVA_KEY_STORAGE);
}

export function getSambaNovaApiKey() {
  return appEnv.sambanova.apiKey || getStoredSambaNovaKey();
}

export function hasSambaNovaConfig() {
  return Boolean(getSambaNovaApiKey() && SAMBANOVA_CHAT_URL && SAMBANOVA_MODEL);
}

export function getSambaNovaHeaders() {
  const apiKey = getSambaNovaApiKey();
  if (!apiKey || !SAMBANOVA_CHAT_URL || !SAMBANOVA_MODEL) {
    const missing = [...sambanovaMissingEnvKeys];
    if (!apiKey && !missing.includes("VITE_SAMBANOVA_API_KEY")) {
      missing.push("VITE_SAMBANOVA_API_KEY");
    }
    throw new Error(`Missing SambaNova API values: ${missing.join(", ")}`);
  }

  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

export function explainSambaNovaError(status: number) {
  if (status === 401 || status === 403) return "SambaNova API key rejected — check the key";
  if (status === 429) return "SambaNova rate limit hit — wait a moment and retry";
  if (status === 400 || status === 422) return "SambaNova rejected the request — shorten the prompt";
  if (status === 502 || status === 503 || status === 504) return "SambaNova is temporarily unavailable — retry";
  return `SambaNova error ${status}`;
}

export async function callSambaNovaChat(
  messages: { role: string; content: string }[],
  options: { signal?: AbortSignal; maxTokens?: number; temperature?: number } = {},
) {
  const response = await fetch(SAMBANOVA_CHAT_URL, {
    method: "POST",
    headers: getSambaNovaHeaders(),
    signal: options.signal,
    body: JSON.stringify({
      model: SAMBANOVA_MODEL,
      messages,
      temperature: options.temperature ?? 0.1,
      top_p: 0.1,
      max_tokens: options.maxTokens ?? 4096,
    }),
  });

  if (!response.ok) {
    let details = "";
    try {
      details = await response.text();
    } catch {
      details = "";
    }
    throw new Error(`${explainSambaNovaError(response.status)}${details ? `: ${details.slice(0, 240)}` : ""}`);
  }

  const data = await response.json();
  return String(data?.choices?.[0]?.message?.content ?? "").trim();
}

if (sambanovaMissingEnvKeys.length > 0) {
  console.info(
    `[Matrix AI] Optional SambaNova values missing: ${sambanovaMissingEnvKeys.join(", ")}. ` +
      "Users can still add a key inside the IDE settings.",
  );
}
