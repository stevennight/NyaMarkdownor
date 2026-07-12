import type { MarkdownDocument } from "../types";
import { queueDesktopStoreTextWrite, readDesktopStoreText } from "./desktopStore";
import { normalizeDraftDocument } from "./draftDocument";
import { normalizeStoredEditorStateSnapshot, type EditorStateSnapshot } from "./editorStateSnapshots";
import type { TextRange } from "./editorCommands";

const DOCUMENT_TABS_STORAGE_KEY = "nya-markdownor-document-tabs-v1";
const MAX_PERSISTED_TABS = 24;

export type DocumentTabState = {
  id: string;
  document: MarkdownDocument;
  editorStateSnapshot?: EditorStateSnapshot;
  richScrollProgress?: number;
  richSelection?: TextRange;
  createdAt: number;
};

export type DocumentTabsRecord = {
  version: 1;
  tableCellBreakFormat: "html";
  savedAt: number;
  activeTabId: string;
  tabs: DocumentTabState[];
};

export type LiveEditorTabState = {
  tabId: string | null;
  markdown?: string;
  editorStateSnapshot?: EditorStateSnapshot;
  storedEditorStateSnapshots?: ReadonlyMap<string, EditorStateSnapshot>;
  richScrollProgress?: number;
  storedRichScrollProgress?: ReadonlyMap<string, number>;
  richSelection?: TextRange;
  storedRichSelections?: ReadonlyMap<string, TextRange>;
};

export function loadDocumentTabsRecord(): DocumentTabsRecord | null {
  try {
    const raw = localStorage.getItem(DOCUMENT_TABS_STORAGE_KEY);
    if (!raw) return null;
    return parseDocumentTabsRecord(raw);
  } catch (error) {
    console.warn(error);
    return null;
  }
}

export function saveDocumentTabsRecord(tabs: DocumentTabState[], activeTabId: string): boolean {
  const serialized = serializeDocumentTabsRecord(tabs, activeTabId);
  void queueDesktopStoreTextWrite("document-tabs", serialized);

  return saveDocumentTabsRecordLocal(serialized);
}

export async function saveDocumentTabsRecordImmediately(tabs: DocumentTabState[], activeTabId: string): Promise<boolean> {
  const serialized = serializeDocumentTabsRecord(tabs, activeTabId);
  const desktopWrite = queueDesktopStoreTextWrite("document-tabs", serialized);
  const localSaved = saveDocumentTabsRecordLocal(serialized);
  const desktopSaved = await desktopWrite;
  return localSaved || desktopSaved;
}

function saveDocumentTabsRecordLocal(serialized: string): boolean {
  try {
    localStorage.setItem(DOCUMENT_TABS_STORAGE_KEY, serialized);
    return true;
  } catch (error) {
    console.warn(error);
    return false;
  }
}

function serializeDocumentTabsRecord(tabs: DocumentTabState[], activeTabId: string): string {
  return JSON.stringify(createDocumentTabsRecord(tabs, activeTabId));
}

export async function loadDesktopDocumentTabsRecord(): Promise<DocumentTabsRecord | null> {
  const raw = await readDesktopStoreText("document-tabs");
  return raw ? parseDocumentTabsRecord(raw) : null;
}

export function createDocumentTabsRecord(
  tabs: DocumentTabState[],
  activeTabId: string,
  savedAt = Date.now(),
  migrateLegacyTableCellBreaks = false
): DocumentTabsRecord {
  const normalizedTabs = normalizeDocumentTabs(
    tabsForPersistence(tabs, activeTabId),
    migrateLegacyTableCellBreaks
  );
  const active = normalizedTabs.some((tab) => tab.id === activeTabId)
    ? activeTabId
    : normalizedTabs[0]?.id ?? "";

  return {
    version: 1,
    tableCellBreakFormat: "html",
    savedAt,
    activeTabId: active,
    tabs: normalizedTabs
  };
}

function tabsForPersistence(tabs: DocumentTabState[], activeTabId: string): DocumentTabState[] {
  if (tabs.length <= MAX_PERSISTED_TABS) return tabs;

  const activeIndex = tabs.findIndex((tab) => tab.id === activeTabId);
  if (activeIndex < 0) return tabs.slice(0, MAX_PERSISTED_TABS);

  const beforeActiveTarget = Math.floor(MAX_PERSISTED_TABS / 2);
  const start = Math.min(
    Math.max(0, activeIndex - beforeActiveTarget),
    Math.max(0, tabs.length - MAX_PERSISTED_TABS)
  );

  return tabs.slice(start, start + MAX_PERSISTED_TABS);
}

export function documentTabsWithLiveEditorState(
  tabs: DocumentTabState[],
  liveState: LiveEditorTabState
): DocumentTabState[] {
  return tabs.map((tab) => {
    const liveMarkdown = tab.id === liveState.tabId ? liveState.markdown : undefined;
    const markdown = liveMarkdown === undefined ? tab.document.markdown : liveMarkdown;
    const document = tab.document.markdown === markdown
      ? tab.document
      : {
          ...tab.document,
          markdown
        };
    const snapshotValue = tab.id === liveState.tabId
      ? liveState.editorStateSnapshot
      : liveState.storedEditorStateSnapshots?.get(tab.id) ?? tab.editorStateSnapshot;
    const editorStateSnapshot = normalizeStoredEditorStateSnapshot(snapshotValue, markdown);
    const richScrollProgress = normalizeRichScrollProgress(
      tab.id === liveState.tabId
        ? liveState.richScrollProgress
        : liveState.storedRichScrollProgress?.get(tab.id) ?? tab.richScrollProgress
    );
    const richSelection = normalizeRichSelection(
      tab.id === liveState.tabId
        ? liveState.richSelection
        : liveState.storedRichSelections?.get(tab.id) ?? tab.richSelection
    );
    const { editorStateSnapshot: _staleSnapshot, richSelection: _staleRichSelection, ...tabWithoutSnapshot } = tab;

    return {
      ...tabWithoutSnapshot,
      document,
      ...(editorStateSnapshot ? { editorStateSnapshot } : {}),
      ...(richScrollProgress !== undefined ? { richScrollProgress } : {}),
      ...(richSelection ? { richSelection } : {})
    };
  });
}

export function parseDocumentTabsRecord(raw: string): DocumentTabsRecord | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return normalizeDocumentTabsRecord(parsed);
  } catch (error) {
    console.warn(error);
    return null;
  }
}

function normalizeDocumentTabsRecord(value: unknown): DocumentTabsRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<DocumentTabsRecord>;
  if (record.version !== 1 || typeof record.savedAt !== "number" || !Number.isFinite(record.savedAt)) return null;
  if (typeof record.activeTabId !== "string" || !Array.isArray(record.tabs)) return null;

  return createDocumentTabsRecord(
    record.tabs,
    record.activeTabId,
    record.savedAt,
    record.tableCellBreakFormat !== "html"
  );
}

function normalizeDocumentTabs(value: unknown[], migrateLegacyTableCellBreaks = false): DocumentTabState[] {
  const usedIds = new Set<string>();
  const tabs: DocumentTabState[] = [];

  for (const [index, item] of value.entries()) {
    const tab = normalizeDocumentTab(item, index, usedIds, migrateLegacyTableCellBreaks);
    if (!tab) continue;
    usedIds.add(tab.id);
    tabs.push(tab);
    if (tabs.length >= MAX_PERSISTED_TABS) break;
  }

  return tabs;
}

function normalizeDocumentTab(
  value: unknown,
  index: number,
  usedIds: Set<string>,
  migrateLegacyTableCellBreaks = false
): DocumentTabState | null {
  if (!value || typeof value !== "object") return null;
  const tab = value as Partial<DocumentTabState>;
  const document = normalizeDraftDocument(tab.document, migrateLegacyTableCellBreaks);
  if (!document) return null;
  const editorStateSnapshot = normalizeStoredEditorStateSnapshot(tab.editorStateSnapshot, document.markdown);
  const richScrollProgress = normalizeRichScrollProgress(tab.richScrollProgress);
  const richSelection = normalizeRichSelection(tab.richSelection);

  return {
    id: uniqueTabId(typeof tab.id === "string" ? tab.id : "", index, usedIds),
    document,
    ...(editorStateSnapshot ? { editorStateSnapshot } : {}),
    ...(richScrollProgress !== undefined ? { richScrollProgress } : {}),
    ...(richSelection ? { richSelection } : {}),
    createdAt: typeof tab.createdAt === "number" && Number.isFinite(tab.createdAt) ? tab.createdAt : 0
  };
}

function normalizeRichScrollProgress(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(1, Math.max(0, value));
}

function normalizeRichSelection(value: unknown): TextRange | undefined {
  if (!value || typeof value !== "object") return undefined;
  const selection = value as Partial<TextRange>;
  if (typeof selection.from !== "number" || typeof selection.to !== "number") return undefined;
  if (!Number.isFinite(selection.from) || !Number.isFinite(selection.to)) return undefined;
  const from = Math.max(0, Math.floor(selection.from));
  const to = Math.max(0, Math.floor(selection.to));
  return { from: Math.min(from, to), to: Math.max(from, to) };
}

function uniqueTabId(preferredId: string, index: number, usedIds: Set<string>): string {
  if (preferredId && !usedIds.has(preferredId)) return preferredId;

  let suffix = index + 1;
  let fallbackId = `restored-tab-${suffix}`;
  while (usedIds.has(fallbackId)) {
    suffix += 1;
    fallbackId = `restored-tab-${suffix}`;
  }
  return fallbackId;
}
