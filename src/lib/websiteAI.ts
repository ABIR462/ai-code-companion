import { getOpenRouterHeaders, OPENROUTER_CHAT_URL, VIBE_MODEL, explainOpenRouterError } from "@/lib/openrouter";

export type AIMessage = { role: "system" | "user" | "assistant" | string; content: string };
export type AIProvider = "DeepSeek";

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

function parseOpenRouterContent(data: any): string {
  const message = data?.choices?.[0]?.message;
  const direct = message?.content;
  if (typeof direct === "string") return direct.trim();
  if (Array.isArray(direct)) {
    return direct
      .map((part) => (typeof part?.text === "string" ? part.text : typeof part === "string" ? part : ""))
      .join("")
      .trim();
  }
  return "";
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

async function callOpenRouter(messages: AIMessage[], signal?: AbortSignal): Promise<string> {
  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers: getOpenRouterHeaders(),
    signal,
    body: JSON.stringify({
      model: VIBE_MODEL,
      messages,
      temperature: 0.15,
      max_tokens: 8192,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${explainOpenRouterError(response.status, text)}${text ? `: ${text.slice(0, 220)}` : ""}`);
  }

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    return text.trim();
  }
  const content = parseOpenRouterContent(data);
  if (!content) {
    const providerError = data?.error?.message || data?.choices?.[0]?.finish_reason;
    throw new Error(providerError ? `DeepSeek returned no HTML: ${providerError}` : "DeepSeek returned an empty response");
  }
  return content;
}

async function streamOpenRouter(
  messages: AIMessage[],
  onDelta: (chunk: string, full: string) => void,
  signal: AbortSignal,
): Promise<string> {
  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers: getOpenRouterHeaders(),
    signal,
    body: JSON.stringify({
      model: VIBE_MODEL,
      messages,
      temperature: 0.15,
      max_tokens: 8192,
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new Error(`${explainOpenRouterError(response.status, detail)}${detail ? `: ${detail.slice(0, 220)}` : ""}`);
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
      const json = JSON.parse(payload);
      if (json?.error?.message) {
        providerError = json.error.message;
        return;
      }
      const delta = json?.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta) {
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
  if (providerError) throw new Error(`DeepSeek stream failed: ${providerError}`);
  throw new Error("DeepSeek returned an empty stream");
}

export async function streamWebsiteAI(
  messages: AIMessage[],
  onDelta: (chunk: string, full: string) => void,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<{ content: string; provider: AIProvider }> {
  return withTimeout(async (signal) => {
    try {
      const content = await streamOpenRouter(messages, onDelta, signal);
      return { content, provider: "DeepSeek" as const };
    } catch (error) {
      if (isAbortError(error) || signal.aborted) throw error;
      const content = await callOpenRouter(messages, signal);
      onDelta(content, content);
      return { content, provider: "DeepSeek" as const };
    }
  }, options.timeoutMs ?? 180_000, options.signal);
}

export async function completeWebsiteAI(
  messages: AIMessage[],
  options: { timeoutMs?: number } = {},
): Promise<{ content: string; provider: AIProvider }> {
  return withTimeout(async (signal) => {
    const content = await callOpenRouter(messages, signal);
    return { content, provider: "DeepSeek" as const };
  }, options.timeoutMs ?? 120_000);
}
