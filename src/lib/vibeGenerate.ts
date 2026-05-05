import { openrouter, VIBE_MODEL } from "./openrouter";

export type VibePhase = "thinking" | "streaming" | "done" | "error";

export async function generateSite(opts: {
  prompt: string;
  previousCode?: string; // pass on 2nd+ prompt to iterate
  onPhase: (p: VibePhase) => void;
  onToken: (chunk: string) => void;
}) {
  const { prompt, previousCode, onPhase, onToken } = opts;
  onPhase("thinking");

  const system = previousCode
    ? "You are a senior web engineer. Update the user's existing site based on their new instruction. Return ONLY the full updated single-file HTML (with inline CSS/JS)."
    : "You are a senior web engineer. Generate a complete, polished single-file HTML site (inline CSS/JS) for the user's prompt. Return ONLY the HTML.";

  const messages = [
    { role: "system" as const, content: system },
    ...(previousCode
      ? [{ role: "assistant" as const, content: previousCode }]
      : []),
    { role: "user" as const, content: prompt },
  ];

  try {
    const stream = await openrouter.chat.completions.create({
      model: VIBE_MODEL,
      messages,
      stream: true,
    });

    let started = false;
    for await (const part of stream) {
      const delta = part.choices?.[0]?.delta?.content ?? "";
      if (delta) {
        if (!started) {
          started = true;
          onPhase("streaming");
        }
        onToken(delta);
      }
    }
    onPhase("done");
  } catch (e) {
    onPhase("error");
    throw e;
  }
}
