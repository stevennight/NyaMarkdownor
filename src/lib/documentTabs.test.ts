import { afterEach, describe, expect, it, vi } from "vitest";
import type { MarkdownDocument } from "../types";
import { createDocumentTabsRecord, documentTabsWithLiveEditorState, loadDocumentTabsRecord, parseDocumentTabsRecord, saveDocumentTabsRecord, saveDocumentTabsRecordImmediately, type DocumentTabState } from "./documentTabs";

const documentState: MarkdownDocument = {
  fileName: "Notes.md",
  filePath: "D:/notes/Notes.md",
  markdown: "# Notes",
  lastSavedMarkdown: "# Saved",
  lineEnding: "lf",
  lastBackupPath: "D:/notes/.nyamarkdownor-backups/Notes.md",
  fileStats: { modifiedMs: 100, size: 7 }
};

const firstTab: DocumentTabState = {
  id: "tab-a",
  document: documentState,
  createdAt: 1000
};

const secondTab: DocumentTabState = {
  id: "tab-b",
  document: {
    ...documentState,
    fileName: "Second.md",
    filePath: "D:/notes/Second.md",
    markdown: "# Second",
    lastSavedMarkdown: "# Second"
  },
  createdAt: 2000
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

describe("document tab session storage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("persists and reloads the open tab session", () => {
    vi.stubGlobal("localStorage", createStorageMock());

    expect(saveDocumentTabsRecord([firstTab, secondTab], "tab-b")).toBe(true);
    expect(loadDocumentTabsRecord()).toMatchObject({
      version: 1,
      activeTabId: "tab-b",
      tabs: [firstTab, secondTab]
    });
    expect(loadDocumentTabsRecord()?.savedAt).toEqual(expect.any(Number));
  });

  it("can flush the open tab session before desktop window close", async () => {
    vi.stubGlobal("localStorage", createStorageMock());

    await expect(saveDocumentTabsRecordImmediately([firstTab, secondTab], "tab-b")).resolves.toBe(true);
    expect(loadDocumentTabsRecord()?.tabs.map((tab) => tab.id)).toEqual(["tab-a", "tab-b"]);
  });

  it("falls back to the first tab when the saved active id is missing", () => {
    const record = createDocumentTabsRecord([firstTab, secondTab], "missing-tab", 123);

    expect(record).toEqual({
      version: 1,
      tableCellBreakFormat: "html",
      savedAt: 123,
      activeTabId: "tab-a",
      tabs: [firstTab, secondTab]
    });
  });

  it("keeps the active tab when trimming very large restored sessions", () => {
    const tabs = Array.from({ length: 30 }, (_value, index) => ({
      ...firstTab,
      id: `tab-${index}`,
      document: {
        ...firstTab.document,
        fileName: `Note ${index}.md`,
        filePath: `D:/notes/Note ${index}.md`
      },
      createdAt: index
    }));
    const record = createDocumentTabsRecord(tabs, "tab-29", 123);

    expect(record.tabs).toHaveLength(24);
    expect(record.activeTabId).toBe("tab-29");
    expect(record.tabs.map((tab) => tab.id)).toContain("tab-29");
    expect(record.tabs.map((tab) => tab.id)).not.toContain("tab-0");
  });

  it("filters malformed tabs and normalizes recoverable documents", () => {
    const raw = JSON.stringify({
      version: 1,
      savedAt: 321,
      activeTabId: "bad-tab",
      tabs: [
        null,
        { id: "bad-tab", document: { fileName: "Broken.md" }, createdAt: 1 },
        {
          id: "",
          document: {
            fileName: "",
            filePath: 42,
            markdown: "# Recovered",
            lastSavedMarkdown: null,
            lastBackupPath: false,
            fileStats: { modifiedMs: Number.NaN, size: 10 }
          },
          createdAt: Number.NaN
        }
      ]
    });

    expect(parseDocumentTabsRecord(raw)).toEqual({
      version: 1,
      tableCellBreakFormat: "html",
      savedAt: 321,
      activeTabId: "restored-tab-3",
      tabs: [{
        id: "restored-tab-3",
        createdAt: 0,
        document: {
          fileName: "Untitled.md",
          filePath: null,
          markdown: "# Recovered",
          lastSavedMarkdown: "# Recovered",
          lineEnding: "lf",
          lastBackupPath: null,
          fileStats: null
        }
      }]
    });
  });

  it("migrates table separators only in markerless restored tab records", () => {
    const markdown = [
      "| Name | Note |",
      "| --- | --- |",
      "| Alice | first\u001fsecond |"
    ].join("\n");
    const legacy = {
      version: 1,
      savedAt: 321,
      activeTabId: "tab-a",
      tabs: [{
        ...firstTab,
        document: { ...firstTab.document, markdown, lastSavedMarkdown: markdown }
      }]
    };

    expect(parseDocumentTabsRecord(JSON.stringify(legacy))?.tabs[0].document).toMatchObject({
      markdown: markdown.replace("\u001f", "<br>"),
      lastSavedMarkdown: markdown.replace("\u001f", "<br>")
    });
    expect(parseDocumentTabsRecord(JSON.stringify({
      ...legacy,
      tableCellBreakFormat: "html"
    }))?.tabs[0].document).toMatchObject({
      markdown,
      lastSavedMarkdown: markdown
    });
  });

  it("deduplicates restored tab ids so malformed sessions stay renderable", () => {
    const record = parseDocumentTabsRecord(JSON.stringify({
      version: 1,
      savedAt: 456,
      activeTabId: "tab-a",
      tabs: [firstTab, { ...secondTab, id: "tab-a" }, { ...secondTab, id: "restored-tab-2" }]
    }));

    expect(record?.tabs.map((tab) => tab.id)).toEqual(["tab-a", "restored-tab-2", "restored-tab-3"]);
    expect(record?.activeTabId).toBe("tab-a");
  });

  it("drops legacy browser file bindings from restored tabs", () => {
    const record = parseDocumentTabsRecord(JSON.stringify({
      version: 1,
      savedAt: 456,
      activeTabId: "tab-a",
      tabs: [{
        ...firstTab,
        document: {
          ...firstTab.document,
          filePath: null,
          browserFileId: "browser-file-legacy"
        }
      }]
    }));

    expect(record?.tabs[0].document).not.toHaveProperty("browserFileId");
    expect(record?.tabs[0].document.filePath).toBeNull();
  });

  it("persists matching editor state snapshots with restored tabs", () => {
    const editorStateSnapshot = {
      doc: "# Notes",
      selection: { ranges: [{ anchor: 2, head: 2 }], main: 0 },
      history: { done: [], undone: [] },
      scrollProgress: 0.25
    };
    const record = createDocumentTabsRecord([{
      ...firstTab,
      editorStateSnapshot
    }], "tab-a", 789);

    expect(record.tabs[0].editorStateSnapshot).toEqual(editorStateSnapshot);
    expect(parseDocumentTabsRecord(JSON.stringify(record))?.tabs[0].editorStateSnapshot).toEqual(editorStateSnapshot);
  });

  it("persists normalized visual-editor scroll progress with restored tabs", () => {
    const record = createDocumentTabsRecord([{
      ...firstTab,
      richScrollProgress: 0.64
    }], "tab-a", 790);

    expect(record.tabs[0].richScrollProgress).toBe(0.64);
    expect(parseDocumentTabsRecord(JSON.stringify(record))?.tabs[0].richScrollProgress).toBe(0.64);
    expect(parseDocumentTabsRecord(JSON.stringify({
      ...record,
      tabs: [{ ...record.tabs[0], richScrollProgress: 2 }]
    }))?.tabs[0].richScrollProgress).toBe(1);
  });

  it("persists finite visual-editor text selections with restored tabs", () => {
    const record = createDocumentTabsRecord([{
      ...firstTab,
      richSelection: { from: 19.8, to: 4.2 }
    }], "tab-a", 791);

    expect(record.tabs[0].richSelection).toEqual({ from: 4, to: 19 });
    expect(parseDocumentTabsRecord(JSON.stringify(record))?.tabs[0].richSelection).toEqual({ from: 4, to: 19 });
  });

  it("merges live editor text into the tab that owns the mounted editor, not just the active tab", () => {
    const tabs = documentTabsWithLiveEditorState([firstTab, secondTab], {
      tabId: "tab-a",
      markdown: "# Notes\nlast key",
      editorStateSnapshot: { doc: "# Notes\nlast key", selection: { ranges: [] }, history: {} }
    });

    expect(tabs[0].document.markdown).toBe("# Notes\nlast key");
    expect(tabs[0].editorStateSnapshot?.doc).toBe("# Notes\nlast key");
    expect(tabs[1].document.markdown).toBe("# Second");
  });

  it("keeps stored snapshots for inactive tabs and drops stale live snapshots", () => {
    const tabs = documentTabsWithLiveEditorState([firstTab, secondTab], {
      tabId: "tab-a",
      markdown: "# Notes fresh",
      editorStateSnapshot: { doc: "# Old", selection: { ranges: [] }, history: {} },
      storedEditorStateSnapshots: new Map([
        ["tab-b", { doc: "# Second", selection: { ranges: [{ anchor: 1, head: 1 }], main: 0 }, history: {} }]
      ])
    });

    expect(tabs[0].document.markdown).toBe("# Notes fresh");
    expect(tabs[0].editorStateSnapshot).toBeUndefined();
    expect(tabs[1].editorStateSnapshot?.doc).toBe("# Second");
  });

  it("merges live visual-editor scroll state without modifying document text", () => {
    const tabs = documentTabsWithLiveEditorState([firstTab, secondTab], {
      tabId: "tab-a",
      richScrollProgress: 0.35,
      storedRichScrollProgress: new Map([["tab-b", 0.72]])
    });

    expect(tabs[0].richScrollProgress).toBe(0.35);
    expect(tabs[1].richScrollProgress).toBe(0.72);
    expect(tabs.map((tab) => tab.document.markdown)).toEqual(["# Notes", "# Second"]);
  });

  it("merges live visual selections independently from source editor snapshots", () => {
    const tabs = documentTabsWithLiveEditorState([firstTab, secondTab], {
      tabId: "tab-a",
      richSelection: { from: 3, to: 8 },
      storedRichSelections: new Map([["tab-b", { from: 1, to: 2 }]])
    });

    expect(tabs[0].richSelection).toEqual({ from: 3, to: 8 });
    expect(tabs[1].richSelection).toEqual({ from: 1, to: 2 });
  });

  it("drops stale editor state snapshots when restored document text differs", () => {
    const record = parseDocumentTabsRecord(JSON.stringify({
      version: 1,
      savedAt: 789,
      activeTabId: "tab-a",
      tabs: [{
        ...firstTab,
        editorStateSnapshot: { doc: "# Old", selection: { ranges: [] }, history: {} }
      }]
    }));

    expect(record?.tabs[0].editorStateSnapshot).toBeUndefined();
  });

  it("does not throw when tab persistence is unavailable", () => {
    vi.stubGlobal("localStorage", createStorageMock({ setThrows: true }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(saveDocumentTabsRecord([firstTab], "tab-a")).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it("falls back to no tab session when storage cannot be read", () => {
    vi.stubGlobal("localStorage", createStorageMock({ getThrows: true }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(loadDocumentTabsRecord()).toBeNull();
    expect(warn).toHaveBeenCalled();
  });
});
