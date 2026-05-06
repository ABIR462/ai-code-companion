import OpenAI from "openai";

const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
if (!apiKey) throw new Error("Missing VITE_OPENROUTER_API_KEY");

export const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey,
  dangerouslyAllowBrowser: true, // only if calling from client; prefer a server route
  defaultHeaders: {
    "HTTP-Referer": window.location.origin,
    "X-OpenRouter-Title": "AI Code Companion",
  },
});

export const VIBE_MODEL =
  import.meta.env.VITE_OPENROUTER_MODEL ?? "inclusionai/ling-2.6-1t:free";
