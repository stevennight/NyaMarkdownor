import type { MarkdownFileStats } from "../types";

export type DiskChangeKind = "none" | "metadata-only" | "content";

export function sameFileStats(left: MarkdownFileStats | null | undefined, right: MarkdownFileStats | null | undefined): boolean {
  if (!left || !right) return false;
  return left.modifiedMs === right.modifiedMs && left.size === right.size;
}

export function fileChangedOnDisk(
  knownStats: MarkdownFileStats | null | undefined,
  currentStats: MarkdownFileStats | null | undefined
): boolean {
  if (!knownStats || !currentStats) return false;
  return !sameFileStats(knownStats, currentStats);
}

export function diskNeedsReview(
  knownStats: MarkdownFileStats | null | undefined,
  currentStats: MarkdownFileStats | null | undefined
): boolean {
  if (!knownStats) return true;
  if (!currentStats) return true;
  return !sameFileStats(knownStats, currentStats);
}

export function diskContentChangedSinceLastSave(lastSavedMarkdown: string, diskMarkdown: string): boolean {
  return diskMarkdown !== lastSavedMarkdown;
}

export function diskChangeKind(
  knownStats: MarkdownFileStats | null | undefined,
  currentStats: MarkdownFileStats | null | undefined,
  lastSavedMarkdown: string,
  diskMarkdown: string
): DiskChangeKind {
  if (!fileChangedOnDisk(knownStats, currentStats)) return "none";
  return diskContentChangedSinceLastSave(lastSavedMarkdown, diskMarkdown) ? "content" : "metadata-only";
}
