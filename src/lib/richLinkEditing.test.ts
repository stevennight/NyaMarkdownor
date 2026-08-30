import { getSchema } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import { createRichMarkdownExtensions } from "./richMarkdownExtensions";
import { richLinkEditState, richLinkEditTransaction } from "./richLinkEditing";

const extensions = createRichMarkdownExtensions(null);
const schema = getSchema(extensions);
const markdown = new MarkdownManager({ extensions });

describe("rich link editing", () => {
  it("reads and atomically updates an existing link label and destination", () => {
    const state = stateWithCursorInText("Read [Guide](https://old.example).", "Guide");

    expect(richLinkEditState(state)).toEqual({
      href: "https://old.example",
      text: "Guide",
      active: true
    });

    const transaction = richLinkEditTransaction(state, "https://new.example", "Documentation");
    expect(serialize(transaction?.doc ?? state.doc)).toBe("Read [Documentation](https://new.example).");
    expect(transaction?.doc.textBetween(transaction.selection.from, transaction.selection.to)).toBe("Documentation");
  });

  it("preserves uniform label formatting when only the destination changes", () => {
    const state = stateWithCursorInText("Read [**Guide**](https://old.example).", "Guide");
    const transaction = richLinkEditTransaction(state, "https://new.example", "Guide");

    expect(serialize(transaction?.doc ?? state.doc)).toBe("Read [**Guide**](https://new.example).");
  });

  it("uses the selected text when creating a new link and permits changing its label", () => {
    const state = stateWithSelectedText("Read Guide.", "Guide");
    expect(richLinkEditState(state)).toEqual({ href: "", text: "Guide", active: false });

    const transaction = richLinkEditTransaction(state, "https://example.com/docs", "Docs");
    expect(serialize(transaction?.doc ?? state.doc)).toBe("Read [Docs](https://example.com/docs).");
  });

  it("turns an edited autolink label into an explicit Markdown link", () => {
    const state = stateWithCursorInText("Visit <https://example.com/original>.", "https://example.com/original");
    const transaction = richLinkEditTransaction(state, "https://example.com/updated", "Website");

    expect(serialize(transaction?.doc ?? state.doc)).toBe("Visit [Website](https://example.com/updated).");
  });

  it("rejects an empty display label", () => {
    const state = stateWithCursorInText("Read [Guide](https://example.com).", "Guide");
    expect(richLinkEditTransaction(state, "https://example.com", "   ")).toBeNull();
  });
});

function stateWithCursorInText(source: string, text: string): EditorState {
  const doc = parsedDocument(source);
  const range = textRange(doc, text);
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, Math.min(range.to, range.from + 1))
  });
}

function stateWithSelectedText(source: string, text: string): EditorState {
  const doc = parsedDocument(source);
  const range = textRange(doc, text);
  return EditorState.create({ schema, doc, selection: TextSelection.create(doc, range.from, range.to) });
}

function parsedDocument(source: string): ProseMirrorNode {
  return schema.nodeFromJSON(markdown.parse(source));
}

function textRange(doc: ProseMirrorNode, text: string): { from: number; to: number } {
  let range: { from: number; to: number } | null = null;
  doc.descendants((node, position) => {
    if (range || !node.isText || !node.text) return;
    const index = node.text.indexOf(text);
    if (index !== -1) range = { from: position + index, to: position + index + text.length };
  });
  if (!range) throw new Error(`Text not found: ${text}`);
  return range;
}

function serialize(doc: ProseMirrorNode): string {
  return markdown.serialize(doc.toJSON());
}
