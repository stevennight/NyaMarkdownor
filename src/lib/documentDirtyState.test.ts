import { describe, expect, it } from "vitest";
import { dirtyDocuments, isDocumentDirty } from "./documentDirtyState";

describe("document dirty state", () => {
  it("detects whether markdown differs from the saved baseline", () => {
    expect(isDocumentDirty({ markdown: "# Saved", lastSavedMarkdown: "# Saved" })).toBe(false);
    expect(isDocumentDirty({ markdown: "# Changed", lastSavedMarkdown: "# Saved" })).toBe(true);
  });

  it("filters dirty tabs from the provided current tab session", () => {
    const clean = { id: "clean", document: { markdown: "# A", lastSavedMarkdown: "# A" } };
    const dirty = { id: "dirty", document: { markdown: "# B changed", lastSavedMarkdown: "# B" } };

    expect(dirtyDocuments([clean, dirty])).toEqual([dirty]);
  });
});
