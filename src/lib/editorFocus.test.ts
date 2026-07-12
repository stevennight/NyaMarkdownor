import { describe, expect, it } from "vitest";
import {
  shouldFocusEditorView,
  shouldFocusPendingMountedEditor,
  shouldPreserveEditorSelectionOnToolbarMouseDown
} from "./editorFocus";

describe("editor focus ownership", () => {
  it("focuses only the editor owned by the active tab outside preview mode", () => {
    expect(shouldFocusEditorView("tab-a", "tab-a", "focus")).toBe(true);
    expect(shouldFocusEditorView("tab-a", "tab-a", "split")).toBe(true);
    expect(shouldFocusEditorView("tab-a", "tab-a", "preview")).toBe(false);
    expect(shouldFocusEditorView("tab-a", "tab-b", "focus")).toBe(false);
    expect(shouldFocusEditorView(null, "tab-a", "focus")).toBe(false);
  });

  it("applies deferred focus only to the newly mounted active editor", () => {
    expect(shouldFocusPendingMountedEditor("tab-a", "tab-a", "tab-a", "focus")).toBe(true);
    expect(shouldFocusPendingMountedEditor("tab-a", "tab-a", "tab-a", "split")).toBe(true);
    expect(shouldFocusPendingMountedEditor("tab-a", "tab-a", "tab-a", "preview")).toBe(false);
    expect(shouldFocusPendingMountedEditor("tab-a", "tab-b", "tab-b", "focus")).toBe(false);
    expect(shouldFocusPendingMountedEditor("tab-a", "tab-a", "tab-b", "focus")).toBe(false);
    expect(shouldFocusPendingMountedEditor(null, "tab-a", "tab-a", "focus")).toBe(false);
  });

  it("keeps a rich editor selection visible while clicking toolbar controls", () => {
    expect(shouldPreserveEditorSelectionOnToolbarMouseDown("wysiwyg", 0, true)).toBe(true);
    expect(shouldPreserveEditorSelectionOnToolbarMouseDown("focus", 0, true)).toBe(false);
    expect(shouldPreserveEditorSelectionOnToolbarMouseDown("wysiwyg", 2, true)).toBe(false);
    expect(shouldPreserveEditorSelectionOnToolbarMouseDown("wysiwyg", 0, false)).toBe(false);
  });
});
