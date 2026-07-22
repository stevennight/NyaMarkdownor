import { afterEach, describe, expect, it, vi } from "vitest";
import type { MarkdownDocument } from "../types";
import { createDraftDocumentRecord, loadDraftDocument, loadDraftDocumentRecord, parseDraftDocumentRecord, saveDraftDocument, saveDraftDocumentImmediately } from "./draftDocument";

const documentState: MarkdownDocument = {
  fileName: "Notes.md",
  filePath: "D:/notes/Notes.md",
  markdown: "# Notes",
  lastSavedMarkdown: "# Saved",
  lineEnding: "lf",
  lastBackupPath: "D:/notes/.nyamarkdownor-backups/Notes.md",
  fileStats: { modifiedMs: 100, size: 7 }
};

function createStorageMock(options: { setThrows?: boolean; getThrows?: boolean } = {}): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear: vi.fn(() => store.clear()),
    getItem: vi.fn((key: string) => {
      if (options.getThrows) throw new Error("storage unavailable");
      return store.get(key) ?? null;
    }),
    key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      if (options.setThrows) throw new Error("quota exceeded");
      store.set(key, value);
    })
  };
}

describe("draft document storage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("persists and reloads the current editor draft", () => {
    vi.stubGlobal("localStorage", createStorageMock());

    expect(saveDraftDocument(documentState)).toBe(true);
    expect(loadDraftDocument()).toEqual(documentState);
    expect(loadDraftDocumentRecord()).toMatchObject({
      version: 1,
      document: documentState
    });
    expect(loadDraftDocumentRecord()?.savedAt).toEqual(expect.any(Number));
  });

  it("can flush the current editor draft before desktop window close", async () => {
    vi.stubGlobal("localStorage", createStorageMock());

    await expect(saveDraftDocumentImmediately(documentState)).resolves.toBe(true);
    expect(loadDraftDocument()).toEqual(documentState);
  });

  it("parses desktop draft records with their saved timestamp", () => {
    const record = createDraftDocumentRecord(documentState, 123);

    expect(parseDraftDocumentRecord(JSON.stringify(record))).toEqual(record);
  });

  it("normalizes older or malformed draft payloads", () => {
    const storage = createStorageMock();
    vi.stubGlobal("localStorage", storage);
    storage.setItem("nya-markdownor-draft-v2", JSON.stringify({
      fileName: "",
      filePath: 42,
      markdown: "# Recovered",
      lastSavedMarkdown: null,
      lastBackupPath: false,
      fileStats: { modifiedMs: Number.NaN, size: 10 }
    }));

    expect(loadDraftDocument()).toEqual({
      fileName: "Untitled.md",
      filePath: null,
      markdown: "# Recovered",
      lastSavedMarkdown: "# Recovered",
      lineEnding: "lf",
      lastBackupPath: null,
      fileStats: null
    });
    expect(loadDraftDocumentRecord()?.savedAt).toBe(0);
  });

  it("migrates legacy CRLF drafts to normalized editor text", () => {
    const record = parseDraftDocumentRecord(JSON.stringify({
      fileName: "Windows.md",
      filePath: "D:/notes/Windows.md",
      markdown: "alpha\r\nbeta\r\n",
      lastSavedMarkdown: "alpha\r\nbeta\r\n"
    }));

    expect(record?.document).toMatchObject({
      markdown: "alpha\nbeta\n",
      lastSavedMarkdown: "alpha\nbeta\n",
      lineEnding: "crlf"
    });
  });

  it("migrates safe Windows verbatim paths in recovered drafts", () => {
    const record = parseDraftDocumentRecord(JSON.stringify({
      fileName: "Recovered.md",
      filePath: "\\\\?\\D:\\notes\\Recovered.md",
      markdown: "# Recovered",
      lastSavedMarkdown: "# Recovered",
      lastBackupPath: "\\\\?\\D:\\backups\\Recovered.md.bak"
    }));

    expect(record?.document).toMatchObject({
      filePath: "D:\\notes\\Recovered.md",
      lastBackupPath: "D:\\backups\\Recovered.md.bak"
    });
  });

  it("migrates legacy table cell separators in recovered Markdown", () => {
    const markdown = [
      "| Name | Note |",
      "| --- | --- |",
      "| Alice | first\u001fsecond |"
    ].join("\n");
    const record = parseDraftDocumentRecord(JSON.stringify({
      fileName: "Recovered.md",
      filePath: "D:/notes/Recovered.md",
      markdown,
      lastSavedMarkdown: markdown
    }));

    expect(record?.document).toMatchObject({
      markdown: [
        "| Name | Note |",
        "| --- | --- |",
        "| Alice | first<br>second |"
      ].join("\n"),
      lastSavedMarkdown: [
        "| Name | Note |",
        "| --- | --- |",
        "| Alice | first<br>second |"
      ].join("\n")
    });
  });

  it("preserves table control characters in marker-bearing draft records", () => {
    const markdown = [
      "| Name | Note |",
      "| --- | --- |",
      "| Alice | first\u001fsecond |"
    ].join("\n");
    const record = createDraftDocumentRecord({
      ...documentState,
      markdown,
      lastSavedMarkdown: markdown
    });

    expect(parseDraftDocumentRecord(JSON.stringify(record))?.document).toMatchObject({
      markdown,
      lastSavedMarkdown: markdown
    });
  });

  it("drops legacy browser file bindings from persisted drafts", () => {
    const record = parseDraftDocumentRecord(JSON.stringify(createDraftDocumentRecord({
      ...documentState,
      filePath: null,
      browserFileId: "browser-file-legacy"
    } as MarkdownDocument & { browserFileId: string }, 123)));

    expect(record?.document).not.toHaveProperty("browserFileId");
  });

  it("does not throw when draft persistence is unavailable", () => {
    vi.stubGlobal("localStorage", createStorageMock({ setThrows: true }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(saveDraftDocument(documentState)).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it("falls back to no draft when storage cannot be read", () => {
    vi.stubGlobal("localStorage", createStorageMock({ getThrows: true }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(loadDraftDocument()).toBeNull();
    expect(warn).toHaveBeenCalled();
  });
});
