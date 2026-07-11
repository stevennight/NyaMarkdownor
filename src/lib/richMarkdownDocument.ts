import type { JSONContent } from "@tiptap/core";

export function withoutGeneratedTrailingParagraph(document: JSONContent): JSONContent {
  const content = document.content;
  if (!Array.isArray(content) || content.length < 2) return document;

  const trailing = content[content.length - 1];
  const previous = content[content.length - 2];
  if (trailing?.type !== "paragraph" || trailing.content?.length || previous?.type === "paragraph") {
    return document;
  }

  return { ...document, content: content.slice(0, -1) };
}
