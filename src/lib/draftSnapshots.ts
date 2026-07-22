import type { BackupPreferences, MarkdownDocument, MarkdownFileStats, MarkdownLineEnding } from "../types";
import { queueDesktopStoreTextWrite, readDesktopStoreText } from "./desktopStore";
import { isMarkdownLineEnding, normalizeMarkdownText } from "./lineEndings";
import { localPathKey, simplifyLocalPath } from "./localPathKeys";
import { defaultBackupPreferences } from "./preferences";

const SNAPSHOT_STORAGE_KEY = "nya-markdownor-draft-snapshots-v1";
const DAY_MS = 24 * 60 * 60 * 1000;
const MIB = 1024 * 1024;

export type BackupVersionCategory = "automatic" | "safety" | "manual";

export type DraftSnapshotKind = "manual" | "safety";

export type DraftSnapshotReason =
  | "manual"
  | "reload"
  | "restore"
  | "close"
  | "recovery-discard"
  | "save-conflict"
  | "save-as-overwrite"
  | "window-close"
  | "legacy-idle"
  | "legacy-preserved";

export type LegacyDraftSnapshotKind = "automatic" | "preserved";

export type DraftSnapshotCreateReason =
  | DraftSnapshotKind
  | DraftSnapshotReason
  | LegacyDraftSnapshotKind;

export type DraftSnapshotReasonEvent = {
  reason: DraftSnapshotReason;
  occurredAt: number;
};

export type DraftSnapshot = {
  id: string;
  documentId: string | null;
  fileName: string;
  filePath: string | null;
  markdown: string;
  lastSavedMarkdown: string;
  lineEnding: MarkdownLineEnding;
  fileStats: MarkdownFileStats | null;
  createdAt: number;
  size: number;
  contentHash: string;
  kind: DraftSnapshotKind;
  reason: DraftSnapshotReason;
  reasons: DraftSnapshotReasonEvent[];
};

export type DraftSnapshotsRecord = {
  version: 1;
  tableCellBreakFormat: "html";
  savedAt: number;
  snapshots: DraftSnapshot[];
};

export type DraftSnapshotsUpdate = {
  snapshots: DraftSnapshot[];
  changed: boolean;
};

export type BackupRetentionPolicy = {
  versionsPerFile: number;
  retentionDays: number;
};

export type DraftSnapshotRetentionOptions = {
  now?: number;
  maxTotalSnapshots?: number;
  /**
   * New entries being preflighted. When one cannot be retained because of a
   * count or byte limit, `capacityExceeded` remains true even if older safety
   * entries were removed while making room.
   */
  candidateSnapshotIds?: readonly string[];
};

export type DraftSnapshotRetentionResult = {
  snapshots: DraftSnapshot[];
  removed: DraftSnapshot[];
  capacityExceeded: boolean;
};

export function getBackupRetentionPolicy(
  preferences: BackupPreferences,
  category: BackupVersionCategory
): BackupRetentionPolicy {
  if (category === "automatic") {
    return {
      versionsPerFile: preferences.automaticVersionsPerFile,
      retentionDays: preferences.automaticRetentionDays
    };
  }
  if (category === "safety") {
    return {
      versionsPerFile: preferences.safetyVersionsPerFile,
      retentionDays: preferences.safetyRetentionDays
    };
  }
  return {
    versionsPerFile: preferences.manualVersionsPerFile,
    retentionDays: preferences.manualRetentionDays
  };
}

export function createDraftSnapshot(
  document: MarkdownDocument,
  createdAt = Date.now(),
  kindOrReason: DraftSnapshotCreateReason = "safety",
  documentId: string | null = null
): DraftSnapshot {
  const { kind, reason } = classifySnapshotReason(kindOrReason);
  const normalized = normalizeMarkdownText(document.markdown);
  const key = document.filePath ?? documentId ?? document.fileName;
  const contentHash = hashString(normalized.markdown);
  return {
    id: `${createdAt}-${hashString(`${key}\n${normalized.markdown}`)}`,
    documentId: document.filePath ? null : documentId,
    fileName: document.fileName,
    filePath: document.filePath,
    markdown: normalized.markdown,
    lastSavedMarkdown: normalizeMarkdownText(document.lastSavedMarkdown).markdown,
    lineEnding: document.lineEnding,
    fileStats: document.fileStats ?? null,
    createdAt,
    size: new Blob([normalized.markdown]).size,
    contentHash,
    kind,
    reason,
    reasons: [{ reason, occurredAt: createdAt }]
  };
}

export function rememberDraftSnapshot(
  snapshots: DraftSnapshot[],
  snapshot: DraftSnapshot,
  preferences: BackupPreferences = defaultBackupPreferences,
  options: DraftSnapshotRetentionOptions = {}
): DraftSnapshot[] {
  const next = mergeRememberedSnapshot(snapshots, snapshot);
  const candidateWasAdded = next.includes(snapshot);
  const candidateSnapshotIds = candidateWasAdded
    ? [...(options.candidateSnapshotIds ?? []), snapshot.id]
    : options.candidateSnapshotIds;
  const retention = applyDraftSnapshotRetention(next, preferences, {
    ...options,
    candidateSnapshotIds
  });
  if (candidateWasAdded && retention.capacityExceeded) {
    return snapshots;
  }
  const retained = retention.snapshots;
  return sameSnapshotArray(retained, snapshots) ? snapshots : retained;
}

export function rememberDraftSnapshots(
  snapshots: DraftSnapshot[],
  nextSnapshots: readonly DraftSnapshot[],
  preferences: BackupPreferences = defaultBackupPreferences,
  options: DraftSnapshotRetentionOptions = {}
): DraftSnapshotsUpdate {
  let next = snapshots;
  const candidateSnapshotIds = new Set(options.candidateSnapshotIds);
  const addedCandidateIds = new Set<string>();
  for (const snapshot of nextSnapshots) {
    next = mergeRememberedSnapshot(next, snapshot);
    if (next.includes(snapshot)) {
      candidateSnapshotIds.add(snapshot.id);
      addedCandidateIds.add(snapshot.id);
    }
  }

  const retention = applyDraftSnapshotRetention(next, preferences, {
    ...options,
    candidateSnapshotIds: [...candidateSnapshotIds]
  });
  if (retention.capacityExceeded && addedCandidateIds.size > 0) {
    return { snapshots, changed: false };
  }
  const retained = retention.snapshots;
  const changed = !sameSnapshotArray(retained, snapshots);
  return {
    snapshots: changed ? retained : snapshots,
    changed
  };
}

export function applyDraftSnapshotRetention(
  snapshots: readonly DraftSnapshot[],
  preferences: BackupPreferences,
  options: DraftSnapshotRetentionOptions = {}
): DraftSnapshotRetentionResult {
  const now = options.now ?? Date.now();
  const maxTotalSnapshots = normalizeGlobalLimit(options.maxTotalSnapshots ?? preferences.maxTotalFiles);
  const maxTotalBytes = megabytesToBytes(preferences.maxTotalSizeMb);
  const maxSnapshotBytes = Math.min(maxTotalBytes, megabytesToBytes(preferences.maxBackupFileSizeMb));
  const candidateSnapshotIds = new Set(options.candidateSnapshotIds);
  const sorted = [...snapshots].sort(compareSnapshotsNewestFirst);
  const counts = new Map<string, number>();
  const removed = new Set<DraftSnapshot>();
  const retained: DraftSnapshot[] = [];
  let protectedManualLimitExceeded = false;
  let protectedManualSizeExceeded = false;
  let candidateRejectedForCapacity = false;

  const removeSnapshot = (snapshot: DraftSnapshot, isCapacityRemoval = false) => {
    removed.add(snapshot);
    if (isCapacityRemoval && candidateSnapshotIds.has(snapshot.id)) {
      candidateRejectedForCapacity = true;
    }
  };

  for (const snapshot of sorted) {
    const policy = getBackupRetentionPolicy(preferences, snapshot.kind);
    const expired = policy.retentionDays > 0 && snapshot.createdAt < now - policy.retentionDays * DAY_MS;
    const countKey = `${snapshotDocumentKey(snapshot)}\n${snapshot.kind}`;
    const count = counts.get(countKey) ?? 0;

    if (expired) {
      removeSnapshot(snapshot);
      continue;
    }

    const size = snapshotByteSize(snapshot);
    if (size > maxSnapshotBytes && snapshot.kind !== "manual") {
      removeSnapshot(snapshot, true);
      continue;
    }

    if (snapshot.kind !== "manual" && count >= policy.versionsPerFile) {
      removeSnapshot(snapshot, true);
      continue;
    }

    counts.set(countKey, count + 1);
    if (snapshot.kind === "manual" && count >= policy.versionsPerFile) {
      protectedManualLimitExceeded = true;
    }
    if (snapshot.kind === "manual" && size > maxSnapshotBytes) {
      protectedManualSizeExceeded = true;
    }
    retained.push(snapshot);
  }

  const finalSnapshots = retained.filter((snapshot) => !removed.has(snapshot));
  return {
    snapshots: finalSnapshots,
    removed: [...removed].sort(compareSnapshotsOldestFirst),
    capacityExceeded:
      protectedManualLimitExceeded ||
      protectedManualSizeExceeded ||
      candidateRejectedForCapacity ||
      finalSnapshots.length > maxTotalSnapshots ||
      totalSnapshotBytes(finalSnapshots) > maxTotalBytes
  };
}

export function pruneDraftSnapshots(
  snapshots: readonly DraftSnapshot[],
  preferences: BackupPreferences,
  options: DraftSnapshotRetentionOptions = {}
): DraftSnapshot[] {
  return applyDraftSnapshotRetention(snapshots, preferences, options).snapshots;
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
    return compareSnapshotsNewestFirst(left, right);
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
    tableCellBreakFormat: "html",
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
        tableCellBreakFormat: "html",
        savedAt: 0,
        snapshots: normalizeDraftSnapshots(parsed, true)
      };
    }
    return null;
  } catch (error) {
    console.warn(error);
    return null;
  }
}

export function snapshotDocumentKey(
  snapshot: Pick<DraftSnapshot, "fileName" | "filePath"> & Partial<Pick<DraftSnapshot, "documentId" | "id">>
): string {
  if (snapshot.filePath) return `path:${localPathKey(snapshot.filePath)}`;
  if (snapshot.documentId) return `draft:${snapshot.documentId}`;
  if (snapshot.id) return `legacy-snapshot:${snapshot.id}`;
  return `legacy-draft:${snapshot.fileName}`;
}

function normalizeDraftSnapshotsRecord(value: unknown): DraftSnapshotsRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<DraftSnapshotsRecord>;
  if (record.version !== 1 || typeof record.savedAt !== "number" || !Number.isFinite(record.savedAt)) return null;
  if (!Array.isArray(record.snapshots)) return null;

  return {
    version: 1,
    tableCellBreakFormat: "html",
    savedAt: record.savedAt,
    snapshots: normalizeDraftSnapshots(record.snapshots, record.tableCellBreakFormat !== "html")
  };
}

function normalizeDraftSnapshots(value: unknown[], migrateLegacyTableCellBreaks = false): DraftSnapshot[] {
  const normalized = value
    .map((snapshot) => normalizeDraftSnapshot(snapshot, migrateLegacyTableCellBreaks))
    .filter((snapshot): snapshot is DraftSnapshot => snapshot !== null)
    .sort(compareSnapshotsNewestFirst);

  const deduplicated: DraftSnapshot[] = [];
  for (const snapshot of normalized) {
    const duplicateIndex = findDuplicateSnapshotIndex(deduplicated, snapshot);
    if (duplicateIndex < 0) {
      deduplicated.push(snapshot);
      continue;
    }
    deduplicated[duplicateIndex] = mergeDuplicateSnapshot(deduplicated[duplicateIndex], snapshot, false);
  }
  return deduplicated.sort(compareSnapshotsNewestFirst);
}

function normalizeDraftSnapshot(value: unknown, migrateLegacyTableCellBreaks = false): DraftSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Partial<DraftSnapshot> & { kind?: unknown; reason?: unknown; reasons?: unknown };
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

  const normalized = normalizeMarkdownText(snapshot.markdown, { migrateLegacyTableCellBreaks });
  const classification = classifyStoredSnapshot(snapshot.kind, snapshot.reason);
  const parsedReasons = normalizeSnapshotReasons(snapshot.reasons, classification.reason, snapshot.createdAt);
  const kind: DraftSnapshotKind = classification.kind === "manual" || parsedReasons.some((event) => event.reason === "manual")
    ? "manual"
    : "safety";
  const reason: DraftSnapshotReason = kind === "manual" ? "manual" : classification.reason;
  const documentId = snapshot.filePath
    ? null
    : typeof snapshot.documentId === "string" && snapshot.documentId.trim()
      ? snapshot.documentId
      : `legacy:${snapshot.id}`;
  return {
    id: snapshot.id,
    documentId,
    fileName: snapshot.fileName,
    filePath: snapshot.filePath ? simplifyLocalPath(snapshot.filePath) : null,
    markdown: normalized.markdown,
    lastSavedMarkdown: normalizeMarkdownText(snapshot.lastSavedMarkdown, { migrateLegacyTableCellBreaks }).markdown,
    lineEnding: isMarkdownLineEnding(snapshot.lineEnding) ? snapshot.lineEnding : normalized.lineEnding,
    fileStats: snapshot.fileStats,
    createdAt: snapshot.createdAt,
    size: new Blob([normalized.markdown]).size,
    contentHash: hashString(normalized.markdown),
    kind,
    reason,
    reasons: mergeReasonEvents(
      preferredReasonEvent(reason, snapshot.createdAt, parsedReasons),
      parsedReasons
    )
  };
}

function mergeRememberedSnapshot(snapshots: DraftSnapshot[], snapshot: DraftSnapshot): DraftSnapshot[] {
  const duplicateIndex = findDuplicateSnapshotIndex(snapshots, snapshot);
  if (duplicateIndex < 0) return [snapshot, ...snapshots];

  const merged = mergeDuplicateSnapshot(snapshots[duplicateIndex], snapshot, true);
  if (sameSnapshotMetadata(merged, snapshots[duplicateIndex])) return snapshots;

  const next = [...snapshots];
  next[duplicateIndex] = merged;
  return next;
}

function findDuplicateSnapshotIndex(snapshots: readonly DraftSnapshot[], snapshot: DraftSnapshot): number {
  const documentKey = snapshotDocumentKey(snapshot);
  return snapshots.findIndex((candidate) => (
    snapshotDocumentKey(candidate) === documentKey &&
    candidate.contentHash === snapshot.contentHash &&
    candidate.markdown === snapshot.markdown
  ));
}

function mergeDuplicateSnapshot(
  existing: DraftSnapshot,
  incoming: DraftSnapshot,
  preferIncomingReason: boolean
): DraftSnapshot {
  const kind: DraftSnapshotKind = existing.kind === "manual" || incoming.kind === "manual" ? "manual" : "safety";
  const reason = kind === "manual"
    ? "manual"
    : preferIncomingReason
      ? incoming.reason
      : existing.reason;
  const shouldPreferIncomingEvent = preferIncomingReason && (
    incoming.reason !== existing.reason || incoming.kind !== existing.kind
  );
  const preferredSnapshots = shouldPreferIncomingEvent ? [incoming, existing] : [existing, incoming];
  const primaryEvent = preferredSnapshots
    .flatMap((snapshot) => snapshot.reasons)
    .find((event) => event.reason === reason) ?? { reason, occurredAt: existing.createdAt };
  const reasons = mergeReasonEvents(
    primaryEvent,
    ...(preferIncomingReason
      ? [incoming.reasons, existing.reasons]
      : [existing.reasons, incoming.reasons])
  );

  if (existing.kind === kind && existing.reason === reason && sameReasonEvents(existing.reasons, reasons)) return existing;
  return {
    ...existing,
    kind,
    reason,
    reasons
  };
}

function classifySnapshotReason(value: DraftSnapshotCreateReason): Pick<DraftSnapshot, "kind" | "reason"> {
  if (value === "manual") return { kind: "manual", reason: "manual" };
  if (value === "automatic") return { kind: "safety", reason: "legacy-idle" };
  if (value === "preserved" || value === "safety") return { kind: "safety", reason: "legacy-preserved" };
  return { kind: "safety", reason: value };
}

function classifyStoredSnapshot(kind: unknown, reason: unknown): Pick<DraftSnapshot, "kind" | "reason"> {
  if (kind === "manual" || reason === "manual") return { kind: "manual", reason: "manual" };
  if (isDraftSnapshotReason(reason)) return { kind: "safety", reason };
  if (kind === "automatic") return { kind: "safety", reason: "legacy-idle" };
  return { kind: "safety", reason: "legacy-preserved" };
}

function normalizeSnapshotReasons(
  value: unknown,
  fallback: DraftSnapshotReason,
  fallbackOccurredAt: number
): DraftSnapshotReasonEvent[] {
  if (!Array.isArray(value)) return [{ reason: fallback, occurredAt: fallbackOccurredAt }];
  const reasons = value
    .map((event): DraftSnapshotReasonEvent | null => {
      if (isDraftSnapshotReason(event)) {
        return { reason: event, occurredAt: fallbackOccurredAt };
      }
      if (!event || typeof event !== "object") return null;
      const candidate = event as Partial<DraftSnapshotReasonEvent>;
      if (!isDraftSnapshotReason(candidate.reason)) return null;
      if (typeof candidate.occurredAt !== "number" || !Number.isFinite(candidate.occurredAt)) return null;
      return { reason: candidate.reason, occurredAt: candidate.occurredAt };
    })
    .filter((event): event is DraftSnapshotReasonEvent => event !== null);
  return mergeReasonEvents(
    preferredReasonEvent(fallback, fallbackOccurredAt, reasons),
    reasons
  );
}

function preferredReasonEvent(
  reason: DraftSnapshotReason,
  occurredAt: number,
  events: readonly DraftSnapshotReasonEvent[]
): DraftSnapshotReasonEvent {
  return events.find((event) => event.reason === reason) ?? { reason, occurredAt };
}

function mergeReasonEvents(
  primary: DraftSnapshotReasonEvent,
  ...collections: readonly (readonly DraftSnapshotReasonEvent[])[]
): DraftSnapshotReasonEvent[] {
  const reasons = [primary];
  const seen = new Set<DraftSnapshotReason>([primary.reason]);
  for (const collection of collections) {
    for (const event of collection) {
      if (seen.has(event.reason)) continue;
      seen.add(event.reason);
      reasons.push(event);
    }
  }
  return reasons;
}

function isDraftSnapshotReason(value: unknown): value is DraftSnapshotReason {
  return value === "manual" ||
    value === "reload" ||
    value === "restore" ||
    value === "close" ||
    value === "recovery-discard" ||
    value === "save-conflict" ||
    value === "save-as-overwrite" ||
    value === "window-close" ||
    value === "legacy-idle" ||
    value === "legacy-preserved";
}

function isFileStats(value: unknown): value is MarkdownFileStats {
  if (!value || typeof value !== "object") return false;
  const stats = value as Partial<MarkdownFileStats>;
  return typeof stats.modifiedMs === "number" && typeof stats.size === "number";
}

function normalizeGlobalLimit(value: number): number {
  if (!Number.isFinite(value)) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.floor(value));
}

function megabytesToBytes(value: number): number {
  if (!Number.isFinite(value)) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value * MIB)));
}

function snapshotByteSize(snapshot: Pick<DraftSnapshot, "size">): number {
  if (!Number.isFinite(snapshot.size)) return 0;
  return Math.max(0, Math.floor(snapshot.size));
}

function totalSnapshotBytes(snapshots: readonly DraftSnapshot[]): number {
  return snapshots.reduce((total, snapshot) => total + snapshotByteSize(snapshot), 0);
}

function compareSnapshotsNewestFirst(left: DraftSnapshot, right: DraftSnapshot): number {
  return right.createdAt - left.createdAt;
}

function compareSnapshotsOldestFirst(left: DraftSnapshot, right: DraftSnapshot): number {
  return left.createdAt - right.createdAt;
}

function sameSnapshotArray(left: readonly DraftSnapshot[], right: readonly DraftSnapshot[]): boolean {
  return left.length === right.length && left.every((snapshot, index) => snapshot === right[index]);
}

function sameSnapshotMetadata(left: DraftSnapshot, right: DraftSnapshot): boolean {
  return left.kind === right.kind && left.reason === right.reason && sameReasonEvents(left.reasons, right.reasons);
}

function sameReasonEvents(left: readonly DraftSnapshotReasonEvent[], right: readonly DraftSnapshotReasonEvent[]): boolean {
  return left.length === right.length && left.every((event, index) => (
    event.reason === right[index]?.reason && event.occurredAt === right[index]?.occurredAt
  ));
}

function hashString(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}
