import { describe, expect, it } from "vitest";
import { isMermaidLanguage, mermaidErrorSummary, mermaidRenderSkipReason } from "./mermaidPreview";

describe("Mermaid preview helpers", () => {
  it("recognizes only canonical Mermaid fence languages", () => {
    expect(isMermaidLanguage("mermaid")).toBe(true);
    expect(isMermaidLanguage(" Mermaid ")).toBe(true);
    expect(isMermaidLanguage("MERMAID")).toBe(true);
    expect(isMermaidLanguage('mermaid title="Plan"')).toBe(true);
    expect(isMermaidLanguage("flowchart")).toBe(false);
    expect(isMermaidLanguage("mindmap")).toBe(false);
    expect(isMermaidLanguage(null)).toBe(false);
  });

  it("limits oversized sources and excessive diagram counts", () => {
    expect(mermaidRenderSkipReason("x".repeat(100_000), 31)).toBeNull();
    expect(mermaidRenderSkipReason("x".repeat(100_001), 0)).toBe("source-too-large");
    expect(mermaidRenderSkipReason("flowchart LR", 32)).toBe("diagram-limit");
  });

  it("compacts renderer errors without exposing an unbounded message", () => {
    expect(mermaidErrorSummary(new Error("Parse error\non line 2\nUnexpected token"), "fallback"))
      .toBe("Parse error on line 2 Unexpected token");
    expect(mermaidErrorSummary({}, "fallback")).toBe("fallback");
    expect(mermaidErrorSummary("x".repeat(600), "fallback").length).toBe(320);
  });
});
