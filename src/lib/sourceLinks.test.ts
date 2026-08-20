import { describe, expect, it } from "vitest";
import { sourceLinkAtPosition } from "./sourceLinks";

describe("source links", () => {
  it("finds Markdown link destinations when Ctrl/Cmd-clicking the label", () => {
    const source = "Read [the guide](../guide.md#start) now";
    expect(sourceLinkAtPosition(source, source.indexOf("guide"))).toBe("../guide.md#start");
    expect(sourceLinkAtPosition(source, source.indexOf("the guide"))).toBe("../guide.md#start");
  });

  it("finds safe bare URLs and ignores unsafe protocols", () => {
    const source = "https://example.com/docs and javascript:alert(1)";
    expect(sourceLinkAtPosition(source, 8)).toBe("https://example.com/docs");
    expect(sourceLinkAtPosition(source, source.indexOf("javascript") + 3)).toBeNull();
  });
});
