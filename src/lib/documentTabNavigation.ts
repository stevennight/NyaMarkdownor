import { sameLocalPath } from "./localPathKeys";

export function nextDocumentTabId(tabIds: readonly string[], activeTabId: string, direction: -1 | 1): string | null {
  if (tabIds.length <= 1) return null;

  const activeIndex = tabIds.indexOf(activeTabId);
  const currentIndex = activeIndex >= 0 ? activeIndex : 0;
  const nextIndex = (currentIndex + direction + tabIds.length) % tabIds.length;
  return tabIds[nextIndex] ?? null;
}

export function documentTabIdAtShortcutIndex(tabIds: readonly string[], shortcutIndex: number): string | null {
  if (!tabIds.length || shortcutIndex < 0) return null;

  const targetIndex = shortcutIndex === 8 ? tabIds.length - 1 : shortcutIndex;
  return tabIds[targetIndex] ?? null;
}

const TAB_ORDER_KEY_SEPARATOR = "\u001f";

export function documentTabOrderKey(tabIds: readonly string[]): string {
  return tabIds.join(TAB_ORDER_KEY_SEPARATOR);
}

export function remainingDocumentTabIds(tabIds: readonly string[], closingTabIds: ReadonlySet<string>): string[] {
  return tabIds.filter((tabId) => !closingTabIds.has(tabId));
}

export function documentTabIdsAfter(tabIds: readonly string[], tabId: string): string[] {
  const tabIndex = tabIds.indexOf(tabId);
  if (tabIndex < 0 || tabIndex >= tabIds.length - 1) return [];
  return tabIds.slice(tabIndex + 1);
}

export function rememberClosedDocumentTabs<T>(
  closedTabs: readonly T[],
  closingTabs: readonly T[],
  limit = 10
): T[] {
  if (limit <= 0) return [];
  if (!closingTabs.length) return closedTabs.slice(0, limit);

  return [
    ...closingTabs.slice().reverse(),
    ...closedTabs
  ].slice(0, limit);
}

export function activeDocumentTabIdAfterClosing(
  tabIds: readonly string[],
  activeTabId: string,
  closingTabIds: ReadonlySet<string>
): string | null {
  const remaining = remainingDocumentTabIds(tabIds, closingTabIds);
  if (!remaining.length) return null;
  if (!closingTabIds.has(activeTabId) && remaining.includes(activeTabId)) return activeTabId;

  const activeIndex = tabIds.indexOf(activeTabId);
  if (activeIndex < 0) return remaining[0];

  const remainingBeforeActive = tabIds
    .slice(0, activeIndex)
    .filter((tabId) => !closingTabIds.has(tabId))
    .length;
  return remaining[Math.min(remainingBeforeActive, remaining.length - 1)] ?? remaining[0];
}

type ReplaceableDraftDocument = {
  fileName: string;
  filePath: string | null;
  markdown: string;
  lastSavedMarkdown: string;
  lastBackupPath?: string | null;
  fileStats?: unknown;
};

type ReplaceableDraftTab = {
  id: string;
  document: ReplaceableDraftDocument;
};

type DuplicatePathDocument = {
  filePath: string | null;
  markdown: string;
  lastSavedMarkdown: string;
};

type DuplicatePathOpenedFile = {
  path: string | null;
  markdown: string;
};

export type DuplicatePathOpenAction = "new-tab" | "switch-existing" | "replace-existing" | "open-disk-version";
export type SavedPathConflictAction = "close-conflicting-tab" | "detach-conflicting-tab";

export function duplicatePathOpenAction(
  existingDocument: DuplicatePathDocument | null | undefined,
  opened: DuplicatePathOpenedFile
): DuplicatePathOpenAction {
  if (!existingDocument || !sameLocalPath(existingDocument.filePath, opened.path)) return "new-tab";

  const editorMatchesDisk = existingDocument.markdown === opened.markdown;
  const dirty = existingDocument.markdown !== existingDocument.lastSavedMarkdown;

  if (dirty && !editorMatchesDisk) return "open-disk-version";
  if (!editorMatchesDisk || existingDocument.lastSavedMarkdown !== opened.markdown) return "replace-existing";
  return "switch-existing";
}

export function savedPathConflictingTab<T extends { id: string; document: { filePath: string | null } }>(
  tabs: readonly T[],
  savedTabId: string,
  savedPath: string | null | undefined
): T | null {
  if (!savedPath) return null;
  return tabs.find((tab) => tab.id !== savedTabId && sameLocalPath(tab.document.filePath, savedPath)) ?? null;
}

export function savedPathConflictAction(
  conflictingDocument: DuplicatePathDocument,
  savedMarkdown: string
): SavedPathConflictAction {
  const hasUnsavedUniqueContent = conflictingDocument.markdown !== conflictingDocument.lastSavedMarkdown
    && conflictingDocument.markdown !== savedMarkdown;
  return hasUnsavedUniqueContent ? "detach-conflicting-tab" : "close-conflicting-tab";
}

export function replaceableDraftTabId(
  tabs: readonly ReplaceableDraftTab[],
  activeTabId: string,
  placeholderMarkdowns: readonly string[] = [""]
): string | null {
  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  if (!activeTab) return null;

  const document = activeTab.document;
  if (document.filePath !== null) return null;
  if (document.markdown !== document.lastSavedMarkdown) return null;
  if (document.lastBackupPath) return null;
  if (document.fileStats) return null;
  if (!isUntitledDraftName(document.fileName)) return null;

  const replaceableMarkdowns = new Set(["", ...placeholderMarkdowns]);
  return replaceableMarkdowns.has(document.markdown) ? activeTab.id : null;
}

function isUntitledDraftName(fileName: string): boolean {
  return /^Untitled(?: \d+)?\.md$/i.test(fileName);
}

export type DocumentTabDropPosition = "before" | "after";

export function reorderDocumentTabs<T extends { id: string }>(
  tabs: readonly T[],
  draggedTabId: string,
  targetTabId: string,
  position: DocumentTabDropPosition
): T[] {
  if (draggedTabId === targetTabId) return [...tabs];

  const draggedTab = tabs.find((tab) => tab.id === draggedTabId);
  const targetTab = tabs.find((tab) => tab.id === targetTabId);
  if (!draggedTab || !targetTab) return [...tabs];

  const withoutDragged = tabs.filter((tab) => tab.id !== draggedTabId);
  const targetIndex = withoutDragged.findIndex((tab) => tab.id === targetTabId);
  if (targetIndex < 0) return [...tabs];

  const insertIndex = position === "before" ? targetIndex : targetIndex + 1;
  return [
    ...withoutDragged.slice(0, insertIndex),
    draggedTab,
    ...withoutDragged.slice(insertIndex)
  ];
}
