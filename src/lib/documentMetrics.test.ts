import { describe, expect, it } from "vitest";
import { getDocumentCursorPosition, getDocumentMetrics } from "./documentMetrics";

describe("document metrics", () => {
  it("counts empty documents without inventing a blank line", () => {
    expect(getDocumentMetrics("")).toEqual({
      lineCount: 0,
      charCount: 0
    });
  });

  it("counts lines and unicode code points in a single pass", () => {
    expect(getDocumentMetrics("A\n猫\n😀")).toEqual({
      lineCount: 3,
      charCount: 5
    });
  });

  it("matches editor line behavior for trailing newlines", () => {
    expect(getDocumentMetrics("one\n")).toEqual({
      lineCount: 2,
      charCount: 4
    });
  });

  it("reports one-based cursor line and column", () => {
    const markdown = "one\ntwo\nthree";

    expect(getDocumentCursorPosition(markdown, 0)).toEqual({ line: 1, column: 1 });
    expect(getDocumentCursorPosition(markdown, markdown.indexOf("two"))).toEqual({ line: 2, column: 1 });
    expect(getDocumentCursorPosition(markdown, markdown.indexOf("three") + "thr".length)).toEqual({ line: 3, column: 4 });
  });

  it("handles trailing newlines, unicode code points, and out-of-range offsets", () => {
    expect(getDocumentCursorPosition("猫😀\n", 0)).toEqual({ line: 1, column: 1 });
    expect(getDocumentCursorPosition("猫😀\n", "猫😀".length)).toEqual({ line: 1, column: 3 });
    expect(getDocumentCursorPosition("猫😀\n", 100)).toEqual({ line: 2, column: 1 });
    expect(getDocumentCursorPosition("abc", -100)).toEqual({ line: 1, column: 1 });
    expect(getDocumentCursorPosition("abc", Number.NaN)).toEqual({ line: 1, column: 1 });
  });
});
