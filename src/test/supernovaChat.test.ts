import { describe, expect, it } from "vitest";
import { buildImagePrompt, pollinationsUrl } from "@/lib/supernovaChat";

describe("buildImagePrompt", () => {
  it("adds stronger quality and cleanup hints", () => {
    const prompt = buildImagePrompt("luxury watch on marble", "realistic", "3:2");

    expect(prompt).toContain("luxury watch on marble");
    expect(prompt).toContain("85mm lens look");
    expect(prompt).toContain("aspect ratio 3:2");
    expect(prompt).toContain("no watermark");
  });
});

describe("pollinationsUrl", () => {
  it("uses explicit dimensions and configured model values", () => {
    const url = pollinationsUrl("test prompt", "16:9", 42, "flux");
    const parsed = new URL(url);

    expect(parsed.hostname).toBe("image.pollinations.ai");
    expect(parsed.searchParams.get("width")).toBe("1280");
    expect(parsed.searchParams.get("height")).toBe("720");
    expect(parsed.searchParams.get("model")).toBe("flux");
    expect(parsed.searchParams.get("enhance")).toBe("true");
    expect(parsed.searchParams.get("safe")).toBe("true");
  });
});
