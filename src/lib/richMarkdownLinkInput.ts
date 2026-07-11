import { InputRule, type JSONContent } from "@tiptap/core";
import type { MarkType } from "@tiptap/pm/model";
import { normalizeRichLinkHref } from "./richLinks";

const MAX_MARKDOWN_LINK_INPUT_LENGTH = 8 * 1024;
const MAX_MARKDOWN_LINK_PARSE_ATTEMPTS = 32;

export type RichMarkdownLinkInputMatch = {
  content: JSONContent[];
  index: number;
  source: string;
};

export function findRichMarkdownLinkInput(
  text: string,
  parseMarkdown: (source: string) => JSONContent | null
): RichMarkdownLinkInputMatch | null {
  if (!text.endsWith(")")) return null;

  const minimumIndex = Math.max(0, text.length - MAX_MARKDOWN_LINK_INPUT_LENGTH);
  let index = text.lastIndexOf("[");
  let parseAttempts = 0;
  while (index >= minimumIndex) {
    if (!isEscapedCharacter(text, index) && !isMarkdownImageLabel(text, index)) {
      const source = text.slice(index);
      if (!source.includes("\n") && source.includes("](")) {
        parseAttempts += 1;
        const content = parsedInlineLinkContent(parseMarkdownSafely(source, parseMarkdown));
        if (content) return { content, index, source };
        if (parseAttempts >= MAX_MARKDOWN_LINK_PARSE_ATTEMPTS) return null;
      }
    }
    index = index > 0 ? text.lastIndexOf("[", index - 1) : -1;
  }

  return null;
}

export function createRichMarkdownLinkInputRule(
  type: MarkType,
  parseMarkdown: (source: string) => JSONContent | null
): InputRule {
  return new InputRule({
    find: (text) => {
      const match = findRichMarkdownLinkInput(text, parseMarkdown);
      return match ? {
        index: match.index,
        text: match.source,
        data: { content: match.content }
      } : null;
    },
    handler: ({ state, range, match }) => {
      const content = match.data?.content;
      if (!Array.isArray(content) || content.length === 0) return null;

      try {
        const paragraph = state.schema.nodeFromJSON({ type: "paragraph", content });
        if (paragraph.content.size === 0) return null;
        state.tr
          .replaceWith(range.from, range.to, paragraph.content)
          .removeStoredMark(type)
          .setMeta("preventAutolink", true);
      } catch {
        return null;
      }
    }
  });
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

function parsedInlineLinkContent(document: JSONContent | null): JSONContent[] | null {
  if (document?.type !== "doc" || document.content?.length !== 1) return null;
  const paragraph = document.content[0];
  if (paragraph?.type !== "paragraph" || !paragraph.content?.length) return null;

  let signature: string | null = null;
  for (const node of paragraph.content) {
    const linkMarks = node.marks?.filter((mark) => mark.type === "link") ?? [];
    if (linkMarks.length !== 1) return null;

    const attributes = linkMarks[0].attrs;
    const href = typeof attributes?.href === "string" ? attributes.href : "";
    if (normalizeRichLinkHref(href) === null || typeof attributes?.markdownInlineSuffix !== "string") {
      return null;
    }

    const nextSignature = JSON.stringify(attributes);
    if (signature !== null && signature !== nextSignature) return null;
    signature = nextSignature;
  }

  return paragraph.content;
}

function isMarkdownImageLabel(text: string, bracketIndex: number): boolean {
  const markerIndex = bracketIndex - 1;
  return markerIndex >= 0
    && text[markerIndex] === "!"
    && !isEscapedCharacter(text, markerIndex);
}

function isEscapedCharacter(text: string, index: number): boolean {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}
