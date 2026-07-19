import type { JSONContent } from "@tiptap/core";
import { explicitMarkdownFromClipboard } from "./clipboard";
import { normalizeMarkdownLineEndings } from "./lineEndings";

const MAX_PLAIN_MARKDOWN_PASTE_LENGTH = 1024 * 1024;

export type RichMarkdownClipboardData = {
  markdown?: string | null;
  text?: string | null;
};

export function richMarkdownSourceFromClipboard(
  data: RichMarkdownClipboardData,
  parseMarkdown: (source: string) => JSONContent | null
): string | null {
  const explicitMarkdown = explicitMarkdownFromClipboard(data);
  if (explicitMarkdown?.trim()) return explicitMarkdown;

  const text = data.text ?? "";
  if (!text.trim() || text.length > MAX_PLAIN_MARKDOWN_PASTE_LENGTH) return null;

  const parsed = parseMarkdownSafely(normalizeMarkdownLineEndings(text), parseMarkdown);
  return parsed && containsExplicitMarkdownResource(parsed)
    ? normalizeMarkdownLineEndings(text)
    : null;
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

function containsExplicitMarkdownResource(node: JSONContent): boolean {
  if (node.type === "markdownAutolink"
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

  return node.content?.some(containsExplicitMarkdownResource) ?? false;
}
