import type { JSONContent } from "@tiptap/core";

// Markdown cannot keep two adjacent lists of the same kind apart, so the
// projection merges them the way a Markdown parser would read them back.
export function normalizeRichAdjacentLists(document: JSONContent): JSONContent {
  return normalizeRichAdjacentListNode(document);
}

function normalizeRichAdjacentListNode(node: JSONContent): JSONContent {
  if (!Array.isArray(node.content)) return node;

  const content = node.content.map(normalizeRichAdjacentListNode);
  const merged: JSONContent[] = [];

  for (const child of content) {
    const previous = merged.at(-1);
    if (previous && canMergeRichLists(previous, child)) {
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

export function canMergeRichLists(left: Pick<JSONContent, "type" | "attrs">, right: Pick<JSONContent, "type" | "attrs">): boolean {
  if (left.type !== right.type) return false;

  switch (left.type) {
    case "orderedList":
      return (left.attrs?.start ?? 1) === (right.attrs?.start ?? 1)
        && (left.attrs?.markdownDelimiter ?? ".") === (right.attrs?.markdownDelimiter ?? ".")
        && (left.attrs?.markdownLoose ?? false) === (right.attrs?.markdownLoose ?? false)
        && (left.attrs?.type ?? null) === (right.attrs?.type ?? null);
    case "bulletList":
      return (left.attrs?.markdownMarker ?? "-") === (right.attrs?.markdownMarker ?? "-")
        && (left.attrs?.markdownLoose ?? false) === (right.attrs?.markdownLoose ?? false);
    default:
      return false;
  }
}

/**
 * Keeps a final line break that the source had: the Markdown serializer never
 * emits one, and editing in the visual editor must not strip it from the file.
 */
export function withPreservedTrailingLineBreak(previous: string, next: string): string {
  if (!next || next.endsWith("\n") || !previous.endsWith("\n")) return next;
  return `${next}\n`;
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
