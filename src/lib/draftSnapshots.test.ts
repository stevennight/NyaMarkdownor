import { afterEach, describe, expect, it, vi } from "vitest";
import type { MarkdownDocument } from "../types";
import { defaultBackupPreferences } from "./preferences";
import {
  applyDraftSnapshotRetention,
  createDraftSnapshot,
  createDraftSnapshotsRecord,
  forgetDraftSnapshot,
  getBackupRetentionPolicy,
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

const retentionOptions = { now: 1_000_000 };

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

  it("creates a user-visible safety checkpoint from the current document", () => {
    const snapshot = createDraftSnapshot(baseDocument, 100, "close");

    expect(snapshot).toMatchObject({
      fileName: "Notes.md",
      filePath: "D:/notes/Notes.md",
      markdown: "# Notes",
      lastSavedMarkdown: "",
      lineEnding: "lf",
      fileStats: { modifiedMs: 10, size: 7 },
      createdAt: 100,
      kind: "safety",
      reason: "close",
      reasons: [{ reason: "close", occurredAt: 100 }]
    });
    expect(snapshot.size).toBeGreaterThan(0);
    expect(snapshot.contentHash).toBeTruthy();
  });

  it("preserves source table separators in newly created snapshot baselines", () => {
    const markdown = [
      "| Name | Note |",
      "| --- | --- |",
      "| Alice | first\u001fsecond |"
    ].join("\n");

    const snapshot = createDraftSnapshot({
      ...baseDocument,
      markdown,
      lastSavedMarkdown: markdown
    }, 100, "close");

    expect(snapshot).toMatchObject({
      markdown: [
        "| Name | Note |",
        "| --- | --- |",
        "| Alice | first\u001fsecond |"
      ].join("\n"),
      lastSavedMarkdown: [
        "| Name | Note |",
        "| --- | --- |",
        "| Alice | first\u001fsecond |"
      ].join("\n")
    });
  });

  it("maps legacy checkpoint kinds to the unified manual and safety kinds", () => {
    expect(createDraftSnapshot(baseDocument, 100, "automatic")).toMatchObject({
      kind: "safety",
      reason: "legacy-idle"
    });
    expect(createDraftSnapshot(baseDocument, 100, "preserved")).toMatchObject({
      kind: "safety",
      reason: "legacy-preserved"
    });
    expect(createDraftSnapshot(baseDocument, 100, "manual")).toMatchObject({
      kind: "manual",
      reason: "manual"
    });
  });

  it("deduplicates content and upgrades a matching safety checkpoint to manual", () => {
    const safety = createDraftSnapshot(baseDocument, 100, "reload");
    const manual = createDraftSnapshot(baseDocument, 200, "manual");

    expect(rememberDraftSnapshot([safety], manual, defaultBackupPreferences, retentionOptions)).toEqual([
      expect.objectContaining({
        id: safety.id,
        createdAt: safety.createdAt,
        kind: "manual",
        reason: "manual",
        reasons: [
          { reason: "manual", occurredAt: 200 },
          { reason: "reload", occurredAt: 100 }
        ]
      })
    ]);
  });

  it("migrates legacy reason arrays to timestamped reason events", () => {
    const legacy = {
      ...createDraftSnapshot(baseDocument, 100, "reload"),
      reasons: ["reload", "close"]
    };

    expect(parseDraftSnapshotsRecord(JSON.stringify([legacy]))?.snapshots[0]).toMatchObject({
      reason: "reload",
      reasons: [
        { reason: "reload", occurredAt: 100 },
        { reason: "close", occurredAt: 100 }
      ]
    });
  });

  it("preserves the existing entry when an identical reason is remembered", () => {
    const first = createDraftSnapshot(baseDocument, 100, "close");
    const duplicate = createDraftSnapshot(baseDocument, 200, "close");
    const current = [first];

    expect(rememberDraftSnapshot(current, duplicate, defaultBackupPreferences, retentionOptions)).toBe(current);
  });

  it("keeps newer snapshots first and applies the per-file safety limit", () => {
    const preferences = { ...defaultBackupPreferences, safetyVersionsPerFile: 2 };
    const snapshots = Array.from({ length: 4 }, (_value, index) => createDraftSnapshot({
      ...baseDocument,
      markdown: `# Notes ${index}`
    }, index + 1, "close"));

    const remembered = snapshots.reduce(
      (current, snapshot) => rememberDraftSnapshot(current, snapshot, preferences, retentionOptions),
      [] as typeof snapshots
    );

    expect(remembered.map((snapshot) => snapshot.markdown)).toEqual(["# Notes 3", "# Notes 2"]);
  });

  it("remembers multiple checkpoints as one bounded update", () => {
    const first = createDraftSnapshot(baseDocument, 100, "reload");
    const second = createDraftSnapshot({
      ...baseDocument,
      fileName: "Other.md",
      filePath: "D:/notes/Other.md",
      markdown: "# Other"
    }, 200, "restore");

    expect(rememberDraftSnapshots([], [first, second], defaultBackupPreferences, retentionOptions)).toEqual({
      changed: true,
      snapshots: [second, first]
    });

    expect(rememberDraftSnapshots([second, first], [createDraftSnapshot(baseDocument, 300, "reload")], defaultBackupPreferences, retentionOptions)).toEqual({
      changed: false,
      snapshots: [second, first]
    });
  });

  it("uses a stable document id when no file path exists", () => {
    expect(snapshotDocumentKey({ fileName: "Untitled.md", filePath: null, documentId: "tab-one" })).toBe("draft:tab-one");
    expect(snapshotDocumentKey({ fileName: "Untitled.md", filePath: null, id: "old-snapshot" })).toBe("legacy-snapshot:old-snapshot");

    const snapshot = createDraftSnapshot({
      ...baseDocument,
      fileName: "Untitled.md",
      filePath: null
    }, 100, "manual", "tab-one");
    expect(snapshot.documentId).toBe("tab-one");
    expect(snapshotDocumentKey(snapshot)).toBe("draft:tab-one");
  });

  it("normalizes Windows paths when identifying a snapshot document", () => {
    expect(snapshotDocumentKey({ fileName: "Notes.md", filePath: "D:\\Notes\\Notes.md" }))
      .toBe(snapshotDocumentKey({ fileName: "Notes.md", filePath: "d:/notes/notes.md" }));
  });

  it("removes a single local snapshot by id", () => {
    const first = createDraftSnapshot(baseDocument, 100, "reload");
    const second = createDraftSnapshot({ ...baseDocument, markdown: "# Changed" }, 200, "close");

    expect(forgetDraftSnapshot([second, first], second.id)).toEqual([first]);
  });

  it("prioritizes snapshots for the current document before other recent snapshots", () => {
    const currentOlder = createDraftSnapshot(baseDocument, 100, "reload");
    const otherNewer = createDraftSnapshot({
      ...baseDocument,
      fileName: "Other.md",
      filePath: "D:/notes/Other.md",
      markdown: "# Other"
    }, 300, "close");
    const currentNewer = createDraftSnapshot({ ...baseDocument, markdown: "# Current newer" }, 200, "restore");

    const prioritized = prioritizeDraftSnapshots([otherNewer, currentOlder, currentNewer], baseDocument);

    expect(prioritized.map((snapshot) => snapshot.id)).toEqual([
      currentNewer.id,
      currentOlder.id,
      otherNewer.id
    ]);
  });

  it("uses distinct automatic, safety, and manual retention policies", () => {
    expect(getBackupRetentionPolicy(defaultBackupPreferences, "automatic")).toEqual({
      versionsPerFile: 48,
      retentionDays: 180
    });
    expect(getBackupRetentionPolicy(defaultBackupPreferences, "safety")).toEqual({
      versionsPerFile: 32,
      retentionDays: 365
    });
    expect(getBackupRetentionPolicy(defaultBackupPreferences, "manual")).toEqual({
      versionsPerFile: 32,
      retentionDays: 0
    });
  });

  it("expires safety checkpoints by age but keeps manual checkpoints when manual retention is zero", () => {
    const day = 24 * 60 * 60 * 1000;
    const safety = createDraftSnapshot(baseDocument, 0, "close");
    const manual = createDraftSnapshot({ ...baseDocument, markdown: "# Manual" }, 0, "manual");

    const result = applyDraftSnapshotRetention([safety, manual], {
      ...defaultBackupPreferences,
      safetyRetentionDays: 7,
      manualRetentionDays: 0
    }, { now: 8 * day });

    expect(result.snapshots).toEqual([manual]);
    expect(result.removed).toEqual([safety]);
  });

  it("expires manual checkpoints by age only when the user sets a manual retention period", () => {
    const day = 24 * 60 * 60 * 1000;
    const manual = createDraftSnapshot(baseDocument, 0, "manual");

    const result = applyDraftSnapshotRetention([manual], {
      ...defaultBackupPreferences,
      manualRetentionDays: 7
    }, { now: 8 * day });

    expect(result.snapshots).toEqual([]);
    expect(result.removed).toEqual([manual]);
  });

  it("does not silently remove manual checkpoints for per-file or global count limits", () => {
    const manual = createDraftSnapshot(baseDocument, 100, "manual");
    const safety = createDraftSnapshot({ ...baseDocument, markdown: "# Safety" }, 200, "close");

    const result = applyDraftSnapshotRetention([safety, manual], defaultBackupPreferences, {
      ...retentionOptions,
      maxTotalSnapshots: 1
    });
    expect(result.snapshots).toEqual([safety, manual]);
    expect(result.removed).toEqual([]);
    expect(result.capacityExceeded).toBe(true);

    const perFileOverflow = applyDraftSnapshotRetention([
      manual,
      createDraftSnapshot({ ...baseDocument, markdown: "# Manual limit" }, 200, "manual")
    ], {
      ...defaultBackupPreferences,
      manualVersionsPerFile: 1
    }, retentionOptions);
    expect(perFileOverflow.snapshots).toHaveLength(2);
    expect(perFileOverflow.capacityExceeded).toBe(true);

    const overflow = applyDraftSnapshotRetention([
      manual,
      createDraftSnapshot({ ...baseDocument, markdown: "# Another manual" }, 200, "manual")
    ], defaultBackupPreferences, {
      ...retentionOptions,
      maxTotalSnapshots: 1
    });
    expect(overflow.snapshots).toHaveLength(2);
    expect(overflow.capacityExceeded).toBe(true);
  });

  it("does not evict an unexpired safety checkpoint solely to admit another by global capacity", () => {
    const kib = 1024;
    const oldSafety = {
      ...createDraftSnapshot(baseDocument, 100, "close"),
      size: 600 * kib
    };
    const candidate = {
      ...createDraftSnapshot({ ...baseDocument, markdown: "# New safety" }, 200, "restore"),
      size: 600 * kib
    };

    const result = applyDraftSnapshotRetention([oldSafety, candidate], {
      ...defaultBackupPreferences,
      maxTotalSizeMb: 1,
      maxBackupFileSizeMb: 1
    }, {
      ...retentionOptions,
      candidateSnapshotIds: [candidate.id]
    });

    expect(result.snapshots).toEqual([candidate, oldSafety]);
    expect(result.removed).toEqual([]);
    expect(result.capacityExceeded).toBe(true);
  });

  it("reports capacity when a safety candidate exceeds the individual byte limit", () => {
    const mib = 1024 * 1024;
    const existing = {
      ...createDraftSnapshot(baseDocument, 100, "close"),
      size: 128
    };
    const candidate = {
      ...createDraftSnapshot({ ...baseDocument, markdown: "# Too large" }, 200, "restore"),
      size: mib + 1
    };

    const result = applyDraftSnapshotRetention([existing, candidate], {
      ...defaultBackupPreferences,
      maxTotalSizeMb: 2,
      maxBackupFileSizeMb: 1
    }, {
      ...retentionOptions,
      candidateSnapshotIds: [candidate.id]
    });

    expect(result.snapshots).toEqual([existing]);
    expect(result.removed).toEqual([candidate]);
    expect(result.capacityExceeded).toBe(true);
  });

  it("keeps manual checkpoints when byte capacity is exhausted", () => {
    const kib = 1024;
    const manual = {
      ...createDraftSnapshot(baseDocument, 100, "manual"),
      size: 900 * kib
    };
    const safetyCandidate = {
      ...createDraftSnapshot({ ...baseDocument, markdown: "# Safety" }, 200, "close"),
      size: 200 * kib
    };

    const result = applyDraftSnapshotRetention([manual, safetyCandidate], {
      ...defaultBackupPreferences,
      maxTotalSizeMb: 1,
      maxBackupFileSizeMb: 1
    }, {
      ...retentionOptions,
      candidateSnapshotIds: [safetyCandidate.id]
    });

    expect(result.snapshots).toEqual([safetyCandidate, manual]);
    expect(result.removed).toEqual([]);
    expect(result.capacityExceeded).toBe(true);
  });

  it("does not partially prune current safety checkpoints when a remembered candidate cannot fit", () => {
    const kib = 1024;
    const manual = {
      ...createDraftSnapshot(baseDocument, 100, "manual"),
      size: 900 * kib
    };
    const existingSafety = {
      ...createDraftSnapshot({ ...baseDocument, markdown: "# Existing safety" }, 200, "close"),
      size: 100 * kib
    };
    const candidate = {
      ...createDraftSnapshot({ ...baseDocument, markdown: "# Candidate" }, 300, "restore"),
      size: 200 * kib
    };
    const current = [existingSafety, manual];
    const preferences = {
      ...defaultBackupPreferences,
      maxTotalSizeMb: 1,
      maxBackupFileSizeMb: 1
    };

    expect(rememberDraftSnapshot(current, candidate, preferences, retentionOptions)).toBe(current);
  });

  it("retains expired-manual cleanup even when the expired content exceeds byte limits", () => {
    const day = 24 * 60 * 60 * 1000;
    const manual = {
      ...createDraftSnapshot(baseDocument, 0, "manual"),
      size: 2 * 1024 * 1024
    };

    const result = applyDraftSnapshotRetention([manual], {
      ...defaultBackupPreferences,
      maxTotalSizeMb: 1,
      maxBackupFileSizeMb: 1,
      manualRetentionDays: 7
    }, { now: 8 * day });

    expect(result.snapshots).toEqual([]);
    expect(result.removed).toEqual([manual]);
    expect(result.capacityExceeded).toBe(false);
  });

  it("persists and reloads local snapshots", () => {
    vi.stubGlobal("localStorage", createStorageMock());
    const snapshot = createDraftSnapshot(baseDocument, 100, "close");

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
    const snapshot = createDraftSnapshot(baseDocument, 100, "window-close");

    await expect(saveDraftSnapshotsImmediately([snapshot])).resolves.toBe(true);
    expect(loadDraftSnapshots()).toEqual([snapshot]);
  });

  it("parses desktop snapshot records with their saved timestamp", () => {
    const snapshot = createDraftSnapshot(baseDocument, 100, "close");
    const record = createDraftSnapshotsRecord([snapshot], 123);

    expect(parseDraftSnapshotsRecord(JSON.stringify(record))).toEqual(record);
  });

  it("loads legacy snapshot arrays as migration records", () => {
    const storage = createStorageMock();
    vi.stubGlobal("localStorage", storage);
    const snapshot = createDraftSnapshot(baseDocument, 100, "close");
    storage.setItem("nya-markdownor-draft-snapshots-v1", JSON.stringify([snapshot]));

    expect(loadDraftSnapshotsRecord()).toEqual({
      version: 1,
      tableCellBreakFormat: "html",
      savedAt: 0,
      snapshots: [snapshot]
    });
  });

  it("migrates legacy automatic and preserved snapshots without losing their disk style", () => {
    const legacy = {
      id: "legacy-crlf",
      fileName: "Windows.md",
      filePath: "D:/notes/Windows.md",
      markdown: "alpha\r\nbeta\r\n",
      lastSavedMarkdown: "alpha\r\nbeta\r\n",
      fileStats: { modifiedMs: 10, size: 13 },
      createdAt: 100,
      size: 13,
      kind: "automatic"
    };

    const legacyPreserved = {
      ...legacy,
      id: "legacy-preserved",
      fileName: "Protected.md",
      filePath: "D:/notes/Protected.md",
      markdown: "protected",
      lastSavedMarkdown: "protected",
      kind: "preserved"
    };
    const snapshots = parseDraftSnapshotsRecord(JSON.stringify([legacy, legacyPreserved]))?.snapshots ?? [];

    expect(snapshots.find((snapshot) => snapshot.id === legacy.id)).toMatchObject({
      markdown: "alpha\nbeta\n",
      lastSavedMarkdown: "alpha\nbeta\n",
      lineEnding: "crlf",
      kind: "safety",
      reason: "legacy-idle"
    });
    expect(snapshots.find((snapshot) => snapshot.id === legacyPreserved.id)).toMatchObject({
      kind: "safety",
      reason: "legacy-preserved"
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
    }, 100, "close");

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
    const snapshot = createDraftSnapshot(baseDocument, 100, "close");

    expect(saveDraftSnapshots([snapshot])).toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});
