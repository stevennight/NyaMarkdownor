import { getSchema } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import { createRichMarkdownExtensions } from "./richMarkdownExtensions";
import { richMarkdownPasteTransaction, richMarkdownSourceFromClipboard } from "./richMarkdownPaste";

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

  it("drops clipboard-only boundary newlines without collapsing intentional spacing", () => {
    expect(richMarkdownSourceFromClipboard({
      markdown: "\n\nFirst\n\n\nSecond\n\n"
    }, parseMarkdown)).toBe("First\n\n\nSecond");
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

  it("replaces an empty top-level paragraph when inserting Markdown blocks", () => {
    const schema = getSchema(createRichMarkdownExtensions(null));
    const emptyDocument = schema.node("doc", null, [schema.node("paragraph")]);
    const state = EditorState.create({
      schema,
      doc: emptyDocument,
      selection: TextSelection.create(emptyDocument, 1)
    });
    const parsed = markdown.parse("# Heading\n\nBody");
    const transaction = richMarkdownPasteTransaction(state, parsed);

    expect(transaction).not.toBeNull();
    expect(transaction?.doc.childCount).toBe(2);
    expect(transaction?.doc.firstChild?.type.name).toBe("heading");
    expect(transaction?.doc.lastChild?.textContent).toBe("Body");
    expect(transaction?.selection.eq(TextSelection.atEnd(transaction.doc))).toBe(true);
  });

  it("leaves non-empty and nested paragraphs on the normal insertion path", () => {
    const schema = getSchema(createRichMarkdownExtensions(null));
    const paragraph = schema.node("paragraph", null, [schema.text("Before")]);
    const document = schema.node("doc", null, [paragraph]);
    const state = EditorState.create({
      schema,
      doc: document,
      selection: TextSelection.atEnd(document)
    });

    expect(richMarkdownPasteTransaction(state, markdown.parse("# Heading"))).toBeNull();
  });
});
