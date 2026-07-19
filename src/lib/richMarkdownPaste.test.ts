import { MarkdownManager } from "@tiptap/markdown";
import { describe, expect, it } from "vitest";
import { createRichMarkdownExtensions } from "./richMarkdownExtensions";
import { richMarkdownSourceFromClipboard } from "./richMarkdownPaste";

const markdown = new MarkdownManager({ extensions: createRichMarkdownExtensions(null) });
const parseMarkdown = (source: string) => markdown.parse(source);

describe("rich Markdown paste selection", () => {
  it("prefers an explicit Markdown clipboard format over clean HTML and text", () => {
    const source = "[https://example.com/path](https://example.com/path)";

    expect(richMarkdownSourceFromClipboard({
      markdown: source,
      text: "https://example.com/path"
    }, parseMarkdown)).toBe(source);
  });

  it("keeps a complete mixed Markdown document instead of extracting its table", () => {
    const source = [
      "Before [Docs](https://example.com/docs)",
      "",
      "| A | B |",
      "| --- | --- |",
      "| 1 | 2 |",
      "",
      "After"
    ].join("\n");

    expect(richMarkdownSourceFromClipboard({ markdown: source }, parseMarkdown)).toBe(source);
  });

  it("conservatively recognizes plain-text Markdown links and autolinks", () => {
    expect(richMarkdownSourceFromClipboard({ text: "[Docs](https://example.com/docs)" }, parseMarkdown))
      .toBe("[Docs](https://example.com/docs)");
    expect(richMarkdownSourceFromClipboard({ text: "<https://example.com/docs>" }, parseMarkdown))
      .toBe("<https://example.com/docs>");
  });

  it("leaves ordinary prose with a URL on the plain-text path", () => {
    expect(richMarkdownSourceFromClipboard({
      text: "See [brackets] and https://example.com/docs"
    }, parseMarkdown)).toBeNull();
    expect(richMarkdownSourceFromClipboard({ text: "https://example.com/docs" }, parseMarkdown)).toBeNull();
  });
});
