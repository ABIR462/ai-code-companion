import { describe, expect, it } from "vitest";
import { buildImagePrompt } from "@/lib/supernovaChat";

describe("buildImagePrompt", () => {
  it("adds stronger quality and cleanup hints", () => {
    const prompt = buildImagePrompt("luxury watch on marble", "realistic", "3:2");

    expect(prompt).toContain("luxury watch on marble");
    expect(prompt).toContain("85mm lens look");
    expect(prompt).toContain("aspect ratio 3:2");
    expect(prompt).toContain("no watermark");
  });
});
