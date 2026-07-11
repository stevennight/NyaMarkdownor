import { describe, expect, it } from "vitest";
import {
  activeDocumentTabIdAfterClosing,
  documentTabIdsAfter,
  documentTabIdAtShortcutIndex,
  documentTabOrderKey,
  duplicatePathOpenAction,
  savedPathConflictAction,
  savedPathConflictingTab,
  rememberClosedDocumentTabs,
  nextDocumentTabId,
  remainingDocumentTabIds,
  replaceableDraftTabId,
  reorderDocumentTabs
} from "./documentTabNavigation";

describe("document tab navigation", () => {
  const tabIds = ["tab-a", "tab-b", "tab-c", "tab-d"];

  it("cycles next and previous tab ids", () => {
    expect(nextDocumentTabId(tabIds, "tab-b", 1)).toBe("tab-c");
    expect(nextDocumentTabId(tabIds, "tab-b", -1)).toBe("tab-a");
    expect(nextDocumentTabId(tabIds, "tab-d", 1)).toBe("tab-a");
    expect(nextDocumentTabId(tabIds, "tab-a", -1)).toBe("tab-d");
  });

  it("falls back from a missing active id without throwing", () => {
    expect(nextDocumentTabId(tabIds, "missing", 1)).toBe("tab-b");
    expect(nextDocumentTabId(tabIds, "missing", -1)).toBe("tab-d");
  });

  it("does not navigate when there is no alternative tab", () => {
    expect(nextDocumentTabId(["tab-a"], "tab-a", 1)).toBeNull();
    expect(nextDocumentTabId([], "tab-a", 1)).toBeNull();
  });

  it("selects tab ids by shortcut index and treats the ninth shortcut as last tab", () => {
    expect(documentTabIdAtShortcutIndex(tabIds, 0)).toBe("tab-a");
    expect(documentTabIdAtShortcutIndex(tabIds, 3)).toBe("tab-d");
    expect(documentTabIdAtShortcutIndex(tabIds, 8)).toBe("tab-d");
    expect(documentTabIdAtShortcutIndex(tabIds, 4)).toBeNull();
  });

  it("builds a stable tab order key from ids only", () => {
    expect(documentTabOrderKey(["tab-a", "tab-b"])).toBe(documentTabOrderKey(["tab-a", "tab-b"]));
    expect(documentTabOrderKey(["tab-a", "tab-b"])).not.toBe(documentTabOrderKey(["tab-b", "tab-a"]));
    expect(documentTabOrderKey(["tab-a", "tab-b"])).not.toBe(documentTabOrderKey(["tab-a", "tab-c"]));
  });

  it("keeps tab order after closing a batch", () => {
    expect(remainingDocumentTabIds(tabIds, new Set(["tab-b", "tab-d"]))).toEqual(["tab-a", "tab-c"]);
  });

  it("selects tab ids to the right of a target tab", () => {
    expect(documentTabIdsAfter(tabIds, "tab-b")).toEqual(["tab-c", "tab-d"]);
    expect(documentTabIdsAfter(tabIds, "tab-d")).toEqual([]);
    expect(documentTabIdsAfter(tabIds, "missing")).toEqual([]);
  });

  it("remembers closed tabs with the most recently closed tab first", () => {
    const closed = rememberClosedDocumentTabs(
      [{ id: "old-a" }],
      [{ id: "tab-b" }, { id: "tab-c" }],
      3
    );

    expect(closed.map((tab) => tab.id)).toEqual(["tab-c", "tab-b", "old-a"]);
  });

  it("bounds the closed tab history", () => {
    const closed = rememberClosedDocumentTabs(
      [{ id: "old-a" }, { id: "old-b" }],
      [{ id: "tab-b" }, { id: "tab-c" }],
      2
    );

    expect(closed.map((tab) => tab.id)).toEqual(["tab-c", "tab-b"]);
    expect(rememberClosedDocumentTabs([{ id: "old-a" }], [{ id: "tab-b" }], 0)).toEqual([]);
  });

  it("keeps the active tab when it is not being closed", () => {
    expect(activeDocumentTabIdAfterClosing(tabIds, "tab-c", new Set(["tab-a", "tab-b"]))).toBe("tab-c");
  });

  it("moves active tab to the nearest right neighbor when the active tab is closed", () => {
    expect(activeDocumentTabIdAfterClosing(tabIds, "tab-b", new Set(["tab-b"]))).toBe("tab-c");
    expect(activeDocumentTabIdAfterClosing(tabIds, "tab-c", new Set(["tab-b", "tab-c"]))).toBe("tab-d");
  });

  it("falls back left when closing the active tab at the end", () => {
    expect(activeDocumentTabIdAfterClosing(tabIds, "tab-d", new Set(["tab-d"]))).toBe("tab-c");
  });

  it("returns no active tab when every tab closes", () => {
    expect(activeDocumentTabIdAfterClosing(tabIds, "tab-b", new Set(tabIds))).toBeNull();
  });

  it("identifies a clean active placeholder draft that can be replaced by an opened file", () => {
    const tabs = [
      tab("tab-a", { filePath: "C:/notes/a.md", markdown: "# A", lastSavedMarkdown: "# A" }),
      tab("tab-b", { markdown: "" })
    ];

    expect(replaceableDraftTabId(tabs, "tab-b")).toBe("tab-b");
  });

  it("allows the bundled sample draft to be replaced only when passed as a placeholder", () => {
    const sample = "# Sample\n";
    const tabs = [tab("tab-a", { markdown: sample, lastSavedMarkdown: sample })];

    expect(replaceableDraftTabId(tabs, "tab-a")).toBeNull();
    expect(replaceableDraftTabId(tabs, "tab-a", [sample])).toBe("tab-a");
  });

  it("keeps user drafts, dirty drafts, and saved files out of placeholder replacement", () => {
    expect(replaceableDraftTabId([tab("dirty", { markdown: "changed", lastSavedMarkdown: "" })], "dirty")).toBeNull();
    expect(replaceableDraftTabId([tab("saved", { filePath: "C:/notes/saved.md" })], "saved")).toBeNull();
    expect(replaceableDraftTabId([tab("named", { fileName: "Idea.md", markdown: "", lastSavedMarkdown: "" })], "named")).toBeNull();
    expect(replaceableDraftTabId([tab("content", { markdown: "# Recovered idea", lastSavedMarkdown: "# Recovered idea" })], "content")).toBeNull();
  });

  it("does not treat a stale browser file id as a real local file binding", () => {
    const legacyTab = {
      ...tab("browser", {}),
      document: {
        ...tab("browser", {}).document,
        browserFileId: "browser-file-1"
      }
    };

    expect(replaceableDraftTabId([legacyTab], "browser")).toBe("browser");
  });

  it("switches to an already open file when the editor matches disk", () => {
    expect(duplicatePathOpenAction(
      tab("existing", { filePath: "D:/notes/a.md", markdown: "# A", lastSavedMarkdown: "# A" }).document,
      { path: "d:\\notes\\A.md", markdown: "# A" }
    )).toBe("switch-existing");
  });

  it("refreshes an already open clean tab when disk changed", () => {
    expect(duplicatePathOpenAction(
      tab("existing", { filePath: "D:/notes/a.md", markdown: "# Old", lastSavedMarkdown: "# Old" }).document,
      { path: "D:/notes/a.md", markdown: "# New" }
    )).toBe("replace-existing");
  });

  it("opens the disk version beside a dirty tab when contents differ", () => {
    expect(duplicatePathOpenAction(
      tab("existing", { filePath: "D:/notes/a.md", markdown: "# Draft", lastSavedMarkdown: "# Saved" }).document,
      { path: "D:/notes/a.md", markdown: "# Disk" }
    )).toBe("open-disk-version");
  });

  it("can clear dirty state when a reopened dirty tab now matches disk", () => {
    expect(duplicatePathOpenAction(
      tab("existing", { filePath: "D:/notes/a.md", markdown: "# Same", lastSavedMarkdown: "# Old" }).document,
      { path: "D:/notes/a.md", markdown: "# Same" }
    )).toBe("replace-existing");
  });

  it("opens a new tab when there is no matching local path", () => {
    expect(duplicatePathOpenAction(
      tab("existing", { filePath: "D:/notes/a.md", markdown: "# A", lastSavedMarkdown: "# A" }).document,
      { path: "D:/notes/b.md", markdown: "# B" }
    )).toBe("new-tab");
    expect(duplicatePathOpenAction(null, { path: null, markdown: "# Browser import" })).toBe("new-tab");
  });

  it("finds another tab already bound to a saved path", () => {
    const tabs = [
      tab("draft", { filePath: null, markdown: "# Draft" }),
      tab("saved", { filePath: "D:/notes/a.md", markdown: "# A" }),
      tab("other", { filePath: "D:/notes/b.md", markdown: "# B" })
    ];

    expect(savedPathConflictingTab(tabs, "draft", "d:\\notes\\A.md")?.id).toBe("saved");
    expect(savedPathConflictingTab(tabs, "saved", "D:/notes/a.md")).toBeNull();
    expect(savedPathConflictingTab(tabs, "draft", null)).toBeNull();
  });

  it("closes saved-path conflicts unless the other tab has unique unsaved content", () => {
    expect(savedPathConflictAction(
      tab("clean", { filePath: "D:/notes/a.md", markdown: "# Old", lastSavedMarkdown: "# Old" }).document,
      "# New"
    )).toBe("close-conflicting-tab");

    expect(savedPathConflictAction(
      tab("same", { filePath: "D:/notes/a.md", markdown: "# New", lastSavedMarkdown: "# Old" }).document,
      "# New"
    )).toBe("close-conflicting-tab");

    expect(savedPathConflictAction(
      tab("dirty", { filePath: "D:/notes/a.md", markdown: "# Unsaved", lastSavedMarkdown: "# Old" }).document,
      "# New"
    )).toBe("detach-conflicting-tab");
  });

  it("reorders tabs before or after a drop target", () => {
    const tabs = tabIds.map((id) => ({ id }));

    expect(reorderDocumentTabs(tabs, "tab-d", "tab-b", "before").map((tab) => tab.id)).toEqual(["tab-a", "tab-d", "tab-b", "tab-c"]);
    expect(reorderDocumentTabs(tabs, "tab-a", "tab-c", "after").map((tab) => tab.id)).toEqual(["tab-b", "tab-c", "tab-a", "tab-d"]);
  });

  it("keeps tab objects renderable when reordering input is missing or self-targeted", () => {
    const tabs = tabIds.map((id) => ({ id }));

    expect(reorderDocumentTabs(tabs, "tab-b", "tab-b", "after")).toEqual(tabs);
    expect(reorderDocumentTabs(tabs, "missing", "tab-b", "before")).toEqual(tabs);
    expect(reorderDocumentTabs(tabs, "tab-b", "missing", "before")).toEqual(tabs);
  });
});

function tab(
  id: string,
  document: Partial<{
    fileName: string;
    filePath: string | null;
    markdown: string;
    lastSavedMarkdown: string;
    lastBackupPath: string | null;
    fileStats: unknown;
  }>
) {
  const markdown = document.markdown ?? "";
  return {
    id,
    document: {
      fileName: document.fileName ?? "Untitled.md",
      filePath: document.filePath ?? null,
      markdown,
      lastSavedMarkdown: document.lastSavedMarkdown ?? markdown,
      lastBackupPath: document.lastBackupPath ?? null,
      fileStats: document.fileStats ?? null
    }
  };
}
