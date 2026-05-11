import { appEnv, isMistralConfigured } from "@/lib/env";

export type AIMessage = { role: "system" | "user" | "assistant" | string; content: string };
export type AIProvider = "Mistral";

const chatCompletionsUrl = () => {
  const base = appEnv.mistral.apiBaseUrl.replace(/\/$/, "");
  return `${base}/chat/completions`;
};

function mistralHeaders(): Record<string, string> {
  if (!isMistralConfigured) {
    throw new Error("Codestral is not configured. Set VITE_MISTRAL_API_KEY and VITE_MISTRAL_MODEL in your environment.");
  }
  return {
    Authorization: `Bearer ${appEnv.mistral.apiKey}`,
    "Content-Type": "application/json",
  };
}

function explainMistralError(status: number, detail = "") {
  const message = detail.toLowerCase();
  if (status === 401 || status === 403) return "Codestral rejected the API key";
  if (status === 402 || status === 429) return "Codestral quota or rate limit - wait and retry";
  if (status === 408 || message.includes("timeout")) {
    return "The request timed out. Try a shorter prompt or generate again";
  }
  if (status >= 500) return "Codestral is temporarily unavailable";
  return `Codestral request failed (${status})`;
}

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
    else externalSignal.addEventListener("abort", onExternal, { once: true });
  }
  try {
    return await task(controller.signal);
  } finally {
    window.clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onExternal);
  }
}

function parseChatContent(data: unknown): string {
  const d = data as Record<string, unknown>;
  const message = d?.choices && Array.isArray(d.choices) ? (d.choices[0] as Record<string, unknown>)?.message : null;
  const direct = message?.content;
  if (typeof direct === "string") return direct.trim();
  if (Array.isArray(direct)) {
    return direct
      .map((part: unknown) => {
        const p = part as Record<string, unknown>;
        return typeof p?.text === "string" ? p.text : typeof part === "string" ? part : "";
      })
      .join("")
      .trim();
  }
  return "";
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

async function callMistral(messages: AIMessage[], signal?: AbortSignal): Promise<string> {
  const response = await fetch(chatCompletionsUrl(), {
    method: "POST",
    headers: mistralHeaders(),
    signal,
    body: JSON.stringify({
      model: appEnv.mistral.model,
      messages,
      temperature: 0.15,
      max_tokens: 8192,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${explainMistralError(response.status, text)}${text ? `: ${text.slice(0, 220)}` : ""}`);
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return text.trim();
  }
  const content = parseChatContent(data);
  if (!content) {
    const errObj = data as { error?: { message?: string }; choices?: { finish_reason?: string }[] };
    const providerError = errObj?.error?.message || errObj?.choices?.[0]?.finish_reason;
    throw new Error(providerError ? `Codestral returned no HTML: ${providerError}` : "Codestral returned an empty response");
  }
  return content;
}

async function streamMistral(
  messages: AIMessage[],
  onDelta: (chunk: string, full: string) => void,
  signal: AbortSignal,
): Promise<string> {
  const response = await fetch(chatCompletionsUrl(), {
    method: "POST",
    headers: mistralHeaders(),
    signal,
    body: JSON.stringify({
      model: appEnv.mistral.model,
      messages,
      temperature: 0.15,
      max_tokens: 8192,
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new Error(`${explainMistralError(response.status, detail)}${detail ? `: ${detail.slice(0, 220)}` : ""}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  let providerError = "";

  const processLine = (rawLine: string) => {
    let line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (!line.trim() || line.startsWith(":")) return;
    if (!line.startsWith("data:")) return;

    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") return;

    try {
      const json = JSON.parse(payload) as {
        error?: { message?: string };
        choices?: { delta?: { content?: string | unknown[] } }[];
      };
      if (json?.error?.message) {
        providerError = json.error.message;
        return;
      }
      const deltaRaw = json?.choices?.[0]?.delta?.content;
      let delta = "";
      if (typeof deltaRaw === "string") delta = deltaRaw;
      else if (Array.isArray(deltaRaw)) {
        delta = deltaRaw
          .map((part: unknown) => {
            const p = part as Record<string, unknown>;
            return typeof p?.text === "string" ? p.text : "";
          })
          .join("");
      }
      if (delta) {
        full += delta;
        onDelta(delta, full);
      }
    } catch {
      buffer = `${line}\n${buffer}`;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      processLine(line);
    }
  }

  decoder.decode();
  if (buffer.trim()) buffer.split("\n").forEach(processLine);

  if (full.trim()) return full.trim();
  if (providerError) throw new Error(`Codestral stream failed: ${providerError}`);
  throw new Error("Codestral returned an empty stream");
}

export async function streamWebsiteAI(
  messages: AIMessage[],
  onDelta: (chunk: string, full: string) => void,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<{ content: string; provider: AIProvider }> {
  return withTimeout(async (signal) => {
    try {
      const content = await streamMistral(messages, onDelta, signal);
      return { content, provider: "Mistral" as const };
    } catch (error) {
      if (isAbortError(error) || signal.aborted) throw error;
      const content = await callMistral(messages, signal);
      onDelta(content, content);
      return { content, provider: "Mistral" as const };
    }
  }, options.timeoutMs ?? 180_000, options.signal);
}

export async function completeWebsiteAI(
  messages: AIMessage[],
  options: { timeoutMs?: number } = {},
): Promise<{ content: string; provider: AIProvider }> {
  return withTimeout(async (signal) => {
    const content = await callMistral(messages, signal);
    return { content, provider: "Mistral" as const };
  }, options.timeoutMs ?? 120_000);
}
