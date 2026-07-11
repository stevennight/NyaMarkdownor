import type { MarkdownDocument } from "../types";
import type { OpenedFile } from "./fileIo";

export function applySavedFileToDocument(current: MarkdownDocument, saved: OpenedFile): MarkdownDocument {
  return {
    ...current,
    fileName: saved.name,
    filePath: saved.path,
    lastSavedMarkdown: saved.markdown,
    lineEnding: saved.lineEnding,
    lastBackupPath: saved.backupPath ?? null,
    fileStats: saved.fileStats ?? null
  };
}

export function savedTabsLabel(count: number): string {
  return count === 1 ? "Saved 1 tab" : `Saved ${count} tabs`;
}

export type SaveAllStopReason = "canceled" | "downloaded";

export function saveAllStoppedLabel(savedCount: number, reason: SaveAllStopReason): string {
  if (reason === "downloaded") {
    return savedCount > 0
      ? `${savedTabsLabel(savedCount)}; downloaded copy; local file binding unavailable`
      : "Downloaded copy; local file binding unavailable";
  }

  return savedCount > 0 ? `${savedTabsLabel(savedCount)}; save all stopped` : "Save all canceled";
}

export function diskStatusLabel(
  document: Pick<MarkdownDocument, "filePath" | "fileStats">,
  externalChange: boolean
): string {
  if (!document.filePath) return "Local draft";
  if (externalChange) return "Disk needs review";
  if (!document.fileStats) return "Disk needs review";
  return "Disk current";
}

export function saveSafetyStatusLabel(document: Pick<MarkdownDocument, "filePath" | "lastBackupPath">): string {
  if (!document.filePath) return "No disk file";
  return document.lastBackupPath ? "Last save backed up" : "Safe save armed";
}

export function documentEditStatusLabel(document: Pick<MarkdownDocument, "filePath" | "markdown" | "lastSavedMarkdown">): string {
  const dirty = document.markdown !== document.lastSavedMarkdown;
  if (document.filePath) return dirty ? "Unsaved" : "Saved";
  return dirty ? "Unsaved draft" : "Draft";
}

export function tabSessionEditStatusLabel(
  activeDocument: Pick<MarkdownDocument, "filePath" | "markdown" | "lastSavedMarkdown">,
  dirtyTabsCount: number
): string {
  const activeDirty = activeDocument.markdown !== activeDocument.lastSavedMarkdown;
  if (dirtyTabsCount > 1) return `${dirtyTabsCount} unsaved tabs`;
  if (dirtyTabsCount === 1 && !activeDirty) return "1 unsaved tab";
  if (activeDirty) return activeDocument.filePath ? "Unsaved changes" : "Unsaved draft changes";
  return activeDocument.filePath ? "All changes saved" : "Draft not on disk";
}
