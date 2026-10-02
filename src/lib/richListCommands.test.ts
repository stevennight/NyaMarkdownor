import { getSchema } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { EditorState, TextSelection, type Transaction } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import { createRichMarkdownExtensions } from "./richMarkdownExtensions";
import { richListBackspace, richOrderedListExitEmptyItem } from "./richListCommands";

const extensions = createRichMarkdownExtensions(null);
const schema = getSchema(extensions);
const markdown = new MarkdownManager({ extensions });

function stateAt(source: string, text: string, offset = 0): EditorState {
  const doc = schema.nodeFromJSON(markdown.parse(source));
  let position: number | null = null;
  doc.descendants((node, pos) => {
    if (position === null && node.isText && node.text?.includes(text)) position = pos + node.text.indexOf(text) + offset;
  });
  if (position === null) throw new Error(`Text not found: ${text}`);
  return EditorState.create({ doc, selection: TextSelection.create(doc, position) });
}

function stateAtEmptiedItem(source: string, text: string): EditorState {
  const base = stateAt(source, text);
  return base.apply(base.tr.delete(base.selection.from, base.selection.from + text.length));
}

function run(state: EditorState, command: (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean) {
  let next: EditorState | null = null;
  const handled = command(state, (transaction) => {
    next = state.apply(transaction);
  });
  return { handled, state: next as EditorState | null };
}

function serialize(state: EditorState): string {
  return markdown.serialize(state.doc.toJSON());
}

describe("rich list Backspace", () => {
  it("folds a middle ordered item into the previous item without restarting the numbering", () => {
    const source = "1. one\n2. two\n3. three";
    const { handled, state } = run(stateAt(source, "two"), richListBackspace);

    expect(handled).toBe(true);
    expect(serialize(state!)).toBe("1. one\n\n   two\n\n2. three");
    expect(state!.selection.$from.parent.textContent).toBe("two");
    expect(state!.selection.$from.parentOffset).toBe(0);
  });

  it("keeps nested children with the folded item instead of promoting them", () => {
    const source = "1. one\n2. two\n   - child\n3. three";
    const { state } = run(stateAt(source, "two"), richListBackspace);

    expect(serialize(state!)).toBe("1. one\n\n   two\n\n   - child\n\n2. three");
  });

  it("merges a continuation paragraph back into the item text on the second Backspace", () => {
    const first = run(stateAt("- one\n- two", "two"), richListBackspace).state!;
    const second = run(first, richListBackspace);

    expect(second.handled).toBe(true);
    expect(second.state!.doc.firstChild?.childCount).toBe(1);
    expect(second.state!.doc.firstChild?.firstChild?.textContent).toBe("onetwo");
  });

  it("keeps task item state while folding", () => {
    const source = "- [x] done\n- [ ] next";
    const { state } = run(stateAt(source, "next"), richListBackspace);

    expect(serialize(state!)).toBe("- [x] done\n\n  next");
  });

  it("removes an empty middle item and moves to the end of the previous item", () => {
    const { handled, state } = run(stateAtEmptiedItem("1. one\n2. two\n3. three", "two"), richListBackspace);

    expect(handled).toBe(true);
    expect(serialize(state!)).toBe("1. one\n2. three");
    expect(state!.selection.$from.parent.textContent).toBe("one");
    expect(state!.selection.$from.parentOffset).toBe(3);
  });

  it("leaves the first item and an empty last item to the default lift", () => {
    expect(richListBackspace(stateAt("1. one\n2. two", "one"))).toBe(false);

    expect(richListBackspace(stateAtEmptiedItem("- one\n- two", "two"))).toBe(false);
  });

  it("ignores cursors that are not at the start of a list item", () => {
    expect(richListBackspace(stateAt("1. one\n2. two", "two", 1))).toBe(false);
    expect(richListBackspace(stateAt("plain", "plain"))).toBe(false);
  });
});

describe("rich ordered list Enter on an empty item", () => {
  it("splits the list and continues numbering after the new paragraph", () => {
    const state = stateAtEmptiedItem("3. a\n4. b\n5. c", "b");
    const { handled, state: next } = run(state, richOrderedListExitEmptyItem);

    expect(handled).toBe(true);
    const types: string[] = [];
    next!.doc.forEach((node) => types.push(node.type.name));
    expect(types).toEqual(["orderedList", "paragraph", "orderedList"]);
    expect(next!.doc.child(2).attrs.start).toBe(4);
    expect(next!.selection.$from.parent.type.name).toBe("paragraph");
    expect(next!.selection.$from.depth).toBe(1);
  });

  it("leaves the last item, the first item and nested lists to the default behavior", () => {
    expect(richOrderedListExitEmptyItem(stateAtEmptiedItem("1. a\n2. b", "b"))).toBe(false);
    expect(richOrderedListExitEmptyItem(stateAtEmptiedItem("1. a\n2. b", "a"))).toBe(false);
    expect(richOrderedListExitEmptyItem(stateAtEmptiedItem("- a\n  1. x\n  2. y\n  3. z", "y"))).toBe(false);
  });
});
