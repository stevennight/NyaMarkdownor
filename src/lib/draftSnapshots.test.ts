import { afterEach, describe, expect, it, vi } from "vitest";
import type { MarkdownDocument } from "../types";
import {
  createDraftSnapshot,
  createDraftSnapshotsRecord,
  forgetDraftSnapshot,
  loadDraftSnapshots,
  loadDraftSnapshotsRecord,
  parseDraftSnapshotsRecord,
  prioritizeDraftSnapshots,
  rememberDraftSnapshot,
  rememberDraftSnapshots,
  saveDraftSnapshots,
  saveDraftSnapshotsImmediately,
  snapshotDocumentKey
} from "./draftSnapshots";

const baseDocument: MarkdownDocument = {
  fileName: "Notes.md",
  filePath: "D:/notes/Notes.md",
  markdown: "# Notes",
  lastSavedMarkdown: "",
  lineEnding: "lf",
  lastBackupPath: null,
  fileStats: { modifiedMs: 10, size: 7 }
};

function createStorageMock(options: { setThrows?: boolean } = {}): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear: vi.fn(() => store.clear()),
    getItem: vi.fn((key: string) => store.get(key) ?? null),
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

describe("draft snapshots", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("creates a local recovery snapshot from the current document", () => {
    const snapshot = createDraftSnapshot(baseDocument, 100);

    expect(snapshot.fileName).toBe("Notes.md");
    expect(snapshot.filePath).toBe("D:/notes/Notes.md");
    expect(snapshot.markdown).toBe("# Notes");
    expect(snapshot.lastSavedMarkdown).toBe("");
    expect(snapshot.lineEnding).toBe("lf");
    expect(snapshot.fileStats).toEqual({ modifiedMs: 10, size: 7 });
    expect(snapshot.createdAt).toBe(100);
    expect(snapshot.size).toBeGreaterThan(0);
    expect(snapshot.kind).toBe("preserved");
  });

  it("keeps the local recovery reason with the snapshot", () => {
    expect(createDraftSnapshot(baseDocument, 100, "automatic").kind).toBe("automatic");
    expect(createDraftSnapshot(baseDocument, 100, "manual").kind).toBe("manual");
  });

  it("deduplicates consecutive snapshots for the same document content", () => {
    const first = createDraftSnapshot(baseDocument, 100);
    const duplicate = createDraftSnapshot(baseDocument, 200);

    expect(rememberDraftSnapshot([first], duplicate)).toEqual([first]);
  });

  it("keeps newer snapshots first and bounds per-document history", () => {
    const snapshots = Array.from({ length: 12 }, (_value, index) => createDraftSnapshot({
      ...baseDocument,
      markdown: `# Notes ${index}`
    }, index + 1));

    const remembered = snapshots.reduce((current, snapshot) => rememberDraftSnapshot(current, snapshot), [] as typeof snapshots);

    expect(remembered).toHaveLength(8);
    expect(remembered[0].markdown).toBe("# Notes 11");
    expect(remembered[7].markdown).toBe("# Notes 4");
  });

  it("remembers multiple local recovery snapshots as one bounded update", () => {
    const first = createDraftSnapshot(baseDocument, 100);
    const second = createDraftSnapshot({
      ...baseDocument,
      fileName: "Other.md",
      filePath: "D:/notes/Other.md",
      markdown: "# Other"
    }, 200);

    expect(rememberDraftSnapshots([], [first, second])).toEqual({
      changed: true,
      snapshots: [second, first]
    });

    expect(rememberDraftSnapshots([second, first], [createDraftSnapshot(baseDocument, 300)])).toEqual({
      changed: false,
      snapshots: [second, first]
    });
  });

  it("uses a draft key when no file path exists", () => {
    expect(snapshotDocumentKey({ fileName: "Untitled.md", filePath: null })).toBe("draft:Untitled.md");
  });

  it("removes a single local snapshot by id", () => {
    const first = createDraftSnapshot(baseDocument, 100);
    const second = createDraftSnapshot({ ...baseDocument, markdown: "# Changed" }, 200);

    expect(forgetDraftSnapshot([second, first], second.id)).toEqual([first]);
  });

  it("prioritizes snapshots for the current document before other recent snapshots", () => {
    const currentOlder = createDraftSnapshot(baseDocument, 100);
    const otherNewer = createDraftSnapshot({
      ...baseDocument,
      fileName: "Other.md",
      filePath: "D:/notes/Other.md",
      markdown: "# Other"
    }, 300);
    const currentNewer = createDraftSnapshot({ ...baseDocument, markdown: "# Current newer" }, 200);

    const prioritized = prioritizeDraftSnapshots([otherNewer, currentOlder, currentNewer], baseDocument);

    expect(prioritized.map((snapshot) => snapshot.id)).toEqual([
      currentNewer.id,
      currentOlder.id,
      otherNewer.id
    ]);
  });

  it("persists and reloads local snapshots", () => {
    vi.stubGlobal("localStorage", createStorageMock());
    const snapshot = createDraftSnapshot(baseDocument, 100);

    expect(saveDraftSnapshots([snapshot])).toBe(true);
    expect(loadDraftSnapshots()).toEqual([snapshot]);
    expect(loadDraftSnapshotsRecord()).toMatchObject({
      version: 1,
      snapshots: [snapshot]
    });
    expect(loadDraftSnapshotsRecord()?.savedAt).toEqual(expect.any(Number));
  });

  it("can flush local snapshots before desktop window close", async () => {
    vi.stubGlobal("localStorage", createStorageMock());
    const snapshot = createDraftSnapshot(baseDocument, 100);

    await expect(saveDraftSnapshotsImmediately([snapshot])).resolves.toBe(true);
    expect(loadDraftSnapshots()).toEqual([snapshot]);
  });

  it("parses desktop snapshot records with their saved timestamp", () => {
    const snapshot = createDraftSnapshot(baseDocument, 100);
    const record = createDraftSnapshotsRecord([snapshot], 123);

    expect(parseDraftSnapshotsRecord(JSON.stringify(record))).toEqual(record);
  });

  it("loads legacy snapshot arrays as migration records", () => {
    const storage = createStorageMock();
    vi.stubGlobal("localStorage", storage);
    const snapshot = createDraftSnapshot(baseDocument, 100);
    storage.setItem("nya-markdownor-draft-snapshots-v1", JSON.stringify([snapshot]));

    expect(loadDraftSnapshotsRecord()).toEqual({
      version: 1,
      tableCellBreakFormat: "html",
      savedAt: 0,
      snapshots: [snapshot]
    });
  });

  it("migrates legacy CRLF snapshots without losing their disk style", () => {
    const legacy = {
      id: "legacy-crlf",
      fileName: "Windows.md",
      filePath: "D:/notes/Windows.md",
      markdown: "alpha\r\nbeta\r\n",
      lastSavedMarkdown: "alpha\r\nbeta\r\n",
      fileStats: { modifiedMs: 10, size: 13 },
      createdAt: 100,
      size: 13
    };

    expect(parseDraftSnapshotsRecord(JSON.stringify([legacy]))?.snapshots[0]).toMatchObject({
      markdown: "alpha\nbeta\n",
      lastSavedMarkdown: "alpha\nbeta\n",
      lineEnding: "crlf",
      kind: "preserved"
    });
  });

  it("migrates table separators only from markerless snapshot records", () => {
    const markdown = [
      "| Name | Note |",
      "| --- | --- |",
      "| Alice | first\u001fsecond |"
    ].join("\n");
    const snapshot = createDraftSnapshot({
      ...baseDocument,
      markdown,
      lastSavedMarkdown: markdown
    }, 100, "preserved");

    expect(parseDraftSnapshotsRecord(JSON.stringify([snapshot]))?.snapshots[0]).toMatchObject({
      markdown: markdown.replace("\u001f", "<br>"),
      lastSavedMarkdown: markdown.replace("\u001f", "<br>")
    });
    expect(parseDraftSnapshotsRecord(JSON.stringify(createDraftSnapshotsRecord([snapshot])))?.snapshots[0]).toMatchObject({
      markdown,
      lastSavedMarkdown: markdown
    });
  });
  it("does not throw when local snapshot persistence is unavailable", () => {
    vi.stubGlobal("localStorage", createStorageMock({ setThrows: true }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const snapshot = createDraftSnapshot(baseDocument, 100);

    expect(saveDraftSnapshots([snapshot])).toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});
