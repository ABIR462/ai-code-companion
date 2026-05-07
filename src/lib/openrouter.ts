import { appEnv, isOpenRouterConfigured } from "@/lib/env";

export const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
export const VIBE_MODEL = appEnv.openrouter.model || "deepseek/deepseek-v3.2";

export function getOpenRouterHeaders(): Record<string, string> {
  if (!isOpenRouterConfigured) {
    throw new Error("OpenRouter API key is not configured");
  }
  return {
    Authorization: `Bearer ${appEnv.openrouter.apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": typeof window !== "undefined" ? window.location.origin : "https://matrixbook.app",
    "X-OpenRouter-Title": "Matrixbook AI",
  };
}

export function explainOpenRouterError(status: number, detail = "") {
  const message = detail.toLowerCase();
  if (status === 401 || status === 403) return "OpenRouter rejected the API key";
  if (status === 402) return "OpenRouter credits or quota are exhausted";
  if (status === 408 || status === 524 || message.includes("timeout")) {
    return "The AI provider timed out. Try a shorter prompt or press Generate again";
  }
  if (status === 429) return "OpenRouter is rate limited. Please wait a moment and retry";
  if (status >= 500) return "OpenRouter provider is temporarily unavailable";
  return `OpenRouter request failed (${status})`;
}
