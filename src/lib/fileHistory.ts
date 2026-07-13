import type { DraftSnapshot } from "./draftSnapshots";
import type { MarkdownBackup, MarkdownBackupHistory } from "./fileIo";
import { localPathKey } from "./localPathKeys";

export type FileHistorySourceState = "available" | "missing" | "draft" | "unknown";

export type FileHistoryDocument = {
  key: string;
  fileName: string;
  filePath: string | null;
  sourceState: FileHistorySourceState;
  diskHistory: MarkdownBackupHistory | null;
  snapshots: DraftSnapshot[];
  versionCount: number;
  totalSize: number;
  latestMs: number;
};

export type FileHistoryVersion =
  | {
    source: "disk";
    timestamp: number;
    backup: MarkdownBackup;
  }
  | {
    source: "local";
    timestamp: number;
    snapshot: DraftSnapshot;
  };

export type FileHistoryDocumentGroups = {
  documents: FileHistoryDocument[];
  orphaned: FileHistoryDocument[];
};

export type FileHistorySourceStates = ReadonlyMap<string, Exclude<FileHistorySourceState, "draft">>;

export function fileHistoryDocumentKey(
  document: Pick<DraftSnapshot, "fileName" | "filePath"> & Partial<Pick<DraftSnapshot, "documentId" | "id">>
): string {
  if (document.filePath) return `path:${localPathKey(document.filePath)}`;
  if (document.documentId) return `draft:${document.documentId}`;
  if (document.id) return `legacy-snapshot:${document.id}`;
  return `legacy-draft:${document.fileName}`;
}

export function buildFileHistoryDocuments(
  backupHistories: readonly MarkdownBackupHistory[],
  snapshots: readonly DraftSnapshot[],
  sourceStates: FileHistorySourceStates = new Map()
): FileHistoryDocument[] {
  const documents = new Map<string, FileHistoryDocument>();

  for (const history of backupHistories) {
    const key = fileHistoryDocumentKey({ fileName: history.fileName, filePath: history.sourcePath });
    const existing = documents.get(key);

    if (existing) {
      existing.versionCount += history.backupCount;
      existing.totalSize += history.totalSize;
      existing.latestMs = Math.max(existing.latestMs, history.latestMs);
      if (history.latestMs > (existing.diskHistory?.latestMs ?? Number.NEGATIVE_INFINITY)) {
        existing.diskHistory = history;
        existing.fileName = history.fileName;
        existing.filePath = history.sourcePath;
      }
      if (history.sourceExists) existing.sourceState = "available";
      continue;
    }

    documents.set(key, {
      key,
      fileName: history.fileName,
      filePath: history.sourcePath,
      sourceState: history.sourceExists ? "available" : "missing",
      diskHistory: history,
      snapshots: [],
      versionCount: history.backupCount,
      totalSize: history.totalSize,
      latestMs: history.latestMs
    });
  }

  for (const snapshot of snapshots) {
    const key = fileHistoryDocumentKey(snapshot);
    const existing = documents.get(key);

    if (existing) {
      existing.snapshots.push(snapshot);
      existing.versionCount += 1;
      existing.totalSize += snapshot.size;
      existing.latestMs = Math.max(existing.latestMs, snapshot.createdAt);
      continue;
    }

    const filePath = snapshot.filePath;
    documents.set(key, {
      key,
      fileName: snapshot.fileName,
      filePath,
      sourceState: filePath
        ? sourceStates.get(localPathKey(filePath)) ?? "unknown"
        : "draft",
      diskHistory: null,
      snapshots: [snapshot],
      versionCount: 1,
      totalSize: snapshot.size,
      latestMs: snapshot.createdAt
    });
  }

  return [...documents.values()]
    .map((document) => ({
      ...document,
      snapshots: [...document.snapshots].sort(compareSnapshotsNewestFirst)
    }))
    .sort(compareDocuments);
}

export function partitionFileHistoryDocuments(
  documents: readonly FileHistoryDocument[]
): FileHistoryDocumentGroups {
  const groups: FileHistoryDocumentGroups = { documents: [], orphaned: [] };

  for (const document of documents) {
    if (document.sourceState === "missing") groups.orphaned.push(document);
    else groups.documents.push(document);
  }

  return groups;
}

export function mergeFileHistoryVersions(
  backups: readonly MarkdownBackup[],
  snapshots: readonly DraftSnapshot[],
  documentKey: string
): FileHistoryVersion[] {
  return [
    ...backups.map((backup): FileHistoryVersion => ({
      source: "disk",
      timestamp: backup.updatedAtMs ?? backup.modifiedMs,
      backup
    })),
    ...snapshots
      .filter((snapshot) => fileHistoryDocumentKey(snapshot) === documentKey)
      .map((snapshot): FileHistoryVersion => ({
        source: "local",
        timestamp: snapshot.createdAt,
        snapshot
      }))
  ].sort(compareVersions);
}

export function removeSnapshotsForDocument(
  snapshots: readonly DraftSnapshot[],
  documentKey: string
): DraftSnapshot[] {
  return snapshots.filter((snapshot) => fileHistoryDocumentKey(snapshot) !== documentKey);
}

function compareDocuments(left: FileHistoryDocument, right: FileHistoryDocument): number {
  return right.latestMs - left.latestMs
    || compareText(left.fileName, right.fileName)
    || compareText(left.key, right.key);
}

function compareSnapshotsNewestFirst(left: DraftSnapshot, right: DraftSnapshot): number {
  return right.createdAt - left.createdAt || compareText(left.id, right.id);
}

function compareVersions(left: FileHistoryVersion, right: FileHistoryVersion): number {
  return right.timestamp - left.timestamp
    || compareText(versionKey(left), versionKey(right));
}

function versionKey(version: FileHistoryVersion): string {
  return version.source === "disk"
    ? `disk:${version.backup.path}`
    : `local:${version.snapshot.id}`;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
