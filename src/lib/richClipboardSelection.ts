import type { JSONContent } from "@tiptap/core";
import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";

const LIST_TYPES = new Set(["bulletList", "orderedList", "taskList"]);

/**
 * The selected part of the document as a standalone document. A selection
 * that spans list items keeps the list around them (with the ordered list
 * renumbered from the first selected item), so copying items 3-4 of an
 * ordered list yields "3." and "4." instead of loose bullet items.
 */
export function richSelectionDocument(doc: ProseMirrorNode, from: number, to: number): JSONContent {
  if (from >= to) return doc.toJSON() as JSONContent;

  const $from = doc.resolve(from);
  const depth = $from.sharedDepth(to);
  let content = doc.slice(from, to).content;
  const shared = $from.node(depth);

  if (depth > 0 && LIST_TYPES.has(shared.type.name)) {
    const attrs = shared.type.name === "orderedList"
      ? { ...shared.attrs, start: Number(shared.attrs.start ?? 1) + $from.index(depth) }
      : shared.attrs;
    content = Fragment.from(shared.type.create(attrs, content, shared.marks));
  }

  return { type: "doc", content: (content.toJSON() as JSONContent[] | null) ?? [] };
}
