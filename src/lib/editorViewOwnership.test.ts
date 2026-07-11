import { describe, expect, it } from "vitest";
import { activeOwnedEditorView } from "./editorViewOwnership";

describe("editor view ownership", () => {
  it("returns the mounted editor only when it belongs to the active tab", () => {
    const view = { id: "editor" };

    expect(activeOwnedEditorView(view, "tab-a", "tab-a")).toBe(view);
    expect(activeOwnedEditorView(view, "tab-a", "tab-b")).toBeNull();
  });

  it("does not expose an editor view without a known owning tab", () => {
    const view = { id: "editor" };

    expect(activeOwnedEditorView(view, null, "tab-a")).toBeNull();
    expect(activeOwnedEditorView(view, "tab-a", null)).toBeNull();
    expect(activeOwnedEditorView(null, "tab-a", "tab-a")).toBeNull();
  });
});
