import { EditorState, type Extension } from "@codemirror/state";
import { historyField } from "@codemirror/commands";

export type EditorStateSnapshot = {
  doc?: unknown;
  selection?: unknown;
  history?: unknown;
  scrollProgress?: number;
};

const snapshotFields = {
  history: historyField
};

export function createEditorStateSnapshot(state: EditorState, scrollProgress?: number): EditorStateSnapshot {
  const snapshot = state.toJSON(snapshotFields) as EditorStateSnapshot;
  const nextScrollProgress = normalizeScrollProgress(scrollProgress);
  return nextScrollProgress === undefined
    ? snapshot
    : { ...snapshot, scrollProgress: nextScrollProgress };
}

export function normalizeStoredEditorStateSnapshot(value: unknown, markdown: string): EditorStateSnapshot | undefined {
  if (!value || typeof value !== "object") return undefined;
  const snapshot = value as EditorStateSnapshot;
  if (snapshot.doc !== markdown) return undefined;

  return {
    doc: snapshot.doc,
    selection: snapshot.selection,
    history: snapshot.history,
    ...normalizedScrollProgressProperty(snapshot.scrollProgress)
  };
}

export function createEditorStateFromSnapshot(
  markdown: string,
  extensions: Extension,
  snapshot: EditorStateSnapshot | undefined
): EditorState {
  if (!snapshot || snapshot.doc !== markdown) {
    return EditorState.create({ doc: markdown, extensions });
  }

  try {
    return EditorState.fromJSON(editorStateJson(snapshot), { extensions }, snapshotFields);
  } catch (error) {
    console.warn(error);
    return EditorState.create({ doc: markdown, extensions });
  }
}

function editorStateJson(snapshot: EditorStateSnapshot): EditorStateSnapshot {
  return {
    doc: snapshot.doc,
    selection: snapshot.selection,
    history: snapshot.history
  };
}

function normalizedScrollProgressProperty(value: unknown): Pick<EditorStateSnapshot, "scrollProgress"> {
  const scrollProgress = normalizeScrollProgress(value);
  return scrollProgress === undefined ? {} : { scrollProgress };
}

function normalizeScrollProgress(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(1, Math.max(0, value));
}
