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

  it("recognizes a complete Markdown API document from plain text by its table structure", () => {
    const source = [
      "## Resume query",
      "",
      "**Endpoint** `/resume/list`",
      "",
      "| Name | Description | Type |",
      "| --- | --- | --- |",
      "| page | Page number | integer |",
      "",
      "```json",
      '{ "page": 1 }',
      "```"
    ].join("\n");

    expect(richMarkdownSourceFromClipboard({ text: source }, parseMarkdown)).toBe(source);
  });

  it("recognizes a structured Markdown task document from plain text without tables or links", () => {
    const source = [
      "# NyaAuthBroker development task",
      "",
      "## Goal",
      "",
      "Build an independent authentication broker.",
      "",
      "## Technology",
      "",
      "- Go 1.25",
      "- PostgreSQL",
      "- Prefer the standard library",
      "",
      "## API",
      "",
      "```text",
      "POST /v1/providers/baidu/oauth/sessions",
      "GET  /healthz",
      "```"
    ].join("\n");

    expect(richMarkdownSourceFromClipboard({ text: source }, parseMarkdown)).toBe(source);
  });

  it.each([
    ["heading", "# Heading"],
    ["blockquote", "> Quoted"],
    ["bullet list", "- First\n- Second"],
    ["ordered list", "1. First\n2. Second"],
    ["task list", "- [ ] First\n- [x] Second"],
    ["fenced code block", "```text\nvalue\n```"],
    ["horizontal rule", "---"]
  ])("recognizes plain-text Markdown containing a %s", (_label, source) => {
    expect(richMarkdownSourceFromClipboard({ text: source }, parseMarkdown)).toBe(source);
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
