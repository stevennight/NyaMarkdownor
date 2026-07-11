import { describe, expect, it } from "vitest";
import { documentWindowTitle } from "./windowTitle";

describe("document window title", () => {
  it("shows the active document name and app name", () => {
    expect(documentWindowTitle({
      displayName: "Notes.md",
      dirty: false,
      dirtyTabsCount: 0
    })).toBe("Notes.md - NyaMarkdownor");
  });

  it("marks the active document when it is dirty", () => {
    expect(documentWindowTitle({
      displayName: "Notes.md",
      dirty: true,
      dirtyTabsCount: 1
    })).toBe("* Notes.md - NyaMarkdownor");
  });

  it("includes the unsaved tab count when several tabs are dirty", () => {
    expect(documentWindowTitle({
      displayName: "Clean.md",
      dirty: false,
      dirtyTabsCount: 3
    })).toBe("Clean.md (3 unsaved) - NyaMarkdownor");
  });

  it("falls back to an untitled document name", () => {
    expect(documentWindowTitle({
      displayName: " ",
      dirty: false,
      dirtyTabsCount: 0
    })).toBe("Untitled.md - NyaMarkdownor");
  });
});
