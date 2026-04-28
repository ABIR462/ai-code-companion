import { appEnv, mistralMissingEnvKeys } from "@/lib/env";

export const MISTRAL_CHAT_URL = appEnv.mistral.chatEndpoint;
export const MISTRAL_MODEL = appEnv.mistral.model;

export const hasMistralConfig = mistralMissingEnvKeys.length === 0;

export function getMistralHeaders() {
  if (!hasMistralConfig) {
    throw new Error(
      `Missing AI .env values: ${mistralMissingEnvKeys.join(", ")}`,
    );
  }

  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${appEnv.mistral.apiKey}`,
  };
}

export function explainMistralError(status: number) {
  if (status === 401) return "Invalid Mistral API key (401) — check VITE_MISTRAL_API_KEY";
  if (status === 429) return "Rate limit hit — wait a moment and retry (429)";
  if (status === 422) return "Bad request to AI (422)";
  if (status === 504) return "AI server timeout — try a shorter / simpler prompt (504)";
  if (status === 502 || status === 503) return `AI service unavailable (${status}) — try again`;
  return `AI error ${status}`;
}

if (!hasMistralConfig) {
  console.error(
    `[Matrix AI] Missing AI .env values: ${mistralMissingEnvKeys.join(", ")}. ` +
      "Mistral calls will fail until these VITE_ variables are set and Vite is restarted.",
  );
}

