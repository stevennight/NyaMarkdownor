import { describe, expect, it } from "vitest";
import {
  detectMarkdownLineEnding,
  markdownWithLineEnding,
  normalizeMarkdownLineEndings,
  normalizeMarkdownText
} from "./lineEndings";

describe("Markdown line endings", () => {
  it("detects LF and CRLF documents", () => {
    expect(detectMarkdownLineEnding("alpha\nbeta\n")).toBe("lf");
    expect(detectMarkdownLineEnding("alpha\r\nbeta\r\n")).toBe("crlf");
    expect(detectMarkdownLineEnding("single line")).toBe("lf");
  });

  it("uses the dominant style for mixed documents and the first style for a tie", () => {
    expect(detectMarkdownLineEnding("a\r\nb\r\nc\nd")).toBe("crlf");
    expect(detectMarkdownLineEnding("a\nb\nc\r\nd")).toBe("lf");
    expect(detectMarkdownLineEnding("a\r\nb\nc")).toBe("crlf");
    expect(detectMarkdownLineEnding("a\nb\r\nc")).toBe("lf");
  });

  it("normalizes CRLF and legacy CR breaks to LF", () => {
    expect(normalizeMarkdownLineEndings("a\r\nb\rc\nd")).toBe("a\nb\nc\nd");
    expect(normalizeMarkdownText("a\r\nb\r\n")).toEqual({
      markdown: "a\nb\n",
      lineEnding: "crlf"
    });
  });

  it("restores the selected disk style without duplicating carriage returns", () => {
    expect(markdownWithLineEnding("a\nb\n", "crlf")).toBe("a\r\nb\r\n");
    expect(markdownWithLineEnding("a\r\nb\r\n", "crlf")).toBe("a\r\nb\r\n");
    expect(markdownWithLineEnding("a\r\nb\r\n", "lf")).toBe("a\nb\n");
  });
});
