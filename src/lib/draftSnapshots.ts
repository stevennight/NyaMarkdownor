import type { MarkdownDocument, MarkdownFileStats, MarkdownLineEnding } from "../types";
import { queueDesktopStoreTextWrite, readDesktopStoreText } from "./desktopStore";
import { isMarkdownLineEnding, normalizeMarkdownLineEndings, normalizeMarkdownText } from "./lineEndings";

const SNAPSHOT_STORAGE_KEY = "nya-markdownor-draft-snapshots-v1";
const MAX_SNAPSHOTS_PER_DOCUMENT = 8;
const MAX_SNAPSHOTS_TOTAL = 32;

export type DraftSnapshotKind = "automatic" | "manual" | "preserved";

export type DraftSnapshot = {
  id: string;
  fileName: string;
  filePath: string | null;
  markdown: string;
  lastSavedMarkdown: string;
  lineEnding: MarkdownLineEnding;
  fileStats: MarkdownFileStats | null;
  createdAt: number;
  size: number;
  kind: DraftSnapshotKind;
};

export type DraftSnapshotsRecord = {
  version: 1;
  savedAt: number;
  snapshots: DraftSnapshot[];
};

export type DraftSnapshotsUpdate = {
  snapshots: DraftSnapshot[];
  changed: boolean;
};

export function createDraftSnapshot(
  document: MarkdownDocument,
  createdAt = Date.now(),
  kind: DraftSnapshotKind = "preserved"
): DraftSnapshot {
  const key = document.filePath ?? document.fileName;
  return {
    id: `${createdAt}-${hashString(`${key}\n${document.markdown}`)}`,
    fileName: document.fileName,
    filePath: document.filePath,
    markdown: document.markdown,
    lastSavedMarkdown: document.lastSavedMarkdown,
    lineEnding: document.lineEnding,
    fileStats: document.fileStats ?? null,
    createdAt,
    size: new Blob([document.markdown]).size,
    kind
  };
}

export function rememberDraftSnapshot(snapshots: DraftSnapshot[], snapshot: DraftSnapshot): DraftSnapshot[] {
  if (!snapshot.markdown.trim()) return snapshots;

  const key = snapshotDocumentKey(snapshot);
  const latestForDocument = snapshots
    .filter((current) => snapshotDocumentKey(current) === key)
    .sort((left, right) => right.createdAt - left.createdAt)[0];

  if (latestForDocument?.markdown === snapshot.markdown) return snapshots;

  const next: DraftSnapshot[] = [];
  const counts = new Map<string, number>();

  for (const candidate of [snapshot, ...snapshots].sort((left, right) => right.createdAt - left.createdAt)) {
    const candidateKey = snapshotDocumentKey(candidate);
    const count = counts.get(candidateKey) ?? 0;
    if (count >= MAX_SNAPSHOTS_PER_DOCUMENT) continue;

    next.push(candidate);
    counts.set(candidateKey, count + 1);
    if (next.length >= MAX_SNAPSHOTS_TOTAL) break;
  }

  return next;
}

export function rememberDraftSnapshots(snapshots: DraftSnapshot[], nextSnapshots: readonly DraftSnapshot[]): DraftSnapshotsUpdate {
  let changed = false;
  let next = snapshots;

  for (const snapshot of nextSnapshots) {
    const remembered = rememberDraftSnapshot(next, snapshot);
    if (remembered !== next) changed = true;
    next = remembered;
  }

  return {
    snapshots: next,
    changed
  };
}

export function forgetDraftSnapshot(snapshots: DraftSnapshot[], snapshotId: string): DraftSnapshot[] {
  return snapshots.filter((snapshot) => snapshot.id !== snapshotId);
}

export function prioritizeDraftSnapshots(
  snapshots: DraftSnapshot[],
  document: Pick<DraftSnapshot, "fileName" | "filePath">
): DraftSnapshot[] {
  const documentKey = snapshotDocumentKey(document);

  return [...snapshots].sort((left, right) => {
    const leftCurrent = snapshotDocumentKey(left) === documentKey;
    const rightCurrent = snapshotDocumentKey(right) === documentKey;
    if (leftCurrent !== rightCurrent) return leftCurrent ? -1 : 1;
    return right.createdAt - left.createdAt;
  });
}

export function loadDraftSnapshots(): DraftSnapshot[] {
  return loadDraftSnapshotsRecord()?.snapshots ?? [];
}

export function loadDraftSnapshotsRecord(): DraftSnapshotsRecord | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_STORAGE_KEY);
    if (!raw) return null;
    return parseDraftSnapshotsRecord(raw);
  } catch (error) {
    console.warn(error);
    return null;
  }
}

export function saveDraftSnapshots(snapshots: DraftSnapshot[]): boolean {
  const serialized = serializeDraftSnapshotsRecord(snapshots);
  void queueDesktopStoreTextWrite("draft-snapshots", serialized);

  return saveDraftSnapshotsLocal(serialized);
}

export async function saveDraftSnapshotsImmediately(snapshots: DraftSnapshot[]): Promise<boolean> {
  const serialized = serializeDraftSnapshotsRecord(snapshots);
  const desktopWrite = queueDesktopStoreTextWrite("draft-snapshots", serialized);
  const localSaved = saveDraftSnapshotsLocal(serialized);
  const desktopSaved = await desktopWrite;
  return localSaved || desktopSaved;
}

function saveDraftSnapshotsLocal(serialized: string): boolean {
  try {
    localStorage.setItem(SNAPSHOT_STORAGE_KEY, serialized);
    return true;
  } catch (error) {
    console.warn(error);
    return false;
  }
}

function serializeDraftSnapshotsRecord(snapshots: DraftSnapshot[]): string {
  return JSON.stringify(createDraftSnapshotsRecord(snapshots));
}

export async function loadDesktopDraftSnapshotsRecord(): Promise<DraftSnapshotsRecord | null> {
  const raw = await readDesktopStoreText("draft-snapshots");
  return raw ? parseDraftSnapshotsRecord(raw) : null;
}

export function createDraftSnapshotsRecord(snapshots: DraftSnapshot[], savedAt = Date.now()): DraftSnapshotsRecord {
  return {
    version: 1,
    savedAt,
    snapshots: normalizeDraftSnapshots(snapshots)
  };
}

export function parseDraftSnapshotsRecord(raw: string): DraftSnapshotsRecord | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const record = normalizeDraftSnapshotsRecord(parsed);
    if (record) return record;

    if (Array.isArray(parsed)) {
      return {
        version: 1,
        savedAt: 0,
        snapshots: normalizeDraftSnapshots(parsed)
      };
    }
    return null;
  } catch (error) {
    console.warn(error);
    return null;
  }
}

export function snapshotDocumentKey(snapshot: Pick<DraftSnapshot, "fileName" | "filePath">): string {
  return snapshot.filePath ?? `draft:${snapshot.fileName}`;
}

function normalizeDraftSnapshotsRecord(value: unknown): DraftSnapshotsRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<DraftSnapshotsRecord>;
  if (record.version !== 1 || typeof record.savedAt !== "number" || !Number.isFinite(record.savedAt)) return null;
  if (!Array.isArray(record.snapshots)) return null;

  return {
    version: 1,
    savedAt: record.savedAt,
    snapshots: normalizeDraftSnapshots(record.snapshots)
  };
}

function normalizeDraftSnapshots(value: unknown[]): DraftSnapshot[] {
  return value
    .map(normalizeDraftSnapshot)
    .filter((snapshot): snapshot is DraftSnapshot => snapshot !== null)
    .sort((left, right) => right.createdAt - left.createdAt);
}

function normalizeDraftSnapshot(value: unknown): DraftSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Partial<DraftSnapshot>;
  if (
    typeof snapshot.id !== "string" ||
    typeof snapshot.fileName !== "string" ||
    (typeof snapshot.filePath !== "string" && snapshot.filePath !== null) ||
    typeof snapshot.markdown !== "string" ||
    typeof snapshot.lastSavedMarkdown !== "string" ||
    (snapshot.fileStats !== null && !isFileStats(snapshot.fileStats)) ||
    typeof snapshot.createdAt !== "number" ||
    !Number.isFinite(snapshot.createdAt) ||
    typeof snapshot.size !== "number" ||
    !Number.isFinite(snapshot.size)
  ) return null;

  const normalized = normalizeMarkdownText(snapshot.markdown);
  return {
    id: snapshot.id,
    fileName: snapshot.fileName,
    filePath: snapshot.filePath,
    markdown: normalized.markdown,
    lastSavedMarkdown: normalizeMarkdownLineEndings(snapshot.lastSavedMarkdown),
    lineEnding: isMarkdownLineEnding(snapshot.lineEnding) ? snapshot.lineEnding : normalized.lineEnding,
    fileStats: snapshot.fileStats,
    createdAt: snapshot.createdAt,
    size: new Blob([normalized.markdown]).size,
    kind: isDraftSnapshotKind(snapshot.kind) ? snapshot.kind : "preserved"
  };
}

function isDraftSnapshotKind(value: unknown): value is DraftSnapshotKind {
  return value === "automatic" || value === "manual" || value === "preserved";
}

function isFileStats(value: unknown): value is MarkdownFileStats {
  if (!value || typeof value !== "object") return false;
  const stats = value as Partial<MarkdownFileStats>;
  return typeof stats.modifiedMs === "number" && typeof stats.size === "number";
}

function hashString(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}
