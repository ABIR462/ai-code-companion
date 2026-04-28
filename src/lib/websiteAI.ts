import { MISTRAL_CHAT_URL, MISTRAL_MODEL, explainMistralError, getMistralHeaders, hasMistralConfig } from "@/lib/mistral";
import { callSambaNovaChat, hasSambaNovaConfig } from "@/lib/sambanova";

export type AIMessage = { role: string; content: string };
export type AIProvider = "Mistral" | "SambaNova";

async function withTimeout<T>(task: (signal: AbortSignal) => Promise<T>, timeoutMs: number) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await task(controller.signal);
  } finally {
    window.clearTimeout(timer);
  }
}

async function callMistral(messages: AIMessage[], signal?: AbortSignal, attempt = 1): Promise<string> {
  const response = await fetch(MISTRAL_CHAT_URL, {
    method: "POST",
    headers: getMistralHeaders(),
    signal,
    body: JSON.stringify({
      model: MISTRAL_MODEL,
      messages,
      temperature: 0.15,
      max_tokens: 4096,
    }),
  });

  if ((response.status === 502 || response.status === 503 || response.status === 504) && attempt < 2) {
    await new Promise((resolve) => window.setTimeout(resolve, 1200));
    return callMistral(messages, signal, attempt + 1);
  }

  if (!response.ok) {
    let details = "";
    try {
      details = await response.text();
    } catch {
      details = "";
    }
    throw new Error(`${explainMistralError(response.status)}${details ? `: ${details.slice(0, 220)}` : ""}`);
  }

  const data = await response.json();
  return String(data?.choices?.[0]?.message?.content ?? "").trim();
}

export async function completeWebsiteAI(
  messages: AIMessage[],
  options: { timeoutMs?: number; prefer?: "mistral" | "sambanova" } = {},
): Promise<{ content: string; provider: AIProvider }> {
  const errors: string[] = [];
  const order = options.prefer === "sambanova" ? ["sambanova", "mistral"] : ["mistral", "sambanova"];

  return withTimeout(async (signal) => {
    for (const provider of order) {
      if (provider === "mistral" && hasMistralConfig) {
        try {
          const content = await callMistral(messages, signal);
          if (content) return { content, provider: "Mistral" as const };
          errors.push("Mistral returned empty content");
        } catch (error) {
          errors.push(error instanceof Error ? error.message : "Mistral failed");
        }
      }

      if (provider === "sambanova" && hasSambaNovaConfig()) {
        try {
          const content = await callSambaNovaChat(messages, { signal, maxTokens: 4096, temperature: 0.1 });
          if (content) return { content, provider: "SambaNova" as const };
          errors.push("SambaNova returned empty content");
        } catch (error) {
          errors.push(error instanceof Error ? error.message : "SambaNova failed");
        }
      }
    }

    throw new Error(
      errors.length
        ? errors.join(" | ")
        : "No AI provider is configured. Add Mistral or SambaNova API settings.",
    );
  }, options.timeoutMs ?? 90_000);
}

