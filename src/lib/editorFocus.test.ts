import { describe, expect, it } from "vitest";
import { shouldFocusEditorView, shouldFocusPendingMountedEditor } from "./editorFocus";

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
});
