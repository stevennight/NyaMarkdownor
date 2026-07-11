import { describe, expect, it } from "vitest";
import type { MarkdownDocument } from "../types";
import type { OpenedFile } from "./fileIo";
import { applySavedFileToDocument, diskStatusLabel, documentEditStatusLabel, saveAllStoppedLabel, saveSafetyStatusLabel, savedTabsLabel, tabSessionEditStatusLabel } from "./documentSaveState";

const currentDocument: MarkdownDocument = {
  fileName: "Draft.md",
  filePath: "D:/notes/Draft.md",
  markdown: "# Draft\n\nNew typing after save started",
  lastSavedMarkdown: "# Draft",
  lineEnding: "lf",
  lastBackupPath: null,
  fileStats: { modifiedMs: 10, size: 7 }
};

describe("document save state", () => {
  it("uses the content that was actually written as the saved baseline", () => {
    const saved: OpenedFile = {
      path: "D:/notes/Draft.md",
      name: "Draft.md",
      markdown: "# Draft",
      lineEnding: "crlf",
      backupPath: "D:/notes/.nyamarkdownor-backups/Draft.md.1.bak",
      fileStats: { modifiedMs: 20, size: 7 }
    };

    expect(applySavedFileToDocument(currentDocument, saved)).toEqual({
      ...currentDocument,
      lastSavedMarkdown: "# Draft",
      lineEnding: "crlf",
      lastBackupPath: "D:/notes/.nyamarkdownor-backups/Draft.md.1.bak",
      fileStats: { modifiedMs: 20, size: 7 }
    });
  });

  it("formats save-all result labels", () => {
    expect(savedTabsLabel(1)).toBe("Saved 1 tab");
    expect(savedTabsLabel(3)).toBe("Saved 3 tabs");
    expect(saveAllStoppedLabel(0, "canceled")).toBe("Save all canceled");
    expect(saveAllStoppedLabel(2, "canceled")).toBe("Saved 2 tabs; save all stopped");
    expect(saveAllStoppedLabel(0, "downloaded")).toBe("Downloaded copy; local file binding unavailable");
    expect(saveAllStoppedLabel(1, "downloaded")).toBe("Saved 1 tab; downloaded copy; local file binding unavailable");
  });

  it("describes disk state without pretending local drafts are disk files", () => {
    expect(diskStatusLabel({ filePath: null, fileStats: null }, false)).toBe("Local draft");
    expect(diskStatusLabel({ filePath: "D:/notes/Draft.md", fileStats: null }, false)).toBe("Disk needs review");
    expect(diskStatusLabel({ filePath: "D:/notes/Draft.md", fileStats: { modifiedMs: 10, size: 7 } }, false)).toBe("Disk current");
    expect(diskStatusLabel({ filePath: "D:/notes/Draft.md", fileStats: { modifiedMs: 10, size: 7 } }, true)).toBe("Disk needs review");
  });

  it("describes save safety without claiming drafts have overwrite protection", () => {
    expect(saveSafetyStatusLabel({ filePath: null, lastBackupPath: null })).toBe("No disk file");
    expect(saveSafetyStatusLabel({ filePath: "D:/notes/Draft.md", lastBackupPath: null })).toBe("Safe save armed");
    expect(saveSafetyStatusLabel({ filePath: "D:/notes/Draft.md", lastBackupPath: "D:/notes/.nyamarkdownor-backups/Draft.md.1.bak" })).toBe("Last save backed up");
  });

  it("does not call unbound drafts saved files", () => {
    expect(documentEditStatusLabel({ filePath: null, markdown: "# Draft", lastSavedMarkdown: "# Draft" })).toBe("Draft");
    expect(documentEditStatusLabel({ filePath: null, markdown: "# Changed", lastSavedMarkdown: "# Draft" })).toBe("Unsaved draft");
    expect(documentEditStatusLabel({ filePath: "D:/notes/Draft.md", markdown: "# Draft", lastSavedMarkdown: "# Draft" })).toBe("Saved");
    expect(documentEditStatusLabel({ filePath: "D:/notes/Draft.md", markdown: "# Changed", lastSavedMarkdown: "# Draft" })).toBe("Unsaved");
  });

  it("summarizes dirty tabs without hiding inactive unsaved work", () => {
    expect(tabSessionEditStatusLabel({ filePath: null, markdown: "# Draft", lastSavedMarkdown: "# Draft" }, 0)).toBe("Draft not on disk");
    expect(tabSessionEditStatusLabel({ filePath: "D:/notes/Draft.md", markdown: "# Draft", lastSavedMarkdown: "# Draft" }, 0)).toBe("All changes saved");
    expect(tabSessionEditStatusLabel({ filePath: null, markdown: "# Changed", lastSavedMarkdown: "# Draft" }, 1)).toBe("Unsaved draft changes");
    expect(tabSessionEditStatusLabel({ filePath: "D:/notes/Draft.md", markdown: "# Changed", lastSavedMarkdown: "# Draft" }, 1)).toBe("Unsaved changes");
    expect(tabSessionEditStatusLabel({ filePath: "D:/notes/Draft.md", markdown: "# Draft", lastSavedMarkdown: "# Draft" }, 1)).toBe("1 unsaved tab");
    expect(tabSessionEditStatusLabel({ filePath: "D:/notes/Draft.md", markdown: "# Changed", lastSavedMarkdown: "# Draft" }, 3)).toBe("3 unsaved tabs");
  });
});
