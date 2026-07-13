import { describe, expect, it } from "vitest";
import type { DraftSnapshot } from "./draftSnapshots";
import type { MarkdownBackup, MarkdownBackupHistory } from "./fileIo";
import {
  buildFileHistoryDocuments,
  fileHistoryDocumentKey,
  fileHistoryVersionKey,
  mergeFileHistoryVersions,
  partitionFileHistoryDocuments,
  removeSnapshotsForDocument
} from "./fileHistory";

function snapshot(overrides: Partial<DraftSnapshot> = {}): DraftSnapshot {
  const createdAt = overrides.createdAt ?? 100;
  const fileName = overrides.fileName ?? "Notes.md";
  const filePath = overrides.filePath === undefined ? "D:/Notes/Notes.md" : overrides.filePath;
  return {
    id: overrides.id ?? `snapshot-${createdAt}`,
    documentId: overrides.documentId === undefined ? (filePath ? null : "draft-notes") : overrides.documentId,
    fileName,
    filePath,
    markdown: overrides.markdown ?? "# Notes",
    lastSavedMarkdown: overrides.lastSavedMarkdown ?? "",
    lineEnding: overrides.lineEnding ?? "lf",
    fileStats: overrides.fileStats ?? null,
    createdAt,
    size: overrides.size ?? 10,
    contentHash: overrides.contentHash ?? `hash-${createdAt}`,
    kind: overrides.kind ?? "safety",
    reason: overrides.reason ?? "close",
    reasons: overrides.reasons ?? [{ reason: overrides.reason ?? "close", occurredAt: createdAt }]
  };
}

function history(overrides: Partial<MarkdownBackupHistory> = {}): MarkdownBackupHistory {
  return {
    sourcePath: overrides.sourcePath ?? "D:/Notes/Notes.md",
    fileName: overrides.fileName ?? "Notes.md",
    latestMs: overrides.latestMs ?? 200,
    backupCount: overrides.backupCount ?? 2,
    totalSize: overrides.totalSize ?? 20,
    sourceExists: overrides.sourceExists ?? true,
    latestBackupPath: overrides.latestBackupPath ?? "D:/Backups/notes/200.md"
  };
}

function backup(overrides: Partial<MarkdownBackup> = {}): MarkdownBackup {
  const modifiedMs = overrides.modifiedMs ?? 100;
  return {
    path: overrides.path ?? `D:/Backups/${modifiedMs}.md`,
    name: overrides.name ?? `${modifiedMs}.md`,
    modifiedMs,
    size: overrides.size ?? 10,
    kind: overrides.kind ?? "automatic",
    startedAtMs: overrides.startedAtMs ?? null,
    updatedAtMs: overrides.updatedAtMs ?? null
  };
}

describe("file history documents", () => {
  it("uses normalized Windows paths as document identity", () => {
    expect(fileHistoryDocumentKey(snapshot({ filePath: "D:\\Notes\\Draft.md" })))
      .toBe("path:d:/notes/draft.md");
    expect(fileHistoryDocumentKey(snapshot({ filePath: " d:/notes/DRAFT.md " })))
      .toBe("path:d:/notes/draft.md");

    const documents = buildFileHistoryDocuments(
      [history({ sourcePath: "D:\\Notes\\Draft.md", fileName: "Draft.md" })],
      [snapshot({ filePath: "d:/notes/DRAFT.md", fileName: "DRAFT.md" })]
    );

    expect(documents).toHaveLength(1);
    expect(documents[0].versionCount).toBe(3);
  });

  it("keeps same-named documents at different paths separate", () => {
    const documents = buildFileHistoryDocuments([], [
      snapshot({ id: "a", filePath: "D:/One/Notes.md" }),
      snapshot({ id: "b", filePath: "D:/Two/Notes.md" })
    ]);

    expect(documents.map((document) => document.key).sort()).toEqual([
      "path:d:/one/notes.md",
      "path:d:/two/notes.md"
    ]);
  });

  it("combines disk and editor checkpoints in document totals", () => {
    const documents = buildFileHistoryDocuments(
      [history({ latestMs: 300, backupCount: 4, totalSize: 80 })],
      [
        snapshot({ id: "older", createdAt: 250, size: 12 }),
        snapshot({ id: "newer", createdAt: 400, size: 18 })
      ]
    );

    expect(documents[0]).toMatchObject({
      sourceState: "available",
      versionCount: 6,
      totalSize: 110,
      latestMs: 400
    });
    expect(documents[0].snapshots.map((entry) => entry.id)).toEqual(["newer", "older"]);
  });

  it("represents local-only paths and pathless drafts without claiming they are missing", () => {
    const documents = buildFileHistoryDocuments([], [
      snapshot({ id: "available", filePath: "D:/Notes/Available.md", fileName: "Available.md", createdAt: 300 }),
      snapshot({ id: "unknown", filePath: "D:/Notes/Unknown.md", fileName: "Unknown.md", createdAt: 200 }),
      snapshot({ id: "draft", filePath: null, fileName: "Untitled.md", createdAt: 100 })
    ], new Map([["d:/notes/available.md", "available"]]));

    expect(documents.map(({ fileName, sourceState }) => ({ fileName, sourceState }))).toEqual([
      { fileName: "Available.md", sourceState: "available" },
      { fileName: "Unknown.md", sourceState: "unknown" },
      { fileName: "Untitled.md", sourceState: "draft" }
    ]);
  });

  it("keeps same-named pathless drafts separate by stable document id", () => {
    const documents = buildFileHistoryDocuments([], [
      snapshot({ id: "first", documentId: "tab-first", filePath: null, fileName: "Untitled.md" }),
      snapshot({ id: "second", documentId: "tab-second", filePath: null, fileName: "Untitled.md" })
    ]);

    expect(documents.map((document) => document.key).sort()).toEqual([
      "draft:tab-first",
      "draft:tab-second"
    ]);
  });

  it("places only explicitly missing documents in orphaned history", () => {
    const documents = buildFileHistoryDocuments(
      [history({ sourcePath: "D:/Notes/Missing.md", fileName: "Missing.md", sourceExists: false, latestMs: 400 })],
      [
        snapshot({ filePath: "D:/Notes/Unknown.md", fileName: "Unknown.md", createdAt: 300 }),
        snapshot({ filePath: null, fileName: "Draft.md", createdAt: 200 })
      ]
    );

    const groups = partitionFileHistoryDocuments(documents);

    expect(groups.orphaned.map((document) => document.fileName)).toEqual(["Missing.md"]);
    expect(groups.documents.map((document) => document.fileName)).toEqual(["Unknown.md", "Draft.md"]);
  });

  it("honors explicit missing state for path-backed snapshot-only documents", () => {
    const documents = buildFileHistoryDocuments(
      [],
      [snapshot({ filePath: "D:/Notes/Gone.md", fileName: "Gone.md" })],
      new Map([["d:/notes/gone.md", "missing"]])
    );

    expect(partitionFileHistoryDocuments(documents).orphaned).toHaveLength(1);
  });

  it("sorts documents deterministically by latest time, name, then key", () => {
    const firstInput = [
      snapshot({ id: "two", filePath: "D:/Two/Same.md", fileName: "Same.md", createdAt: 100 }),
      snapshot({ id: "zulu", filePath: "D:/Notes/Zulu.md", fileName: "Zulu.md", createdAt: 100 }),
      snapshot({ id: "one", filePath: "D:/One/Same.md", fileName: "Same.md", createdAt: 100 })
    ];

    const first = buildFileHistoryDocuments([], firstInput).map((document) => document.key);
    const second = buildFileHistoryDocuments([], [...firstInput].reverse()).map((document) => document.key);

    expect(first).toEqual([
      "path:d:/one/same.md",
      "path:d:/two/same.md",
      "path:d:/notes/zulu.md"
    ]);
    expect(second).toEqual(first);
  });
});

describe("file history versions", () => {
  it("builds stable selection keys for disk and local versions", () => {
    expect(fileHistoryVersionKey({
      source: "disk",
      timestamp: 10,
      backup: backup({ path: "C:\\backups\\note.md.1", modifiedMs: 10 })
    })).toBe("disk:C:\\backups\\note.md.1");
    expect(fileHistoryVersionKey({
      source: "local",
      timestamp: 20,
      snapshot: snapshot({ id: "snapshot-20", createdAt: 20 })
    })).toBe("local:snapshot-20");
  });

  it("interleaves disk and local versions in newest-first order", () => {
    const documentKey = fileHistoryDocumentKey(snapshot());
    const versions = mergeFileHistoryVersions(
      [backup({ path: "disk-new", modifiedMs: 400 }), backup({ path: "disk-old", modifiedMs: 100 })],
      [
        snapshot({ id: "local-middle", createdAt: 300 }),
        snapshot({ id: "other-document", filePath: "D:/Other.md", createdAt: 500 })
      ],
      documentKey
    );

    expect(versions.map((version) => version.source === "disk" ? version.backup.path : version.snapshot.id))
      .toEqual(["disk-new", "local-middle", "disk-old"]);
  });

  it("uses the rolling checkpoint update time and falls back to its modified time", () => {
    const versions = mergeFileHistoryVersions([
      backup({ path: "updated", kind: "rolling", modifiedMs: 100, updatedAtMs: 500 }),
      backup({ path: "fallback", kind: "rolling", modifiedMs: 300, updatedAtMs: null })
    ], [], "path:d:/notes/notes.md");

    expect(versions.map((version) => [version.source, version.timestamp])).toEqual([
      ["disk", 500],
      ["disk", 300]
    ]);
  });

  it("breaks equal timestamp ties deterministically", () => {
    const documentKey = fileHistoryDocumentKey(snapshot());
    const first = mergeFileHistoryVersions(
      [backup({ path: "b", modifiedMs: 100 }), backup({ path: "a", modifiedMs: 100 })],
      [snapshot({ id: "c", createdAt: 100 })],
      documentKey
    );
    const second = mergeFileHistoryVersions(
      [backup({ path: "a", modifiedMs: 100 }), backup({ path: "b", modifiedMs: 100 })],
      [snapshot({ id: "c", createdAt: 100 })],
      documentKey
    );

    const keys = (versions: typeof first) => versions.map((version) => (
      version.source === "disk" ? `disk:${version.backup.path}` : `local:${version.snapshot.id}`
    ));
    expect(keys(first)).toEqual(["disk:a", "disk:b", "local:c"]);
    expect(keys(second)).toEqual(keys(first));
  });
});

describe("file history removal", () => {
  it("removes every snapshot for one normalized document without touching others", () => {
    const targetKey = fileHistoryDocumentKey(snapshot({ filePath: "D:/Notes/Target.md" }));
    const snapshots = [
      snapshot({ id: "target-safety", filePath: "D:\\Notes\\TARGET.md", kind: "safety" }),
      snapshot({ id: "target-manual", filePath: "d:/notes/target.md", kind: "manual", reason: "manual" }),
      snapshot({ id: "other", filePath: "D:/Notes/Other.md" })
    ];

    expect(removeSnapshotsForDocument(snapshots, targetKey).map((entry) => entry.id)).toEqual(["other"]);
  });

  it("does not remove another same-named pathless draft", () => {
    const first = snapshot({ id: "first", documentId: "tab-first", filePath: null, fileName: "Untitled.md" });
    const second = snapshot({ id: "second", documentId: "tab-second", filePath: null, fileName: "Untitled.md" });

    expect(removeSnapshotsForDocument([first, second], fileHistoryDocumentKey(first)).map((entry) => entry.id))
      .toEqual(["second"]);
  });
});
