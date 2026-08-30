import { getMarkRange } from "@tiptap/core";
import type { Mark, Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";

export type RichLinkEditState = {
  href: string;
  text: string;
  active: boolean;
};

export type RichAutolinkSelection = {
  position: number;
  node: ProseMirrorNode;
};

export function richLinkEditState(state: EditorState): RichLinkEditState {
  const autolink = activeRichAutolink(state);
  if (autolink) {
    return {
      href: stringAttribute(autolink.node.attrs.href),
      text: autolink.node.textContent,
      active: true
    };
  }

  const marked = activeMarkedLink(state);
  if (marked) {
    return {
      href: stringAttribute(marked.mark.attrs.href),
      text: state.doc.textBetween(marked.from, marked.to, "\n"),
      active: true
    };
  }

  const { from, to } = state.selection;
  return {
    href: "",
    text: state.doc.textBetween(from, to, "\n"),
    active: false
  };
}

export function richLinkEditTransaction(
  state: EditorState,
  href: string,
  text: string
): Transaction | null {
  if (!text.trim()) return null;

  const autolink = activeRichAutolink(state);
  if (autolink) return editAutolink(state, autolink, href, text);

  const marked = activeMarkedLink(state);
  if (marked) {
    const attrs = { ...marked.mark.attrs, href };
    if (text === state.doc.textBetween(marked.from, marked.to, "\n")) {
      return state.tr.addMark(marked.from, marked.to, marked.mark.type.create(attrs));
    }

    const marks = [...uniformMarksBetween(state.doc, marked.from, marked.to, marked.mark), marked.mark.type.create(attrs)];
    const transaction = state.tr.replaceWith(marked.from, marked.to, state.schema.text(text, marks));
    return transaction.setSelection(TextSelection.create(transaction.doc, marked.from, marked.from + text.length));
  }

  const { from, to } = state.selection;
  const link = state.schema.marks.link;
  if (!link) return null;

  const currentText = state.doc.textBetween(from, to, "\n");
  if (from !== to && text === currentText) {
    return state.tr.addMark(from, to, link.create({ href }));
  }

  const marks = [...uniformMarksBetween(state.doc, from, to), link.create({ href })];
  const transaction = state.tr.replaceWith(from, to, state.schema.text(text, marks));
  return transaction.setSelection(TextSelection.create(transaction.doc, from, from + text.length));
}

export function activeRichAutolink(state: EditorState): RichAutolinkSelection | null {
  const { selection, doc } = state;
  const selectedNode = doc.nodeAt(selection.from);
  if (selectedNode?.type.name === "markdownAutolink") {
    return { position: selection.from, node: selectedNode };
  }

  for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
    const node = selection.$from.node(depth);
    if (node.type.name === "markdownAutolink") {
      return { position: selection.$from.before(depth), node };
    }
  }
  return null;
}

function editAutolink(
  state: EditorState,
  autolink: RichAutolinkSelection,
  href: string,
  text: string
): Transaction {
  const attrs = {
    ...autolink.node.attrs,
    raw: "",
    text,
    href,
    title: ""
  };

  if (text === autolink.node.textContent) {
    return state.tr.setNodeMarkup(autolink.position, undefined, attrs);
  }

  const replacement = autolink.node.type.create(
    attrs,
    state.schema.text(text),
    autolink.node.marks
  );
  const transaction = state.tr.replaceWith(
    autolink.position,
    autolink.position + autolink.node.nodeSize,
    replacement
  );
  return transaction.setSelection(TextSelection.create(
    transaction.doc,
    autolink.position + 1,
    autolink.position + 1 + text.length
  ));
}

function activeMarkedLink(state: EditorState): {
  from: number;
  to: number;
  mark: Mark;
} | null {
  const link = state.schema.marks.link;
  if (!link) return null;

  for (const $position of [state.selection.$from, state.selection.$to]) {
    const range = getMarkRange($position, link);
    if (!range) continue;
    const mark = state.doc.nodeAt(range.from)?.marks.find((candidate) => candidate.type === link)
      ?? $position.marks().find((candidate) => candidate.type === link);
    if (mark) return { ...range, mark };
  }
  return null;
}

function uniformMarksBetween(
  doc: ProseMirrorNode,
  from: number,
  to: number,
  excluded?: Mark
): Mark[] {
  let common: Mark[] | null = null;
  let mixed = false;

  doc.nodesBetween(from, to, (node) => {
    if (!node.isText) {
      if (node.isInline) mixed = true;
      return;
    }

    const marks = node.marks.filter((mark) => mark.type !== excluded?.type && mark.type.name !== "link");
    if (common === null) common = marks;
    else if (!sameMarks(common, marks)) mixed = true;
  });

  return mixed ? [] : common ?? [];
}

function sameMarks(left: readonly Mark[], right: readonly Mark[]): boolean {
  return left.length === right.length && left.every((mark, index) => mark.eq(right[index]));
}

function stringAttribute(value: unknown): string {
  return typeof value === "string" ? value : "";
}
