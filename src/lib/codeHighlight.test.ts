import { describe, expect, it } from "vitest";
import { codeHighlightClasses, highlightCodeHtml, normalizeCodeLanguage } from "./codeHighlight";

describe("code highlighting", () => {
  it("highlights supported JavaScript while escaping code text", () => {
    const html = highlightCodeHtml('const value = "<unsafe>";', "javascript");

    expect(html).toContain("tok-keyword");
    expect(html).toContain("&lt;unsafe&gt;");
    expect(html).not.toContain("<unsafe>");
  });

  it("returns decoration ranges for supported code blocks", () => {
    const ranges = codeHighlightClasses("const value = 1;", "js");

    expect(ranges.length).toBeGreaterThan(0);
    expect(ranges[0]).toMatchObject({ from: 0, to: 5, className: expect.stringContaining("tok-keyword") });
  });

  it("normalizes language aliases and leaves unknown languages plain", () => {
    expect(normalizeCodeLanguage("language-TSX")).toBe("tsx");
    expect(highlightCodeHtml("plain & text", "unknown")).toBe("plain &amp; text");
  });

  it("highlights common JSON fences through the JavaScript parser", () => {
    const html = highlightCodeHtml('{"enabled": true}', "jsonc");

    expect(html).toContain("tok-string");
    expect(html).toContain("tok-bool");
  });
});
