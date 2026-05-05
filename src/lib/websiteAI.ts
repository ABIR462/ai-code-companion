import { MISTRAL_CHAT_URL, MISTRAL_MODEL, explainMistralError, getMistralHeaders, hasMistralConfig } from "@/lib/mistral";

export type AIMessage = { role: string; content: string };
export type AIProvider = "Mistral";

async function withTimeout<T>(
  task: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  externalSignal?: AbortSignal,
) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const onExternal = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", onExternal);
  }
  try {
    return await task(controller.signal);
  } finally {
    window.clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener("abort", onExternal);
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
      temperature: 0.1,
      max_tokens: 8192,
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

/**
 * Stream a chat completion. Calls onDelta for every text token chunk as it arrives.
 * Returns the full concatenated text and which provider answered.
 */
export async function streamWebsiteAI(
  messages: AIMessage[],
  onDelta: (chunk: string, full: string) => void,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<{ content: string; provider: AIProvider }> {
  const errors: string[] = [];

  const tryStream = async (
    url: string,
    headers: Record<string, string>,
    model: string,
    signal: AbortSignal,
  ) => {
    const resp = await fetch(url, {
      method: "POST",
      headers,
      signal,
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.1,
        max_tokens: 8192,
        stream: true,
      }),
    });
    if (!resp.ok || !resp.body) {
      let detail = "";
      try { detail = await resp.text(); } catch {}
      throw new Error(`${explainMistralError(resp.status)}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
    }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const json = JSON.parse(payload);
          const delta = json?.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta) {
            full += delta;
            onDelta(delta, full);
          }
        } catch {
          buffer = line + "\n" + buffer;
          break;
        }
      }
    }
    return full;
  };

  return withTimeout(async (signal) => {
    if (hasMistralConfig) {
      try {
        const content = await tryStream(
          MISTRAL_CHAT_URL,
          getMistralHeaders() as any,
          MISTRAL_MODEL,
          signal,
        );
        if (content) return { content, provider: "Mistral" as const };
        errors.push("Mistral returned empty stream");
      } catch (e) {
        errors.push(e instanceof Error ? e.message : "Mistral stream failed");
      }
    }
    throw new Error(errors.length ? errors.join(" | ") : "Mistral AI is not configured — check your API key");
  }, options.timeoutMs ?? 120_000, options.signal);
}

export async function completeWebsiteAI(
  messages: AIMessage[],
  options: { timeoutMs?: number } = {},
): Promise<{ content: string; provider: AIProvider }> {
  const errors: string[] = [];

  return withTimeout(async (signal) => {
    if (hasMistralConfig) {
      try {
        const content = await callMistral(messages, signal);
        if (content) return { content, provider: "Mistral" as const };
        errors.push("Mistral returned empty content");
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "Mistral failed");
      }
    }

    throw new Error(
      errors.length
        ? errors.join(" | ")
        : "Mistral AI is not configured. Check your API key.",
    );
  }, options.timeoutMs ?? 90_000);
}

