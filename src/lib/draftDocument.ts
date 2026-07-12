import type { MarkdownDocument, MarkdownFileStats } from "../types";
import { queueDesktopStoreTextWrite, readDesktopStoreText } from "./desktopStore";
import { isMarkdownLineEnding, normalizeMarkdownText } from "./lineEndings";

const DRAFT_DOCUMENT_STORAGE_KEY = "nya-markdownor-draft-v2";

export type DraftDocumentRecord = {
  version: 1;
  tableCellBreakFormat: "html";
  savedAt: number;
  document: MarkdownDocument;
};

export function loadDraftDocument(): MarkdownDocument | null {
  return loadDraftDocumentRecord()?.document ?? null;
}

export function loadDraftDocumentRecord(): DraftDocumentRecord | null {
  try {
    const raw = localStorage.getItem(DRAFT_DOCUMENT_STORAGE_KEY);
    if (!raw) return null;
    return parseDraftDocumentRecord(raw);
  } catch (error) {
    console.warn(error);
    return null;
  }
}

export function saveDraftDocument(document: MarkdownDocument): boolean {
  const serialized = serializeDraftDocumentRecord(document);
  void queueDesktopStoreTextWrite("draft-document", serialized);

  return saveDraftDocumentLocal(serialized);
}

export async function saveDraftDocumentImmediately(document: MarkdownDocument): Promise<boolean> {
  const serialized = serializeDraftDocumentRecord(document);
  const desktopWrite = queueDesktopStoreTextWrite("draft-document", serialized);
  const localSaved = saveDraftDocumentLocal(serialized);
  const desktopSaved = await desktopWrite;
  return localSaved || desktopSaved;
}

function saveDraftDocumentLocal(serialized: string): boolean {
  try {
    localStorage.setItem(DRAFT_DOCUMENT_STORAGE_KEY, serialized);
    return true;
  } catch (error) {
    console.warn(error);
    return false;
  }
}

function serializeDraftDocumentRecord(document: MarkdownDocument): string {
  return JSON.stringify(createDraftDocumentRecord(document));
}

export async function loadDesktopDraftDocumentRecord(): Promise<DraftDocumentRecord | null> {
  const raw = await readDesktopStoreText("draft-document");
  return raw ? parseDraftDocumentRecord(raw) : null;
}

export function createDraftDocumentRecord(document: MarkdownDocument, savedAt = Date.now()): DraftDocumentRecord {
  const normalizedDocument = normalizeDraftDocument(document) ?? document;

  return {
    version: 1,
    tableCellBreakFormat: "html",
    savedAt,
    document: normalizedDocument
  };
}

export function parseDraftDocumentRecord(raw: string): DraftDocumentRecord | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const record = normalizeDraftDocumentRecord(parsed);
    if (record) return record;

    const legacyDocument = normalizeDraftDocument(parsed, true);
    return legacyDocument ? createDraftDocumentRecord(legacyDocument, 0) : null;
  } catch (error) {
    console.warn(error);
    return null;
  }
}

function normalizeDraftDocumentRecord(value: unknown): DraftDocumentRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<DraftDocumentRecord>;
  if (record.version !== 1 || typeof record.savedAt !== "number" || !Number.isFinite(record.savedAt)) return null;

  const document = normalizeDraftDocument(record.document, record.tableCellBreakFormat !== "html");
  return document ? {
    version: 1,
    tableCellBreakFormat: "html",
    savedAt: record.savedAt,
    document
  } : null;
}

export function normalizeDraftDocument(value: unknown, migrateLegacyTableCellBreaks = false): MarkdownDocument | null {
  if (!value || typeof value !== "object") return null;
  const document = value as Partial<MarkdownDocument>;
  if (typeof document.markdown !== "string") return null;
  const normalized = normalizeMarkdownText(document.markdown, { migrateLegacyTableCellBreaks });
  const lastSavedMarkdown = typeof document.lastSavedMarkdown === "string"
    ? normalizeMarkdownText(document.lastSavedMarkdown, { migrateLegacyTableCellBreaks }).markdown
    : normalized.markdown;

  return {
    fileName: typeof document.fileName === "string" && document.fileName ? document.fileName : "Untitled.md",
    filePath: typeof document.filePath === "string" && document.filePath ? document.filePath : null,
    markdown: normalized.markdown,
    lastSavedMarkdown,
    lineEnding: isMarkdownLineEnding(document.lineEnding) ? document.lineEnding : normalized.lineEnding,
    lastBackupPath: typeof document.lastBackupPath === "string" ? document.lastBackupPath : null,
    fileStats: normalizeStoredFileStats(document.fileStats)
  };
}

function normalizeStoredFileStats(value: unknown): MarkdownFileStats | null {
  if (!value || typeof value !== "object") return null;
  const stats = value as { modifiedMs?: unknown; size?: unknown };
  if (typeof stats.modifiedMs !== "number" || typeof stats.size !== "number") return null;
  if (!Number.isFinite(stats.modifiedMs) || !Number.isFinite(stats.size)) return null;
  return { modifiedMs: stats.modifiedMs, size: stats.size };
}
