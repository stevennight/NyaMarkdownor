import type { JSONContent } from "@tiptap/core";
import { Fragment, Slice } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { explicitMarkdownFromClipboard, isRichTextClipboardHtml, vscodeClipboardLanguage } from "./clipboard";
import { normalizeMarkdownLineEndings } from "./lineEndings";

const MAX_PLAIN_MARKDOWN_PASTE_LENGTH = 1024 * 1024;
const EXPLICIT_MARKDOWN_BLOCK_TYPES = new Set([
  "blockquote",
  "bulletList",
  "codeBlock",
  "heading",
  "horizontalRule",
  "mermaidDiagram",
  "orderedList",
  "taskList"
]);

export type RichMarkdownClipboardData = {
  markdown?: string | null;
  text?: string | null;
  html?: string | null;
  /** The `vscode-editor-data` clipboard entry VS Code writes. */
  vscodeEditorData?: string | null;
};

const PLAIN_TEXT_LANGUAGES = new Set(["markdown", "plaintext", "text", "mdx"]);

export function richMarkdownSourceFromClipboard(
  data: RichMarkdownClipboardData,
  parseMarkdown: (source: string) => JSONContent | null
): string | null {
  const explicitMarkdown = explicitMarkdownFromClipboard(data);
  if (explicitMarkdown?.trim()) return trimRichMarkdownPasteBoundaries(explicitMarkdown);

  const text = data.text ?? "";
  if (!text.trim() || text.length > MAX_PLAIN_MARKDOWN_PASTE_LENGTH) return null;

  // Code copied from VS Code arrives as a code block in its language, so lines
  // such as "# comment" or "- item" stay code.
  const language = vscodeClipboardLanguage(data.vscodeEditorData);
  if (language && !PLAIN_TEXT_LANGUAGES.has(language.toLowerCase())) {
    return normalizeMarkdownLineEndings(text).includes("\n") ? fencedCodeBlock(text, language) : null;
  }

  // Formatted HTML (a web page, a word processor) is the better source; its
  // plain-text copy only looks like Markdown by accident.
  if (isRichTextClipboardHtml(data.html)) return null;

  const parsed = parseMarkdownSafely(normalizeMarkdownLineEndings(text), parseMarkdown);
  return parsed && containsExplicitMarkdownStructure(parsed)
    ? normalizeMarkdownLineEndings(text)
    : null;
}

export function richMarkdownPasteTransaction(state: EditorState, document: JSONContent): Transaction | null {
  if (document.type !== "doc" || !Array.isArray(document.content) || document.content.length === 0) return null;

  let content: Fragment;
  try {
    content = Fragment.fromArray(document.content.map((node) => state.schema.nodeFromJSON(node)));
  } catch {
    return null;
  }

  const { selection } = state;
  const atEmptyTopLevelParagraph = selection.empty
    && selection.$from.depth === 1
    && selection.$from.parent.type.name === "paragraph"
    && selection.$from.parent.content.size === 0;
  if (!atEmptyTopLevelParagraph) return null;

  const paragraphStart = selection.$from.before(1);
  const paragraphEnd = paragraphStart + selection.$from.parent.nodeSize;
  return state.tr.replace(paragraphStart, paragraphEnd, new Slice(content, 0, 0)).scrollIntoView();
}

function fencedCodeBlock(text: string, language: string): string {
  const code = normalizeMarkdownLineEndings(text).replace(/\n+$/, "");
  const longestFence = Math.max(2, ...(code.match(/`{3,}/g) ?? []).map((fence) => fence.length));
  const fence = "`".repeat(longestFence + 1);
  return `${fence}${language}\n${code}\n${fence}`;
}

function trimRichMarkdownPasteBoundaries(source: string): string {
  return source.replace(/^\n+|\n+$/g, "");
}

function parseMarkdownSafely(
  source: string,
  parseMarkdown: (source: string) => JSONContent | null
): JSONContent | null {
  try {
    return parseMarkdown(source);
  } catch {
    return null;
  }
}

function containsExplicitMarkdownStructure(node: JSONContent): boolean {
  if ((node.type && EXPLICIT_MARKDOWN_BLOCK_TYPES.has(node.type))
    || node.type === "table"
    || node.type === "markdownAutolink"
    || node.type === "protectedReferenceLink"
    || node.type === "markdownReferenceDefinition") {
    return true;
  }

  if (node.type === "image" && (node.attrs?.markdownInlineRaw || node.attrs?.markdownReferenceRaw)) {
    return true;
  }

  if (node.marks?.some((mark) => mark.type === "link" && (
    mark.attrs?.markdownInlineSuffix || mark.attrs?.markdownReferenceSuffix
  ))) {
    return true;
  }

  return node.content?.some(containsExplicitMarkdownStructure) ?? false;
}

export type RichPasteContext = "code-block" | "inline-code" | "table-cell" | "text";

const TABLE_CELL_LINE_BREAK = "<br>";

export function richPasteContext(state: EditorState): RichPasteContext {
  const { $from, $to } = state.selection;
  if ($from.parent.type.spec.code) return "code-block";

  const inCode = (marks: readonly { type: { name: string } }[]) => marks.some((mark) => mark.type.name === "code");
  if (inCode($from.marks()) && inCode($to.marks())) return "inline-code";

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const role = $from.node(depth).type.spec.tableRole;
    if (role === "cell" || role === "header_cell") return "table-cell";
  }
  return "text";
}

/** Plain text into a code block or inline code keeps its exact characters. */
export function richCodePasteTransaction(state: EditorState, text: string, context: "code-block" | "inline-code"): Transaction | null {
  const normalized = normalizeMarkdownLineEndings(text);
  const value = context === "inline-code" ? normalized.replace(/\n+/g, " ") : normalized;
  if (!value) return null;
  return state.tr.insertText(value).scrollIntoView();
}

/**
 * Text pasted inside one table cell stays in that cell: each line break becomes
 * a cell line break, which Markdown stores as `<br>`. Markdown that parses to a
 * single paragraph keeps its inline formatting.
 */
export function richTableCellPasteTransaction(state: EditorState, text: string, parsed: JSONContent | null): Transaction | null {
  const inline = singleParagraphInlineContent(parsed);
  if (inline) {
    try {
      const nodes = inline.map((node) => state.schema.nodeFromJSON(node));
      return state.tr.replaceSelection(new Slice(Fragment.fromArray(nodes), 0, 0)).scrollIntoView();
    } catch {
      // Fall back to plain text below.
    }
  }

  const hardBreak = state.schema.nodes.hardBreak;
  const lines = normalizeMarkdownLineEndings(text).replace(/\n+$/, "").split("\n");
  if (!lines.some((line) => line.length)) return null;

  const nodes = lines.flatMap((line, index) => {
    const parts = [];
    if (index > 0 && hardBreak) parts.push(hardBreak.create({ markdownMarker: TABLE_CELL_LINE_BREAK }));
    else if (index > 0) parts.push(state.schema.text(" "));
    if (line) parts.push(state.schema.text(line));
    return parts;
  });
  return state.tr.replaceSelection(new Slice(Fragment.fromArray(nodes), 0, 0)).scrollIntoView();
}

function singleParagraphInlineContent(parsed: JSONContent | null): JSONContent[] | null {
  const blocks = parsed?.content;
  if (!blocks || blocks.length !== 1 || blocks[0].type !== "paragraph") return null;
  return blocks[0].content?.length ? blocks[0].content : null;
}
