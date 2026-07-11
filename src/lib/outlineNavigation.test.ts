import { describe, expect, it } from "vitest";
import { activeOutlineHeadingKey, lineNumberAtOffset, outlineHeadingKey } from "./outlineNavigation";

describe("outline navigation", () => {
  const headings = [
    { id: "intro", line: 2 },
    { id: "details", line: 8 },
    { id: "deep-dive", line: 12 }
  ];

  it("maps source offsets to zero-based line numbers", () => {
    const markdown = "zero\none\ntwo";

    expect(lineNumberAtOffset(markdown, -20)).toBe(0);
    expect(lineNumberAtOffset(markdown, 0)).toBe(0);
    expect(lineNumberAtOffset(markdown, markdown.indexOf("one"))).toBe(1);
    expect(lineNumberAtOffset(markdown, markdown.length + 20)).toBe(2);
  });

  it("keeps outline heading keys stable across duplicate heading text", () => {
    expect(outlineHeadingKey({ id: "intro", line: 2 })).toBe("intro:2");
    expect(outlineHeadingKey({ id: "intro", line: 14 })).toBe("intro:14");
  });

  it("selects the nearest heading above the current cursor line", () => {
    expect(activeOutlineHeadingKey(headings, 1)).toBeNull();
    expect(activeOutlineHeadingKey(headings, 2)).toBe("intro:2");
    expect(activeOutlineHeadingKey(headings, 11)).toBe("details:8");
    expect(activeOutlineHeadingKey(headings, 40)).toBe("deep-dive:12");
  });

  it("does not rely on outline input being pre-sorted", () => {
    expect(activeOutlineHeadingKey([
      { id: "deep-dive", line: 12 },
      { id: "intro", line: 2 },
      { id: "details", line: 8 }
    ], 10)).toBe("details:8");
  });
});
