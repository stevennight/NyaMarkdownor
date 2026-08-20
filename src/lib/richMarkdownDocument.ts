import type { JSONContent } from "@tiptap/core";

export function normalizeRichOrderedLists(document: JSONContent): JSONContent {
  return normalizeRichOrderedListNode(document);
}

function normalizeRichOrderedListNode(node: JSONContent): JSONContent {
  if (!Array.isArray(node.content)) return node;

  const content = node.content.map(normalizeRichOrderedListNode);
  const merged: JSONContent[] = [];

  for (const child of content) {
    const previous = merged.at(-1);
    if (previous && canMergeRichOrderedLists(previous, child)) {
      merged[merged.length - 1] = {
        ...previous,
        content: [...(previous.content ?? []), ...(child.content ?? [])]
      };
      continue;
    }
    merged.push(child);
  }

  return { ...node, content: merged };
}

function canMergeRichOrderedLists(left: JSONContent, right: JSONContent): boolean {
  if (left.type !== "orderedList" || right.type !== "orderedList") return false;

  return (left.attrs?.start ?? 1) === (right.attrs?.start ?? 1)
    && (left.attrs?.markdownDelimiter ?? ".") === (right.attrs?.markdownDelimiter ?? ".")
    && (left.attrs?.markdownLoose ?? false) === (right.attrs?.markdownLoose ?? false)
    && (left.attrs?.type ?? null) === (right.attrs?.type ?? null);
}

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
