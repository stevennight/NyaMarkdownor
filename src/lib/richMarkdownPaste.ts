import type { JSONContent } from "@tiptap/core";
import { Fragment, Slice } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { explicitMarkdownFromClipboard } from "./clipboard";
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
};

export function richMarkdownSourceFromClipboard(
  data: RichMarkdownClipboardData,
  parseMarkdown: (source: string) => JSONContent | null
): string | null {
  const explicitMarkdown = explicitMarkdownFromClipboard(data);
  if (explicitMarkdown?.trim()) return trimRichMarkdownPasteBoundaries(explicitMarkdown);

  const text = data.text ?? "";
  if (!text.trim() || text.length > MAX_PLAIN_MARKDOWN_PASTE_LENGTH) return null;

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
