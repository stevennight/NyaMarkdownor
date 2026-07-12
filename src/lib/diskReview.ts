import type { MarkdownFileStats } from "../types";
import { sameLocalPath } from "./localPathKeys";

export type DiskReviewCandidate = {
  tabId: string;
  filePath: string;
  knownStats: MarkdownFileStats | null;
  lastSavedMarkdown: string;
};

export type DiskReviewTab = {
  id: string;
  document: {
    filePath: string | null;
    fileStats?: MarkdownFileStats | null;
    lastSavedMarkdown: string;
  };
};

export function diskReviewVersionKey(
  tabId: string,
  stats: MarkdownFileStats | null | undefined
): string | null {
  if (!stats) return null;
  return `${tabId}\u0000${stats.modifiedMs}\u0000${stats.size}`;
}

export function shouldPromptForDiskReview(
  previousVersionKey: string | undefined,
  tabId: string,
  stats: MarkdownFileStats | null | undefined
): boolean {
  const nextVersionKey = diskReviewVersionKey(tabId, stats);
  return nextVersionKey !== null && nextVersionKey !== previousVersionKey;
}

export function inactiveDiskReviewCandidates(
  tabs: readonly DiskReviewTab[],
  activeTabId: string,
  limit = 24,
  startIndex = 0
): DiskReviewCandidate[] {
  if (limit <= 0 || tabs.length === 0) return [];

  const candidates: DiskReviewCandidate[] = [];
  const firstIndex = ((startIndex % tabs.length) + tabs.length) % tabs.length;
  for (let offset = 0; offset < tabs.length; offset += 1) {
    if (candidates.length >= limit) break;
    const tab = tabs[(firstIndex + offset) % tabs.length];
    if (tab.id === activeTabId || !tab.document.filePath) continue;

    candidates.push({
      tabId: tab.id,
      filePath: tab.document.filePath,
      knownStats: tab.document.fileStats ?? null,
      lastSavedMarkdown: tab.document.lastSavedMarkdown
    });
  }

  return candidates;
}

export function tabMatchesDiskReviewCandidate(tab: DiskReviewTab | null | undefined, candidate: DiskReviewCandidate): boolean {
  if (!tab || tab.id !== candidate.tabId) return false;
  if (!sameLocalPath(tab.document.filePath, candidate.filePath)) return false;
  if (tab.document.lastSavedMarkdown !== candidate.lastSavedMarkdown) return false;
  return sameStats(tab.document.fileStats ?? null, candidate.knownStats);
}

function sameStats(left: MarkdownFileStats | null, right: MarkdownFileStats | null): boolean {
  if (!left || !right) return left === right;
  return left.modifiedMs === right.modifiedMs && left.size === right.size;
}
