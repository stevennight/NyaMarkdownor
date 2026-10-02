import { getSchema } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import { createRichMarkdownExtensions } from "./richMarkdownExtensions";
import { richCodePasteTransaction, richMarkdownPasteTransaction, richMarkdownSourceFromClipboard, richPasteContext, richTableCellPasteTransaction } from "./richMarkdownPaste";

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

describe("rich paste contexts", () => {
  const extensions = createRichMarkdownExtensions(null);
  const schema = getSchema(extensions);

  function stateAt(source: string, text: string, offset = 0): EditorState {
    const doc = schema.nodeFromJSON(markdown.parse(source));
    let position: number | null = null;
    doc.descendants((node, pos) => {
      if (position === null && node.isText && node.text?.includes(text)) position = pos + node.text.indexOf(text) + offset;
    });
    if (position === null) throw new Error(`Text not found: ${text}`);
    return EditorState.create({ doc, selection: TextSelection.create(doc, position) });
  }

  const serialize = (state: EditorState) => markdown.serialize(state.doc.toJSON());

  it("detects code blocks, inline code and table cells", () => {
    expect(richPasteContext(stateAt("```\ncode\n```", "code", 2))).toBe("code-block");
    expect(richPasteContext(stateAt("Use `value` here", "value", 2))).toBe("inline-code");
    expect(richPasteContext(stateAt("| A | B |\n| --- | --- |\n| one | two |", "one", 1))).toBe("table-cell");
    expect(richPasteContext(stateAt("plain", "plain", 1))).toBe("text");
  });

  it("pastes Markdown-looking text into a code block as literal code", () => {
    const state = stateAt("```\ncode\n```", "code", 4);
    const next = state.apply(richCodePasteTransaction(state, "\n# comment\n- item\nfoo(a, b)", "code-block")!);

    expect(serialize(next)).toBe("```\ncode\n# comment\n- item\nfoo(a, b)\n```");
  });

  it("keeps inline code on one line", () => {
    const state = stateAt("Use `value` here", "value", 5);
    const next = state.apply(richCodePasteTransaction(state, "a\nb", "inline-code")!);

    expect(serialize(next)).toBe("Use `valuea b` here");
  });

  it("inserts multi-line text inside the current cell with cell line breaks", () => {
    const source = "| A | B |\n| --- | --- |\n| one | two |";
    const state = stateAt(source, "one", 3);
    const next = state.apply(richTableCellPasteTransaction(state, "first\nsecond\n", null)!);

    expect(serialize(next)).toContain("| onefirst<br>second | two |");
    expect(serialize(next).split("\n")).toHaveLength(3);
  });

  it("keeps inline formatting of single-paragraph Markdown pasted into a cell", () => {
    const state = stateAt("| A | B |\n| --- | --- |\n| one | two |", "one", 3);
    const next = state.apply(richTableCellPasteTransaction(state, "**bold**", markdown.parse("**bold**"))!);

    expect(serialize(next)).toContain("| one**bold** | two |");
  });

  it("flattens block Markdown pasted into a cell to text lines", () => {
    const state = stateAt("| A | B |\n| --- | --- |\n| one | two |", "one", 3);
    const next = state.apply(richTableCellPasteTransaction(state, "- x\n- y", markdown.parse("- x\n- y"))!);

    expect(serialize(next)).toContain("| one- x<br>- y | two |");
  });
});

describe("plain-text Markdown detection", () => {
  it("uses rich HTML instead of a plain-text copy that only looks like Markdown", () => {
    expect(richMarkdownSourceFromClipboard({
      text: "1. Introduction\n2. Scope",
      html: "<h2>1. Introduction</h2><h2>2. Scope</h2>"
    }, parseMarkdown)).toBeNull();
  });

  it("still parses Markdown text from code editors that wrap it in preformatted HTML", () => {
    expect(richMarkdownSourceFromClipboard({
      text: "# Title\n\n- item",
      html: '<div style="white-space: pre;"><div># Title</div></div>',
      vscodeEditorData: JSON.stringify({ mode: "markdown" })
    }, parseMarkdown)).toBe("# Title\n\n- item");
  });

  it("pastes code copied from VS Code as a fenced block in its language", () => {
    expect(richMarkdownSourceFromClipboard({
      text: "# comment\nprint(1)\n",
      vscodeEditorData: JSON.stringify({ mode: "python" })
    }, parseMarkdown)).toBe("```python\n# comment\nprint(1)\n```");

    expect(richMarkdownSourceFromClipboard({
      text: "const fence = \"```\";\nx();",
      vscodeEditorData: JSON.stringify({ mode: "typescript" })
    }, parseMarkdown)).toBe("````typescript\nconst fence = \"```\";\nx();\n````");
  });

  it("leaves single-line VS Code code to the normal inline paste", () => {
    expect(richMarkdownSourceFromClipboard({
      text: "- not a list",
      vscodeEditorData: JSON.stringify({ mode: "javascript" })
    }, parseMarkdown)).toBeNull();
  });
});
