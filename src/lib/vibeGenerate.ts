import { streamWebsiteAI } from "@/lib/websiteAI";

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
    ? "You are a principal web engineer and product designer. Update the user's existing site based on their new instruction. Preserve working functionality, improve UX where useful, and return ONLY the full updated single-file HTML with inline CSS and JavaScript."
    : "You are a principal web engineer and product designer. Generate a complete premium single-file HTML website with inline CSS and JavaScript. Prioritize strong visual hierarchy, polished responsive UI, multiple relevant real image sections, accessible semantics, thoughtful interactions, and conversion-focused UX. Return ONLY the HTML.";

  const messages = [
    { role: "system" as const, content: system },
    ...(previousCode
      ? [{ role: "assistant" as const, content: previousCode }]
      : []),
    { role: "user" as const, content: prompt },
  ];

  try {
    await streamWebsiteAI(
      messages,
      (chunk) => {
        onPhase("streaming");
        onToken(chunk);
      },
      { timeoutMs: 180_000 },
    );
    onPhase("done");
  } catch (e) {
    onPhase("error");
    throw e;
  }
}
