import { describe, expect, it, vi } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { history, undoDepth } from "@codemirror/commands";
import { createEditorStateFromSnapshot, createEditorStateSnapshot, normalizeStoredEditorStateSnapshot } from "./editorStateSnapshots";

describe("editor state snapshots", () => {
  it("restores document, selection, and undo history from a matching snapshot", () => {
    let state = EditorState.create({
      doc: "one",
      extensions: [history()]
    });
    state = state.update({
      changes: { from: 3, insert: " two" },
      selection: EditorSelection.cursor(7)
    }).state;

    const snapshot = createEditorStateSnapshot(state, 0.42);
    const restored = createEditorStateFromSnapshot("one two", [history()], snapshot);

    expect(restored.doc.toString()).toBe("one two");
    expect(restored.selection.main.from).toBe(7);
    expect(undoDepth(restored)).toBe(1);
    expect(snapshot.scrollProgress).toBe(0.42);
  });

  it("starts fresh when a snapshot belongs to different document text", () => {
    let state = EditorState.create({
      doc: "old",
      extensions: [history()]
    });
    state = state.update({ changes: { from: 3, insert: " value" } }).state;

    const restored = createEditorStateFromSnapshot("new", [history()], createEditorStateSnapshot(state));

    expect(restored.doc.toString()).toBe("new");
    expect(undoDepth(restored)).toBe(0);
  });

  it("starts fresh when snapshot deserialization fails", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const restored = createEditorStateFromSnapshot("markdown", [history()], {
      doc: "markdown",
      selection: { ranges: "not-ranges" },
      history: {}
    });

    expect(restored.doc.toString()).toBe("markdown");
    expect(undoDepth(restored)).toBe(0);
    expect(warn).toHaveBeenCalled();
  });

  it("keeps only stored editor snapshots that match the document text", () => {
    const snapshot = {
      doc: "markdown",
      selection: { ranges: [{ anchor: 4, head: 4 }], main: 0 },
      history: { done: [], undone: [] },
      scrollProgress: 0.5
    };

    expect(normalizeStoredEditorStateSnapshot(snapshot, "markdown")).toEqual(snapshot);
    expect(normalizeStoredEditorStateSnapshot(snapshot, "changed")).toBeUndefined();
    expect(normalizeStoredEditorStateSnapshot(null, "markdown")).toBeUndefined();
  });

  it("clamps persisted editor scroll progress", () => {
    const state = EditorState.create({
      doc: "markdown",
      extensions: [history()]
    });

    expect(createEditorStateSnapshot(state, -1).scrollProgress).toBe(0);
    expect(createEditorStateSnapshot(state, 2).scrollProgress).toBe(1);
    expect(createEditorStateSnapshot(state, Number.NaN).scrollProgress).toBeUndefined();
    expect(normalizeStoredEditorStateSnapshot({
      doc: "markdown",
      scrollProgress: 2
    }, "markdown")?.scrollProgress).toBe(1);
  });
});
