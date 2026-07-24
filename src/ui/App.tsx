import {
  lazy,
  Suspense,
  useEffect,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type ChangeEvent as ReactChangeEvent,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SetStateAction,
  type UIEvent as ReactUIEvent
} from "react";
import {
  AlertTriangle,
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowDownAZ,
  ArrowDownZA,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bold,
  ClipboardCopy,
  ChevronDown,
  ChevronRight,
  Check,
  Command,
  Columns2,
  Columns3,
  Code2,
  Copy,
  CopyPlus,
  FileCode2,
  FileDown,
  FileText,
  FilePlus2,
  FolderOpen,
  GitCompareArrows,
  Heading1,
  Heading2,
  Heading3,
  History,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Moon,
  Eye,
  Ellipsis,
  ListFilter,
  PanelLeft,
  PanelTop,
  PenLine,
  Plus,
  RotateCcw,
  Rows3,
  Save,
  SaveAll,
  Search,
  ScissorsLineDashed,
  Settings2,
  ShieldCheck,
  SquareMousePointer,
  Sun,
  Table2,
  TextSelect,
  TextCursorInput,
  TextQuote,
  Trash2,
  Redo2,
  Undo2,
  X
} from "lucide-react";
import { redo as redoCodeMirror, undo as undoCodeMirror } from "@codemirror/commands";
import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { getCurrentWebview, type DragDropEvent } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import type { BackupPreferences, Heading, LanguagePreference, MarkdownDocument, MarkdownFileStats, MarkdownTable, PaneLayout, SidebarPage, TableAlignment, TableBlock, TableHeightMode, ThemeMode, ViewMode, WorkspaceFile, WorkspaceListing } from "../types";
import { MarkdownEditor } from "./MarkdownEditor";
import type { RichMarkdownEditorHandle } from "./RichMarkdownEditor";
import { extractHeadings, markdownRangesToClipboardPayload, markdownRangesToTableCsv, markdownRangesToTableMarkdown, markdownRangesToTableTsv, markdownTableSliceToClipboardPayload, markdownTableSliceToCsv, markdownTableSliceToMarkdown, markdownTableSliceToTsv, referenceLabelsFromMarkdown } from "../lib/markdown";
import {
  buildMarkdownTable,
  deleteColumn as deleteTableColumnModel,
  deleteRow as deleteTableRowModel,
  duplicateColumn as duplicateTableColumnModel,
  duplicateRow as duplicateTableRowModel,
  fillTableCells,
  findTableAtOffset,
  getSortedTableRowOrder,
  insertColumn as insertTableColumnModel,
  insertRow as insertTableRowModel,
  moveColumn as moveTableColumnModel,
  moveRow as moveTableRowModel,
  setColumnAlignment,
  sortTableRows,
  updateTableCell,
  type TableSortDirection
} from "../lib/tables";
import {
  deleteMarkdownBackupHistory,
  deleteMarkdownBackup,
  existingMarkdownFileStats,
  listMarkdownBackups,
  listMarkdownBackupHistories,
  markdownBackupStorageUsage,
  listMarkdownWorkspace,
  initialMarkdownFilePaths,
  importMarkdownFilesAsDrafts,
  openMarkdownFiles,
  openMarkdownWorkspace,
  openLocalImageFiles,
  pickMarkdownBackupDirectory,
  isTauriRuntime,
  readMarkdownBackup,
  readMarkdownFileStats,
  readMarkdownPath,
  saveHtmlExport,
  saveMarkdownFile,
  sealMarkdownBackupRolling,
  openMarkdownFilesToastWithFailures,
  openedFileHasLocalBinding,
  manageFileAssociation,
  revealMarkdownFile,
  takeSecondaryInstanceMarkdownPaths,
  type FileAssociationScope,
  supportsBrowserFileAccess,
  type MarkdownBackup,
  type MarkdownBackupHistory,
  type OpenedFile,
  type OpenMarkdownFilesResult,
  type SavedExport
} from "../lib/fileIo";
import { copyRichContent, copyText, writeClipboardEventData } from "../lib/clipboard";
import { bundledBuildInfo, resolveBuildInfo, type BuildInfo } from "../lib/buildInfo";
import {
  checkForApplicationUpdates,
  downloadAndInstallApplicationUpdate,
  type ApplicationUpdateState,
  type UpdateCheckResult
} from "../lib/appUpdates";
import {
  applyMarkdownBlockCommand,
  applyMarkdownListIndentation,
  applyMarkdownTextCommand,
  applyTaskCheckboxToggle,
  applyTextChange,
  type MarkdownBlockCommand,
  type MarkdownListIndentDirection,
  type MarkdownTextCommand,
  type TextEdit,
  type TextRange
} from "../lib/editorCommands";
import {
  applyTableDocumentCommand,
  applyTableBodySelection,
  applyTableColumnBodySelection,
  applyTableColumnSelection,
  applyTableContentSelection,
  applyTableRowSelection,
  applyTableSelectionCommand,
  insertTableAtSelection,
  selectTableCellInMarkdownTable,
  type TableDocumentCommand,
  type TableSelectionCommand
} from "../lib/tableDocumentCommands";
import { forgetRecentFile, loadDesktopRecentFilesRecord, loadRecentFiles, loadRecentFilesRecord, rememberRecentFile, rememberRecentFiles, saveRecentFiles } from "../lib/recentFiles";
import {
  applyDraftSnapshotRetention,
  createDraftSnapshot,
  forgetDraftSnapshot,
  loadDesktopDraftSnapshotsRecord,
  loadDraftSnapshots,
  loadDraftSnapshotsRecord,
  rememberDraftSnapshot,
  saveDraftSnapshots,
  saveDraftSnapshotsImmediately,
  snapshotDocumentKey,
  type DraftSnapshot
} from "../lib/draftSnapshots";
import { loadDesktopDraftDocumentRecord, loadDraftDocument, loadDraftDocumentRecord, saveDraftDocument, saveDraftDocumentImmediately } from "../lib/draftDocument";
import { getPreviewRenderState, outlineDelayFor, previewDelayFor, previewMarkdownForWorker } from "../lib/renderScheduling";
import {
  clearManualPreviewSnapshot as clearManualPreviewSnapshotForTab,
  manualPreviewSnapshotForTab,
  pruneManualPreviewSnapshots,
  setManualPreviewSnapshot as setManualPreviewSnapshotForTab,
  type ManualPreviewSnapshots
} from "../lib/manualPreviewSnapshots";
import { diskChangeKind, diskNeedsReview } from "../lib/fileStats";
import { getDocumentCursorPosition, getDocumentMetrics, type DocumentCursorPosition } from "../lib/documentMetrics";
import { createExportHtmlDocument } from "../lib/exportHtml";
import { getScrollProgress, setScrollProgress } from "../lib/scrollSync";
import { createEditorStateSnapshot, type EditorStateSnapshot } from "../lib/editorStateSnapshots";
import { rewritePreviewImageSources } from "../lib/previewAssets";
import { resolveLocalMarkdownLinkTarget } from "../lib/localMarkdownLinks";
import { classifyPreviewLinkHref, previewAnchorIdCandidatesFromHref, shouldOpenPreviewLinkWithModifier } from "../lib/previewLinks";
import { openExternalLink } from "../lib/externalLinks";
import { droppedDraftImportToast, droppedOpenToast, isSupportedMarkdownDropName, openedFilesFromBrowserDrop, uniqueDroppedPaths } from "../lib/dropOpen";
import { createDroppedImageTextEdit, droppedImageMarkdown, droppedImageToast, isSupportedImageDropName } from "../lib/localImageDrop";
import { filterWorkspaceFiles, limitWorkspaceFilesForSidebar, sortWorkspaceFiles, sortWorkspaceFilesByModified } from "../lib/workspaceFiles";
import { recentFileCommands } from "../lib/recentFileCommands";
import { dirtyDocuments, isDocumentDirty } from "../lib/documentDirtyState";
import { applySavedFileToDocument, diskStatusLabel, documentEditStatusLabel, saveAllStoppedLabel, saveSafetyStatusLabel, savedTabsLabel, tabSessionEditStatusLabel } from "../lib/documentSaveState";
import { displayMarkdownDocumentName, suggestedMarkdownCopyName, suggestedMarkdownCopyTarget, suggestedMarkdownDiskVersionName, suggestedMarkdownSaveAsTarget, suggestedUntitledMarkdownName } from "../lib/fileNames";
import { removeMarkdownFileExtension } from "../lib/markdownFileTypes";
import { getSelectionSummary, hasNonEmptySelection, hasStructuredTableSelection, markdownFromSelectionRanges, selectionRangesOrWholeDocument, type SelectionSummary } from "../lib/selectionCopy";
import { activeOutlineHeadingKey, outlineHeadingKey } from "../lib/outlineNavigation";
import { previewSelectionToClipboardPayload } from "../lib/previewClipboard";
import { clipboardRowsForTablePaste, type ClipboardTableSource } from "../lib/clipboardTableRows";
import { activeOwnedEditorView } from "../lib/editorViewOwnership";
import {
  shouldFocusEditorView,
  shouldFocusPendingMountedEditor,
  shouldPreserveEditorSelectionOnToolbarMouseDown
} from "../lib/editorFocus";
import {
  EMPTY_RICH_DOCUMENT_HISTORY,
  applyRichDocumentHistoryAction,
  recordRichDocumentChange,
  type RichDocumentHistory,
  type RichDocumentHistoryAction
} from "../lib/richDocumentHistory";
import type { RichMarkdownSyncSource } from "../lib/richMarkdownSync";
import type { RichTableSelectionSummary } from "../lib/richTableSelection";
import {
  diskReviewVersionKey,
  inactiveDiskReviewCandidates,
  shouldPromptForDiskReview,
  tabMatchesDiskReviewCandidate,
  type DiskReviewCandidate
} from "../lib/diskReview";
import { areAppShortcutsBlocked, getTabNavigationShortcut, getTableSelectionShortcut, type TabNavigationShortcut, type TableSelectionShortcut } from "../lib/appShortcuts";
import { documentWindowTitle } from "../lib/windowTitle";
import { localPathKey, sameLocalPath } from "../lib/localPathKeys";
import {
  buildFileHistoryDocuments,
  fileHistoryDocumentKey,
  orderFileHistoryVersionsOldestFirst,
  removeSnapshotsForDocument,
  type FileHistoryDocument,
  type FileHistorySourceStates,
  type FileHistoryVersion
} from "../lib/fileHistory";
import { queueKeyedTask } from "../lib/keyedTaskQueue";
import {
  activeDocumentTabIdAfterClosing,
  documentTabIdsAfter,
  documentTabIdAtShortcutIndex,
  documentTabOrderKey,
  duplicatePathOpenAction,
  nextDocumentTabId,
  rememberClosedDocumentTabs,
  remainingDocumentTabIds,
  replaceableDraftTabId,
  reorderDocumentTabs,
  savedPathConflictAction,
  savedPathConflictingTab,
  type DocumentTabDropPosition
} from "../lib/documentTabNavigation";
import {
  appendedTableInspectorRowTarget,
  focusableTableSourcePosition,
  inspectorRowIndexForTableSourceRow,
  insertSerializedTableCellBreak,
  isTableInspectorCellBreakKey,
  isTableInspectorComposingKeyEvent,
  nextTableInspectorCellPosition,
  tableInspectorNavigationDirectionFromKey,
  tableSourcePositionForInspectorCell,
  type TableInspectorNavigationDirection
} from "../lib/tableInspector";
import { tableActionContextFromSelection, type TableActionContext } from "../lib/tableActionContext";
import { shouldQueueAutoSave, shouldRetryAutoSave } from "../lib/autoSave";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useMarkdownWorker } from "../hooks/useMarkdownWorker";
import { CommandPalette } from "./CommandPalette";
import { SettingsDialog } from "./SettingsDialog";
import { FileHistoryManagerDialog, type FileHistoryVersionDeleteResult } from "./FileHistoryManagerDialog";
import { BackupCompareDialog } from "./BackupCompareDialog";
import { FindReplacePanel } from "./FindReplacePanel";
import { InsertTableDialog, type TableSizeDraft } from "./InsertTableDialog";
import { LinkDialog } from "./LinkDialog";
import { type CommandItem } from "../lib/commands";
import { loadDesktopPreferencesRecord, loadPreferences, loadPreferencesRecord, normalizeBackupPreferences, savePreferences } from "../lib/preferences";
import { normalizeRichLinkHref } from "../lib/richLinks";
import { viewMenuFocusIndex, type ViewMenuFocusDirection } from "../lib/viewMenuNavigation";
import { closeWindowAfterRecovery, shouldBlockBrowserUnload } from "../lib/windowClose";
import { browserLanguages, createTranslator, resolveAppLocale, translateUiText, type Translator } from "../lib/i18n";
import { loadDesktopWorkspaceRootRecord, loadWorkspaceRoot, loadWorkspaceRootRecord, saveWorkspaceRoot } from "../lib/workspaceRoot";
import { defaultPaneLayout, paneLayoutCssVariables, resizeEditorPreviewPaneLayout, resizeTablePaneLayout } from "../lib/paneLayout";
import {
  documentTabsWithLiveEditorState,
  loadDesktopDocumentTabsRecord,
  loadDocumentTabsRecord,
  saveDocumentTabsRecord,
  saveDocumentTabsRecordImmediately,
  type DocumentTabState
} from "../lib/documentTabs";
import {
  findMatchIndexAtSelection,
  findNextMatchIndex,
  findTextMatches,
  getSelectionAfterReplace,
  replaceAllText,
  replaceTextRange,
  type SearchDirection
} from "../lib/search";

const RichMarkdownEditor = lazy(async () => {
  const module = await import("./RichMarkdownEditor");
  return { default: module.RichMarkdownEditor };
});

const LEGACY_SAMPLE_MARKDOWN = `# NyaMarkdownor

A local-first Markdown editor aiming for a polished desktop writing experience.

| Area | Goal | Status |
| --- | --- | --- |
| Table editing | Structured row and column operations | Draft |
| Smart copy | Copy clean text without losing Markdown | Working |
| Performance | CodeMirror-first source editing | Building |

## Direction

- Cross-platform desktop app with Tauri.
- Clean Markdown remains the canonical file format.
- Modern visual system for long writing sessions.
`;

const AUTO_SAVE_IDLE_MS = 1600;
const WORK_RECOVERY_IDLE_MS = 500;
const WORK_RECOVERY_MAX_DELAY_MS = 5000;
const BACKUP_HISTORY_REFRESH_MS = 30000;
const MAX_INTERACTIVE_BACKUP_COMPARE_BYTES = 16 * 1024 * 1024;
const TAB_DRAG_MIME = "application/x-nya-markdownor-tab";
const DEFERRED_METRICS_THRESHOLD = 80_000;

type ConfirmationState = {
  id: number;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  alternateLabel?: string;
  onAlternate?: () => void;
  tone?: "default" | "danger";
};

type WorkspaceSortMode = "path" | "modified";
type DocumentTab = DocumentTabState;
type SaveDocumentResult = "saved" | "canceled" | "downloaded";
type SaveDiskCheck = {
  expectedStats: MarkdownFileStats | null;
  overwriteExternal: boolean;
} | false;
const EMPTY_SELECTION_SUMMARY: SelectionSummary = { rangeCount: 0, charCount: 0 };
type OpenFileInTabAction = "opened" | "switched" | "refreshed" | "opened-disk-version";

type OpenFileInTabResult = {
  tab: DocumentTab;
  action: OpenFileInTabAction;
};

type CommitSavedFileResult = {
  tab: DocumentTab;
  conflictAction: "closed" | "detached" | null;
};

type DocumentTabSession = {
  tabs: DocumentTab[];
  activeTabId: string;
};

type PaneResizeState = {
  type: "editor-preview" | "table";
  startX: number;
  initialLayout: PaneLayout;
  pairWidth: number;
  currentLayout: PaneLayout;
};

type LocalImageInsertResult = {
  insertedCount: number;
  skippedCount: number;
  blockedByUnsaved: boolean;
};

type BackupComparisonState = {
  restore: () => void;
  tabId: string;
  versionMarkdown: string;
  currentMarkdown: string;
  currentName: string;
  versionLabel: string;
  currentLabel?: string;
  versionTitle?: string;
  currentTitle?: string;
  actionLabel?: string;
  actionIcon?: "restore" | "open";
  showAction?: boolean;
  restoreDisabled?: boolean;
};

type HistoryComparisonContent = {
  markdown: string;
  label: string;
  title: string;
};

type CurrentDocumentCheckpoint =
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

type ExternalDiskReviewState = {
  tabId: string;
  filePath: string;
  diskFile: OpenedFile;
  replacementReason?: "reload" | "recovery-discard";
};

type EditorSelectionState = TextRange & {
  ranges: TextRange[];
  cursorPosition?: DocumentCursorPosition;
};

const emptySelectionState: EditorSelectionState = {
  from: 0,
  to: 0,
  ranges: [{ from: 0, to: 0 }],
  cursorPosition: { line: 1, column: 1 }
};

export function App() {
  const desktopRuntime = isTauriRuntime();
  const browserFileAccess = !desktopRuntime && supportsBrowserFileAccess();
  const desktopLocalFilesAvailable = desktopRuntime;
  const [initialPreferences] = useState(loadPreferences);
  const [initialTabSession] = useState(createInitialTabSession);
  const [tabs, setTabs] = useState<DocumentTab[]>(initialTabSession.tabs);
  const [activeTabId, setActiveTabId] = useState(initialTabSession.activeTabId);
  const [closedTabs, setClosedTabs] = useState<DocumentTab[]>([]);
  const [viewMode, setViewModeState] = useState<ViewMode>(initialPreferences.viewMode);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [theme, setThemeState] = useState<ThemeMode>(initialPreferences.theme);
  const [language, setLanguageState] = useState<LanguagePreference>(initialPreferences.language);
  const [sidebarVisible, setSidebarVisibleState] = useState(initialPreferences.sidebarVisible);
  const [sidebarPage, setSidebarPage] = useState<SidebarPage>(initialPreferences.sidebarPage);
  const [autoSave, setAutoSaveState] = useState(initialPreferences.autoSave);
  const [backupPreferences, setBackupPreferencesState] = useState<BackupPreferences>(initialPreferences.backup);
  const [smartCopy, setSmartCopyState] = useState(initialPreferences.smartCopy);
  const [softSyntax, setSoftSyntaxState] = useState(initialPreferences.softSyntax);
  const [editorFontSize, setEditorFontSizeState] = useState(initialPreferences.editorFontSize);
  const [editorLineWidth, setEditorLineWidthState] = useState(initialPreferences.editorLineWidth);
  const [editorDensity, setEditorDensityState] = useState(initialPreferences.editorDensity);
  const [tableHeightMode, setTableHeightModeState] = useState<TableHeightMode>(initialPreferences.tableHeightMode);
  const [tableMaxHeightVh, setTableMaxHeightVhState] = useState(initialPreferences.tableMaxHeightVh);
  const [paneLayout, setPaneLayoutState] = useState(initialPreferences.paneLayout);
  const locale = resolveAppLocale(language, browserLanguages());
  const t = useMemo(() => createTranslator(locale), [locale]);
  const runtimeSubtitle = t(desktopRuntime ? "Desktop local files" : browserFileAccess ? "Web preview - no disk binding" : "Web preview - drafts only");
  const [selection, setSelection] = useState<EditorSelectionState>(emptySelectionState);
  const [toast, setToast] = useState("");
  const [recentFiles, setRecentFiles] = useState(loadRecentFiles);
  const [workspace, setWorkspace] = useState<WorkspaceListing | null>(null);
  const [workspaceQuery, setWorkspaceQuery] = useState("");
  const [workspaceSortMode, setWorkspaceSortMode] = useState<WorkspaceSortMode>("path");
  const [backups, setBackups] = useState<MarkdownBackup[]>([]);
  const [showAllBackups, setShowAllBackups] = useState(false);
  const [backupHistories, setBackupHistories] = useState<MarkdownBackupHistory[]>([]);
  const [backupHistoriesLoading, setBackupHistoriesLoading] = useState(false);
  const [historyManagerOpen, setHistoryManagerOpen] = useState(false);
  const [historySourceStates, setHistorySourceStates] = useState<FileHistorySourceStates>(new Map());
  const [historySourceStatesLoading, setHistorySourceStatesLoading] = useState(false);
  const [backupComparison, setBackupComparison] = useState<BackupComparisonState | null>(null);
  const [externalDiskReview, setExternalDiskReview] = useState<ExternalDiskReviewState | null>(null);
  const [draftSnapshots, setDraftSnapshots] = useState(loadDraftSnapshots);
  const [desktopProfileReady, setDesktopProfileReady] = useState(!isTauriRuntime());
  const [desktopRecoveryReady, setDesktopRecoveryReady] = useState(!isTauriRuntime());
  const [externalChangeTabIds, setExternalChangeTabIds] = useState<Set<string>>(() => new Set());
  const [backupLoading, setBackupLoading] = useState(false);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [buildInfo, setBuildInfo] = useState<BuildInfo>(bundledBuildInfo);
  const [applicationUpdate, setApplicationUpdate] = useState<ApplicationUpdateState>({ status: "idle" });
  const [tableSizeDialogOpen, setTableSizeDialogOpen] = useState(false);
  const [tableSizeDraft, setTableSizeDraft] = useState<TableSizeDraft>({ columns: 3, bodyRows: 2 });
  const [richTableActive, setRichTableActive] = useState(false);
  const [richTableSelection, setRichTableSelection] = useState<RichTableSelectionSummary | null>(null);
  const [linkDialogState, setLinkDialogState] = useState<{ href: string; canUnlink: boolean } | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [replaceVisible, setReplaceVisible] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [replaceValue, setReplaceValue] = useState("");
  const [findCaseSensitive, setFindCaseSensitive] = useState(false);
  const [findWholeWord, setFindWholeWord] = useState(false);
  const [richSelection, setRichSelection] = useState<TextRange>({ from: 0, to: 0 });
  const [richActiveHeadingIndex, setRichActiveHeadingIndex] = useState<number | null>(null);
  const [manualPreviewSnapshots, setManualPreviewSnapshots] = useState<ManualPreviewSnapshots>({});
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [dropOverlayActive, setDropOverlayActive] = useState(false);
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [tabDropTarget, setTabDropTarget] = useState<{ tabId: string; position: DocumentTabDropPosition } | null>(null);
  const [tabListOpen, setTabListOpen] = useState(false);
  const appShellRef = useRef<HTMLDivElement | null>(null);
  const viewMenuRef = useRef<HTMLDivElement | null>(null);
  const viewMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const tabListRef = useRef<HTMLDivElement | null>(null);
  const tabListMenuRef = useRef<HTMLDivElement | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const editorPaneRef = useRef<HTMLElement | null>(null);
  const previewPaneRef = useRef<HTMLElement | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const editorViewTabIdRef = useRef<string | null>(null);
  const richEditorRef = useRef<RichMarkdownEditorHandle | null>(null);
  const tableInspectorRef = useRef<HTMLElement | null>(null);
  const workspaceSearchRef = useRef<HTMLInputElement | null>(null);
  const previewRef = useRef<HTMLElement | null>(null);
  const confirmationResolverRef = useRef<((accepted: boolean) => void) | null>(null);
  const paneLayoutRef = useRef(paneLayout);
  const paneResizeStateRef = useRef<PaneResizeState | null>(null);
  const droppedPathsHandlerRef = useRef<(paths: string[]) => void>(() => undefined);
  const browserDragDepthRef = useRef(0);
  const viewModeRef = useRef<ViewMode>(viewMode);
  const scrollSyncSourceRef = useRef<"editor" | "preview" | null>(null);
  const scrollSyncReleaseTimerRef = useRef<number | null>(null);
  const editorScrollFrameRef = useRef<number | null>(null);
  const previewScrollFrameRef = useRef<number | null>(null);
  const activeTabScrollFrameRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const editorFocusTimerRef = useRef<number | null>(null);
  const pendingEditorFocusTabIdRef = useRef<string | null>(null);
  const autoSaveInFlightTabIdsRef = useRef(new Set<string>());
  const autoSaveAttemptedMarkdownRef = useRef(new Map<string, string>());
  const documentSaveQueueRef = useRef(new Map<string, Promise<void>>());
  const editorStateSnapshotsRef = useRef(new Map<string, EditorStateSnapshot>());
  const sourceScrollProgressRef = useRef(new Map<string, number>());
  const richScrollProgressRef = useRef(new Map<string, number>());
  const richSelectionsRef = useRef(new Map<string, TextRange>());
  const sourceToRichSelectionTextRef = useRef(new Map<string, string>());
  const richToSourceSelectionTextRef = useRef(new Map<string, string>());
  const richDocumentHistoriesRef = useRef(new Map<string, RichDocumentHistory>());
  const secondaryInstanceOpenHandlerRef = useRef<((paths: string[]) => void) | null>(null);
  const queuedSecondaryInstancePathsRef = useRef<string[][]>([]);
  const inactiveDiskReviewCursorRef = useRef(0);
  const promptedExternalDiskVersionsRef = useRef(new Map<string, string>());
  const lastWorkRecoveryPersistedAtRef = useRef(0);
  const backupUsageWarningShownRef = useRef(false);
  const automaticUpdateCheckStartedRef = useRef(false);
  const updateInstallInFlightRef = useRef(false);
  const promptedUpdateVersionRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void resolveBuildInfo().then((nextBuildInfo) => {
      if (!cancelled) setBuildInfo(nextBuildInfo);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!desktopRuntime || !desktopRecoveryReady || automaticUpdateCheckStartedRef.current) return undefined;
    automaticUpdateCheckStartedRef.current = true;
    const timer = window.setTimeout(() => {
      void checkApplicationUpdates(false);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [desktopRecoveryReady, desktopRuntime]);

  useEffect(() => {
    if (applicationUpdate.status !== "available"
      || promptedUpdateVersionRef.current === applicationUpdate.version
      || confirmation
      || externalDiskReview
      || backupComparison) return;

    promptedUpdateVersionRef.current = applicationUpdate.version;
    void promptApplicationUpdate(applicationUpdate);
  }, [applicationUpdate, backupComparison, confirmation, externalDiskReview]);

  const activeTab = useMemo<DocumentTab>(() => tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? createDocumentTab(createDefaultDocument()), [activeTabId, tabs]);
  const documentState = activeTab.document;
  const externalChange = externalChangeTabIds.has(activeTab.id);
  const manualPreviewMarkdown = manualPreviewSnapshotForTab(manualPreviewSnapshots, activeTab.id);
  const documentDisplayName = useMemo(() => displayMarkdownDocumentName(documentState), [documentState.fileName, documentState.filePath, documentState.markdown]);
  const tabOrderKey = useMemo(() => documentTabOrderKey(tabs.map((tab) => tab.id)), [tabs]);
  const initialDocumentRef = useRef(documentState);
  const initialTabSessionRef = useRef(initialTabSession);
  const documentStateRef = useRef(documentState);
  const tabsRef = useRef(tabs);
  const activeTabIdRef = useRef(activeTabId);
  const draftSnapshotsRef = useRef(draftSnapshots);
  const manualPreviewSnapshotsRef = useRef(manualPreviewSnapshots);
  const windowCloseInProgressRef = useRef(false);
  const windowCloseApprovedRef = useRef(false);
  const initialLaunchFilesOpenedRef = useRef(false);
  const desktopRecoveryReadyRef = useRef(desktopRecoveryReady);
  desktopRecoveryReadyRef.current = desktopRecoveryReady;
  secondaryInstanceOpenHandlerRef.current = (paths) => {
    void openLaunchMarkdownPaths(paths);
  };

  function setDocumentTabs(update: SetStateAction<DocumentTab[]>): DocumentTab[] {
    const nextTabs = resolveDocumentTabsStateUpdate(tabsRef.current, update);
    tabsRef.current = nextTabs;
    setTabs(nextTabs);
    return nextTabs;
  }

  function setDocumentState(update: SetStateAction<MarkdownDocument>) {
    updateDocumentTab(activeTab.id, update);
  }

  function setDocumentTabExternalChange(tabId: string, changed: boolean) {
    if (!changed) {
      promptedExternalDiskVersionsRef.current.delete(tabId);
      setExternalDiskReview((current) => current?.tabId === tabId ? null : current);
    }
    setExternalChangeTabIds((current) => {
      if (current.has(tabId) === changed) return current;
      const next = new Set(current);
      if (changed) {
        next.add(tabId);
      } else {
        next.delete(tabId);
      }
      return next;
    });
  }

  function clearExternalChangeState() {
    promptedExternalDiskVersionsRef.current.clear();
    setExternalDiskReview(null);
    setExternalChangeTabIds((current) => current.size ? new Set() : current);
  }

  function pruneExternalChangeState(nextTabs: readonly DocumentTab[]) {
    const liveTabIds = new Set(nextTabs.map((tab) => tab.id));
    for (const tabId of promptedExternalDiskVersionsRef.current.keys()) {
      if (!liveTabIds.has(tabId)) promptedExternalDiskVersionsRef.current.delete(tabId);
    }
    setExternalDiskReview((current) => current && !liveTabIds.has(current.tabId) ? null : current);
    setExternalChangeTabIds((current) => {
      if ([...current].every((tabId) => liveTabIds.has(tabId))) return current;
      return new Set([...current].filter((tabId) => liveTabIds.has(tabId)));
    });
  }

  function promptForExternalDiskReview(
    tabId: string,
    filePath: string,
    diskFile: OpenedFile,
    stats: MarkdownFileStats | null,
    replacementReason: ExternalDiskReviewState["replacementReason"] = "reload"
  ) {
    if (!shouldPromptForDiskReview(promptedExternalDiskVersionsRef.current.get(tabId), tabId, stats)) return;
    const versionKey = diskReviewVersionKey(tabId, stats);
    if (!versionKey) return;

    promptedExternalDiskVersionsRef.current.set(tabId, versionKey);
    setExternalDiskReview({ tabId, filePath, diskFile, replacementReason });
  }

  function updateDocumentTab(tabId: string, update: SetStateAction<MarkdownDocument>) {
    setDocumentTabs((current) => {
      if (!current.length) {
        const nextDocument = resolveDocumentStateUpdate(createDefaultDocument(), update);
        return [createDocumentTab(nextDocument)];
      }

      return current.map((tab) => {
        if (tab.id !== tabId) return tab;
        return {
          ...tab,
          document: resolveDocumentStateUpdate(tab.document, update)
        };
      });
    });
  }

  const debouncedOutlineMarkdown = useDebouncedValue(documentState.markdown, outlineDelayFor(documentState.markdown.length));
  const debouncedPreviewMarkdown = useDebouncedValue(documentState.markdown, previewDelayFor(documentState.markdown.length));
  const previewVisible = viewMode === "split" || viewMode === "preview";
  const {
    autoPreviewEnabled,
    manualPreviewStale,
    previewMarkdown,
    previewPaused,
    shouldRenderPreview
  } = getPreviewRenderState({
    currentMarkdown: documentState.markdown,
    debouncedMarkdown: debouncedPreviewMarkdown,
    manualMarkdown: manualPreviewMarkdown,
    previewVisible
  });
  const workerPreviewMarkdown = previewMarkdownForWorker(previewMarkdown, shouldRenderPreview);
  const markdownRender = useMarkdownWorker({
    outlineMarkdown: debouncedOutlineMarkdown,
    previewMarkdown: workerPreviewMarkdown,
    shouldRenderPreview
  });
  const headings = markdownRender.headings;
  const sourceActiveTable = useMemo<TableBlock | null>(
    () => viewMode === "wysiwyg"
      ? null
      : findTableAtOffset(documentState.markdown, selection.from, { deferLineNumberCalculation: true }),
    [documentState.markdown, selection.from, viewMode]
  );
  const activeTable = sourceActiveTable;
  const currentDocumentSnapshotKey = useMemo(
    () => fileHistoryDocumentKey({ ...documentState, documentId: activeTab.id }),
    [activeTab.id, documentState.fileName, documentState.filePath]
  );
  const currentDocumentDraftSnapshots = useMemo(
    () => draftSnapshots.filter((snapshot) => fileHistoryDocumentKey(snapshot) === currentDocumentSnapshotKey),
    [currentDocumentSnapshotKey, draftSnapshots]
  );
  const currentDocumentCheckpoints = useMemo<CurrentDocumentCheckpoint[]>(
    () => [
      ...backups.map((backup) => ({
        source: "disk" as const,
        timestamp: backup.updatedAtMs ?? backup.modifiedMs,
        backup
      })),
      ...currentDocumentDraftSnapshots.map((snapshot) => ({
        source: "local" as const,
        timestamp: snapshot.createdAt,
        snapshot
      }))
    ].sort((left, right) => right.timestamp - left.timestamp),
    [backups, currentDocumentDraftSnapshots]
  );
  const visibleCheckpoints = showAllBackups
    ? currentDocumentCheckpoints
    : currentDocumentCheckpoints.slice(0, 6);
  const hiddenCheckpointCount = currentDocumentCheckpoints.length - visibleCheckpoints.length;
  const historyDocuments = useMemo(
    () => buildFileHistoryDocuments(backupHistories, draftSnapshots, historySourceStates),
    [backupHistories, draftSnapshots, historySourceStates]
  );
  const historyKnownSourcePathsKey = [
    ...tabs.map((tab) => tab.document.filePath),
    ...recentFiles.map((file) => file.path),
    ...draftSnapshots.map((snapshot) => snapshot.filePath)
  ].filter((path): path is string => Boolean(path)).map(localPathKey).sort().join("\n");
  const historyKnownSourcePaths = useMemo(() => {
    const paths = new Map<string, string>();
    for (const path of [
      ...tabs.map((tab) => tab.document.filePath),
      ...recentFiles.map((file) => file.path),
      ...draftSnapshots.map((snapshot) => snapshot.filePath)
    ]) {
      if (path && !paths.has(localPathKey(path))) paths.set(localPathKey(path), path);
    }
    return [...paths.values()];
  }, [historyKnownSourcePathsKey]);
  const workspaceFileView = useMemo(
    () => {
      if (!workspace) return limitWorkspaceFilesForSidebar([]);
      const filtered = filterWorkspaceFiles(workspace.files, workspaceQuery);
      const sorted = workspaceSortMode === "modified" ? sortWorkspaceFilesByModified(filtered) : sortWorkspaceFiles(filtered);
      return limitWorkspaceFilesForSidebar(sorted);
    },
    [workspace, workspaceQuery, workspaceSortMode]
  );
  const dirty = isDocumentDirty(documentState);
  const dirtyTabsCount = useMemo(() => dirtyDocuments(tabs).length, [tabs]);
  const hasDirtyTabs = dirtyTabsCount > 0;
  const windowTitle = useMemo(
    () => documentWindowTitle({ displayName: documentDisplayName, dirty, dirtyTabsCount }),
    [dirty, dirtyTabsCount, documentDisplayName]
  );
  const selectionSummary = useMemo(
    () => viewMode === "wysiwyg"
      ? EMPTY_SELECTION_SUMMARY
      : getSelectionSummary(selection.ranges, documentState.markdown),
    [documentState.markdown, selection.ranges, viewMode]
  );
  const activeOutlineKey = useMemo(
    () => {
      if (viewMode === "wysiwyg") {
        const heading = richActiveHeadingIndex === null ? null : headings[richActiveHeadingIndex];
        return heading ? outlineHeadingKey(heading) : null;
      }
      return activeOutlineHeadingKey(headings, (selection.cursorPosition?.line ?? 1) - 1);
    },
    [headings, richActiveHeadingIndex, selection.cursorPosition?.line, viewMode]
  );
  const selectedTableCells = hasStructuredTableSelection(selectionSummary);
  const previewPending = shouldRenderPreview && ((autoPreviewEnabled && debouncedPreviewMarkdown !== documentState.markdown) || markdownRender.previewPending);
  const previewStatus = markdownRender.error
    ? "Preview error"
    : previewPaused
      ? "Preview paused"
      : manualPreviewStale
        ? "Preview stale"
        : previewPending
          ? "Updating..."
          : `${headings.length} headings`;
  const rawPreviewHtml = markdownRender.error ? `<p>${t("Preview render failed.")}</p>` : markdownRender.previewHtml || "<p></p>";
  const previewHtml = useMemo(
    () => rewritePreviewImageSources(rawPreviewHtml, documentState.filePath),
    [documentState.filePath, rawPreviewHtml]
  );
  const findOptions = useMemo(() => ({ caseSensitive: findCaseSensitive, wholeWord: findWholeWord }), [findCaseSensitive, findWholeWord]);
  const findMatches = useMemo(() => {
    if (!findOpen) return [];
    if (viewMode === "wysiwyg") return richEditorRef.current?.findTextMatches(findQuery, findOptions) ?? [];
    return findTextMatches(documentState.markdown, findQuery, findOptions);
  }, [documentState.markdown, findOpen, findOptions, findQuery, viewMode]);
  const activeFindIndex = useMemo(
    () => findMatchIndexAtSelection(findMatches, viewMode === "wysiwyg" ? richSelection : selection),
    [findMatches, richSelection, selection, viewMode]
  );

  useEffect(() => {
    if (!isTauriRuntime()) return undefined;

    let cancelled = false;
    const initialLocalPreferencesRecord = loadPreferencesRecord();
    const initialLocalRecentFilesRecord = loadRecentFilesRecord();
    const initialLocalWorkspaceRootRecord = loadWorkspaceRootRecord();

    async function hydrateDesktopProfile() {
      try {
        const [desktopPreferencesRecord, desktopRecentFilesRecord, desktopWorkspaceRootRecord] = await Promise.all([
          loadDesktopPreferencesRecord(),
          loadDesktopRecentFilesRecord(),
          loadDesktopWorkspaceRootRecord()
        ]);

        if (cancelled) return;

        if (
          desktopPreferencesRecord
          && (!initialLocalPreferencesRecord || desktopPreferencesRecord.savedAt > initialLocalPreferencesRecord.savedAt)
        ) {
          const preferences = desktopPreferencesRecord.preferences;
          setViewModeState(preferences.viewMode);
          setThemeState(preferences.theme);
          setLanguageState(preferences.language);
          setSidebarVisibleState(preferences.sidebarVisible);
          setSidebarPage(preferences.sidebarPage);
          setAutoSaveState(preferences.autoSave);
          setBackupPreferencesState(preferences.backup);
          setSmartCopyState(preferences.smartCopy);
          setSoftSyntaxState(preferences.softSyntax);
          setEditorFontSizeState(preferences.editorFontSize);
          setEditorLineWidthState(preferences.editorLineWidth);
          setEditorDensityState(preferences.editorDensity);
          setTableHeightModeState(preferences.tableHeightMode);
          setTableMaxHeightVhState(preferences.tableMaxHeightVh);
          setPaneLayoutState(preferences.paneLayout);
          savePreferences(preferences);
        }

        if (
          desktopRecentFilesRecord
          && (!initialLocalRecentFilesRecord || desktopRecentFilesRecord.savedAt > initialLocalRecentFilesRecord.savedAt)
        ) {
          setRecentFiles(desktopRecentFilesRecord.files);
          saveRecentFiles(desktopRecentFilesRecord.files);
        }

        if (
          desktopWorkspaceRootRecord
          && (!initialLocalWorkspaceRootRecord || desktopWorkspaceRootRecord.savedAt > initialLocalWorkspaceRootRecord.savedAt)
        ) {
          saveWorkspaceRoot(desktopWorkspaceRootRecord.rootPath);
        }
      } catch (error) {
        console.warn(error);
      } finally {
        if (!cancelled) setDesktopProfileReady(true);
      }
    }

    void hydrateDesktopProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;

    if (!desktopRuntime) return;

    void getCurrentWindow().setTheme(theme).catch((error) => {
      console.warn(error);
    });
  }, [desktopRuntime, theme]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    viewModeRef.current = viewMode;
    if (viewMode !== "split") scrollSyncSourceRef.current = null;
  }, [viewMode]);

  useEffect(() => {
    if (!viewMenuOpen) return undefined;

    function closeViewMenuOnOutsidePointer(event: PointerEvent) {
      if (viewMenuRef.current?.contains(event.target as Node)) return;
      setViewMenuOpen(false);
    }

    document.addEventListener("pointerdown", closeViewMenuOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeViewMenuOnOutsidePointer);
  }, [viewMenuOpen]);

  useEffect(() => {
    if (!tabListOpen) return undefined;

    function closeTabListOnOutsidePointer(event: PointerEvent) {
      if (tabListMenuRef.current?.contains(event.target as Node)) return;
      setTabListOpen(false);
    }

    document.addEventListener("pointerdown", closeTabListOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeTabListOnOutsidePointer);
  }, [tabListOpen]);

  useEffect(() => () => {
    if (editorFocusTimerRef.current !== null) window.clearTimeout(editorFocusTimerRef.current);
    pendingEditorFocusTabIdRef.current = null;
    if (activeTabScrollFrameRef.current !== null) window.cancelAnimationFrame(activeTabScrollFrameRef.current);
  }, []);

  useEffect(() => {
    if (activeTabScrollFrameRef.current !== null) window.cancelAnimationFrame(activeTabScrollFrameRef.current);

    activeTabScrollFrameRef.current = window.requestAnimationFrame(() => {
      activeTabScrollFrameRef.current = null;
      const activeTabElement = Array.from(tabListRef.current?.querySelectorAll<HTMLElement>("[data-tab-id]") ?? [])
        .find((element) => element.dataset.tabId === activeTabId);
      activeTabElement?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });

    return () => {
      if (activeTabScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(activeTabScrollFrameRef.current);
        activeTabScrollFrameRef.current = null;
      }
    };
  }, [activeTabId, tabOrderKey]);

  useEffect(() => {
    if (!desktopProfileReady) return;

    const nextPreferences = { viewMode, theme, language, sidebarVisible, sidebarPage, autoSave, backup: backupPreferences, smartCopy, softSyntax, editorFontSize, editorLineWidth, editorDensity, tableHeightMode, tableMaxHeightVh, paneLayout };
    savePreferences(nextPreferences);
  }, [desktopProfileReady, viewMode, theme, language, sidebarVisible, sidebarPage, autoSave, backupPreferences, smartCopy, softSyntax, editorFontSize, editorLineWidth, editorDensity, tableHeightMode, tableMaxHeightVh, paneLayout]);

  useEffect(() => {
    paneLayoutRef.current = paneLayout;
    applyPaneLayoutCssVariables(paneLayout);
  }, [paneLayout]);

  useEffect(() => {
    if (!desktopProfileReady) return;

    const rootPath = loadWorkspaceRoot();
    if (!rootPath) return;
    void loadWorkspace(rootPath, { quiet: true });
  }, [desktopProfileReady]);

  useEffect(() => {
    documentStateRef.current = documentState;
  }, [documentState]);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  useEffect(() => {
    draftSnapshotsRef.current = draftSnapshots;
  }, [draftSnapshots]);

  useEffect(() => {
    manualPreviewSnapshotsRef.current = manualPreviewSnapshots;
  }, [manualPreviewSnapshots]);

  useEffect(() => {
    document.title = windowTitle;

    if (!isTauriRuntime()) return;

    void getCurrentWindow().setTitle(windowTitle).catch((error) => {
      console.warn(error);
    });
  }, [windowTitle]);

  useEffect(() => {
    droppedPathsHandlerRef.current = (paths: string[]) => {
      void openDroppedPaths(paths);
    };
  });

  useEffect(() => {
    if (!isTauriRuntime()) return undefined;

    let disposed = false;
    let unlisten: (() => void) | null = null;

    function updateDropOverlay(active: boolean) {
      setDropOverlayActive((current) => current === active ? current : active);
    }

    function handleDragDropEvent(event: { payload: DragDropEvent }) {
      if (event.payload.type === "enter" || event.payload.type === "over") {
        updateDropOverlay(true);
        return;
      }

      updateDropOverlay(false);
      if (event.payload.type === "drop") {
        droppedPathsHandlerRef.current(event.payload.paths);
      }
    }

    void getCurrentWebview().onDragDropEvent(handleDragDropEvent).then((nextUnlisten) => {
      if (disposed) {
        nextUnlisten();
        return;
      }
      unlisten = nextUnlisten;
    }).catch((error) => {
      console.warn(error);
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    setSelection(emptySelectionState);
  }, [activeTabId]);

  useEffect(() => {
    if (!isTauriRuntime()) return undefined;

    let cancelled = false;
    const initialLocalDraftRecord = loadDraftDocumentRecord();
    const initialLocalTabsRecord = loadDocumentTabsRecord();
    const initialLocalSnapshotsRecord = loadDraftSnapshotsRecord();

    type RecoveredTabReconciliation = {
      tabs: DocumentTab[];
      externalTabIds: string[];
      activeReview: ExternalDiskReviewState | null;
    };

    async function reconcileRecoveredTabs(
      recoveredTabStates: DocumentTab[],
      recoveredActiveTabId: string
    ): Promise<RecoveredTabReconciliation> {
      const reconciled = await Promise.all(recoveredTabStates.map(async (tab) => {
        const document = tab.document;
        const filePath = document.filePath;
        if (!filePath) return { tab, externalReview: null as ExternalDiskReviewState | null, hasExternalChange: false };

        try {
          const diskFile = await readMarkdownPath(filePath);
          if (!diskFile.fileStats) {
            return { tab, externalReview: null as ExternalDiskReviewState | null, hasExternalChange: true };
          }

          if (diskFile.markdown === document.markdown) {
            return {
              tab: {
                ...tab,
                document: {
                  ...document,
                  lastSavedMarkdown: diskFile.markdown,
                  lineEnding: diskFile.lineEnding,
                  fileStats: diskFile.fileStats
                }
              },
              externalReview: null as ExternalDiskReviewState | null,
              hasExternalChange: false
            };
          }

          if (diskFile.markdown === document.lastSavedMarkdown) {
            return {
              tab: {
                ...tab,
                document: {
                  ...document,
                  lineEnding: diskFile.lineEnding,
                  fileStats: diskFile.fileStats
                }
              },
              externalReview: null as ExternalDiskReviewState | null,
              hasExternalChange: false
            };
          }

          return {
            tab,
            externalReview: { tabId: tab.id, filePath, diskFile },
            hasExternalChange: true
          };
        } catch (error) {
          console.warn(error);
          return { tab, externalReview: null as ExternalDiskReviewState | null, hasExternalChange: true };
        }
      }));

      const externalReviews = reconciled.flatMap((entry) => entry.externalReview ? [entry.externalReview] : []);
      return {
        tabs: reconciled.map((entry) => entry.tab),
        externalTabIds: reconciled.filter((entry) => entry.hasExternalChange).map((entry) => entry.tab.id),
        activeReview: externalReviews.find((review) => review.tabId === recoveredActiveTabId) ?? null
      };
    }

    function restoreRecoveredExternalChangeState(reconciliation: RecoveredTabReconciliation) {
      clearExternalChangeState();
      for (const tabId of reconciliation.externalTabIds) setDocumentTabExternalChange(tabId, true);
      if (reconciliation.activeReview) {
        const review = reconciliation.activeReview;
        promptForExternalDiskReview(
          review.tabId,
          review.filePath,
          review.diskFile,
          review.diskFile.fileStats ?? null,
          "recovery-discard"
        );
      }
    }

    async function hydrateDesktopRecovery() {
      try {
        const [desktopTabsRecord, desktopDraftRecord, desktopSnapshotsRecord] = await Promise.all([
          loadDesktopDocumentTabsRecord(),
          loadDesktopDraftDocumentRecord(),
          loadDesktopDraftSnapshotsRecord()
        ]);

        if (cancelled) return;

        const currentSessionIsInitial = sameDocumentTabSession(
          tabsRef.current,
          activeTabIdRef.current,
          initialTabSessionRef.current.tabs,
          initialTabSessionRef.current.activeTabId
        );
        let recoveredTabs = false;

        if (
          initialLocalTabsRecord
          && (!desktopTabsRecord || desktopTabsRecord.savedAt <= initialLocalTabsRecord.savedAt)
          && currentSessionIsInitial
        ) {
          const localReconciliation = await reconcileRecoveredTabs(
            initialLocalTabsRecord.tabs,
            initialLocalTabsRecord.activeTabId
          );
          if (cancelled) return;
          if (!sameDocumentTabSession(
            tabsRef.current,
            activeTabIdRef.current,
            initialTabSessionRef.current.tabs,
            initialTabSessionRef.current.activeTabId
          )) return;

          restoreRecoveredExternalChangeState(localReconciliation);
          commitDocumentTabSession(localReconciliation.tabs, initialLocalTabsRecord.activeTabId, { focusEditor: false });
          recoveredTabs = true;
        }

        if (
          desktopTabsRecord
          && desktopTabsRecord.tabs.length > 0
          && (!initialLocalTabsRecord || desktopTabsRecord.savedAt > initialLocalTabsRecord.savedAt)
          && currentSessionIsInitial
        ) {
          const reconciliation = await reconcileRecoveredTabs(desktopTabsRecord.tabs, desktopTabsRecord.activeTabId);
          if (cancelled) return;
          if (!sameDocumentTabSession(
            tabsRef.current,
            activeTabIdRef.current,
            initialTabSessionRef.current.tabs,
            initialTabSessionRef.current.activeTabId
          )) return;

          restoreRecoveredExternalChangeState(reconciliation);
          commitDocumentTabSession(reconciliation.tabs, desktopTabsRecord.activeTabId, { focusEditor: false });
          saveDocumentTabsRecord(reconciliation.tabs, desktopTabsRecord.activeTabId);
          saveDraftDocument(activeDocumentFromSession({ tabs: reconciliation.tabs, activeTabId: desktopTabsRecord.activeTabId }) ?? reconciliation.tabs[0].document);
          clearManualPreviewSnapshot();
          showToast(desktopTabsRecord.tabs.length > 1 ? "Recovered desktop tabs" : "Recovered desktop draft");
          recoveredTabs = true;
        }

        if (
          !recoveredTabs
          && initialLocalDraftRecord
          && (!desktopDraftRecord || desktopDraftRecord.savedAt <= initialLocalDraftRecord.savedAt)
          && currentSessionIsInitial
          && sameMarkdownDocument(documentStateRef.current, initialDocumentRef.current)
        ) {
          const currentTab = tabsRef.current.find((tab) => tab.id === activeTabIdRef.current) ?? tabsRef.current[0];
          if (!currentTab) return;
          const localReconciliation = await reconcileRecoveredTabs([{
            ...currentTab,
            document: initialLocalDraftRecord.document
          }], currentTab.id);
          if (cancelled) return;
          restoreRecoveredExternalChangeState(localReconciliation);
          setDocumentState(localReconciliation.tabs[0].document);
          recoveredTabs = true;
        }

        if (
          !recoveredTabs
          && currentSessionIsInitial
          && desktopDraftRecord
          && (!initialLocalDraftRecord || desktopDraftRecord.savedAt > initialLocalDraftRecord.savedAt)
          && sameMarkdownDocument(documentStateRef.current, initialDocumentRef.current)
        ) {
          const currentTab = tabsRef.current.find((tab) => tab.id === activeTabIdRef.current) ?? tabsRef.current[0];
          if (!currentTab) return;
          const reconciliation = await reconcileRecoveredTabs([
            {
              ...currentTab,
              document: desktopDraftRecord.document
            }
          ], currentTab.id);
          if (cancelled) return;
          if (!sameDocumentTabSession(
            tabsRef.current,
            activeTabIdRef.current,
            initialTabSessionRef.current.tabs,
            initialTabSessionRef.current.activeTabId
          )) return;

          restoreRecoveredExternalChangeState(reconciliation);
          setDocumentState(reconciliation.tabs[0].document);
          clearManualPreviewSnapshot();
          showToast("Recovered desktop draft");
        }

        if (
          desktopSnapshotsRecord
          && (!initialLocalSnapshotsRecord || desktopSnapshotsRecord.savedAt > initialLocalSnapshotsRecord.savedAt)
        ) {
          draftSnapshotsRef.current = desktopSnapshotsRecord.snapshots;
          setDraftSnapshots(desktopSnapshotsRecord.snapshots);
          saveDraftSnapshots(desktopSnapshotsRecord.snapshots);
        }
      } catch (error) {
        console.warn(error);
      } finally {
        if (!cancelled) setDesktopRecoveryReady(true);
      }
    }

    void hydrateDesktopRecovery();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!desktopRuntime || !desktopRecoveryReady || initialLaunchFilesOpenedRef.current) return;

    initialLaunchFilesOpenedRef.current = true;
    void openInitialLaunchFiles();
  }, [desktopRuntime, desktopRecoveryReady]);

  useEffect(() => {
    if (!desktopRuntime) return undefined;

    let disposed = false;
    let unlisten: (() => void) | undefined;
    const receiveQueuedSecondaryInstancePaths = async () => {
      const paths = await takeSecondaryInstanceMarkdownPaths();
      if (disposed || paths.length === 0) return;

      if (desktopRecoveryReadyRef.current) {
        secondaryInstanceOpenHandlerRef.current?.(paths);
      } else {
        queuedSecondaryInstancePathsRef.current.push(paths);
      }
    };

    void listen<string[]>("open-markdown-files", () => {
      void receiveQueuedSecondaryInstancePaths().catch(console.warn);
    }).then((nextUnlisten) => {
      if (disposed) nextUnlisten();
      else {
        unlisten = nextUnlisten;
        void receiveQueuedSecondaryInstancePaths().catch(console.warn);
      }
    }).catch((error) => {
      console.warn(error);
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [desktopRuntime]);

  useEffect(() => {
    if (!desktopRecoveryReady || queuedSecondaryInstancePathsRef.current.length === 0) return;

    const queued = queuedSecondaryInstancePathsRef.current.splice(0);
    for (const paths of queued) secondaryInstanceOpenHandlerRef.current?.(paths);
  }, [desktopRecoveryReady]);

  useEffect(() => {
    if (!desktopRecoveryReady) return undefined;

    const elapsed = Date.now() - lastWorkRecoveryPersistedAtRef.current;
    const delay = elapsed >= WORK_RECOVERY_MAX_DELAY_MS ? 0 : WORK_RECOVERY_IDLE_MS;
    const timer = window.setTimeout(() => {
      const { tabs: currentTabs, activeTabId: currentActiveTabId } = currentTabSessionForRecovery();
      saveDocumentTabsRecord(currentTabs, currentActiveTabId);
      saveDraftDocument(activeDocumentFromSession({ tabs: currentTabs, activeTabId: currentActiveTabId }) ?? documentState);
      lastWorkRecoveryPersistedAtRef.current = Date.now();
    }, delay);

    return () => window.clearTimeout(timer);
  }, [desktopRecoveryReady, tabs, activeTabId, documentState]);

  useEffect(() => {
    if (!desktopRuntime || !desktopProfileReady) return undefined;
    if (!shouldQueueAutoSave(documentState, autoSave, externalChange)) return undefined;
    if (!shouldRetryAutoSave(autoSaveAttemptedMarkdownRef.current.get(activeTab.id), documentState.markdown)) return undefined;

    const tabId = activeTab.id;
    const markdown = documentState.markdown;
    const timer = window.setTimeout(() => {
      const tab = currentTabSessionForRecovery().tabs.find((candidate) => candidate.id === tabId);
      if (!tab || tab.document.markdown !== markdown) return;
      void autoSaveDocumentTab(tab);
    }, AUTO_SAVE_IDLE_MS);

    return () => window.clearTimeout(timer);
  }, [activeTab.id, autoSave, backupPreferences, desktopProfileReady, desktopRuntime, documentState, externalChange]);

  useEffect(() => {
    setShowAllBackups(false);
  }, [documentState.filePath]);

  useEffect(() => {
    let cancelled = false;

    async function loadBackups() {
      setBackupLoading(Boolean(documentState.filePath));
      try {
        const next = await listMarkdownBackups(documentState.filePath, backupPreferences);
        if (!cancelled) setBackups(next);
      } catch (error) {
        console.warn(error);
        if (!cancelled) setBackups([]);
      } finally {
        if (!cancelled) setBackupLoading(false);
      }
    }

    void loadBackups();
    return () => {
      cancelled = true;
    };
  }, [backupPreferences, documentState.filePath, documentState.lastBackupPath]);

  useEffect(() => {
    if (!desktopRuntime || (sidebarPage !== "recovery" && !historyManagerOpen)) return undefined;
    let cancelled = false;

    function loadHistories(showLoading = false) {
      if (showLoading) setBackupHistoriesLoading(true);
      void listMarkdownBackupHistories(backupPreferences, historyKnownSourcePaths)
        .then((histories) => {
          if (!cancelled) setBackupHistories(histories);
        })
        .catch((error) => {
          console.warn(error);
          if (!cancelled) setBackupHistories([]);
        })
        .finally(() => {
          if (!cancelled) setBackupHistoriesLoading(false);
        });
    }

    loadHistories(historyManagerOpen);
    const refreshTimer = window.setInterval(() => loadHistories(false), BACKUP_HISTORY_REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
    };
  }, [backupPreferences, desktopRuntime, documentState.lastBackupPath, externalChange, historyKnownSourcePaths, historyManagerOpen, sidebarPage]);

  useEffect(() => {
    if (!historyManagerOpen || !desktopRuntime) {
      setHistorySourceStatesLoading(false);
      return undefined;
    }

    const paths = new Map<string, string>();
    for (const snapshot of draftSnapshots) {
      if (!snapshot.filePath) continue;
      const key = localPathKey(snapshot.filePath);
      if (!paths.has(key)) paths.set(key, snapshot.filePath);
    }
    if (paths.size === 0) {
      setHistorySourceStates(new Map());
      setHistorySourceStatesLoading(false);
      return undefined;
    }

    let cancelled = false;
    setHistorySourceStatesLoading(true);
    void Promise.all([...paths].map(async ([key, path]) => {
      try {
        const stats = await existingMarkdownFileStats(path);
        return [key, stats ? "available" : "missing"] as const;
      } catch (error) {
        console.warn(error);
        return [key, "unknown"] as const;
      }
    })).then((entries) => {
      if (!cancelled) setHistorySourceStates(new Map(entries));
    }).finally(() => {
      if (!cancelled) setHistorySourceStatesLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [desktopRuntime, draftSnapshots, historyManagerOpen]);

  useEffect(() => {
    if (!desktopRuntime || !desktopProfileReady) return undefined;
    let cancelled = false;

    void markdownBackupStorageUsage(backupPreferences)
      .then((usage) => {
        if (cancelled || !usage) return;
        if (!usage.warning) {
          backupUsageWarningShownRef.current = false;
          return;
        }
        if (backupUsageWarningShownRef.current) return;
        backupUsageWarningShownRef.current = true;
        showToast("Version history storage is over 80% full; open Version History to review it");
      })
      .catch((error) => console.warn(error));

    return () => {
      cancelled = true;
    };
  }, [backupPreferences, desktopProfileReady, desktopRuntime, documentState.lastBackupPath]);

  useEffect(() => {
    const path = documentState.filePath;
    const knownStats = documentState.fileStats ?? null;
    const lastSavedMarkdown = documentState.lastSavedMarkdown;
    const tabId = activeTab.id;

    if (!path) {
      setDocumentTabExternalChange(tabId, false);
      return undefined;
    }
    if (!knownStats) {
      setDocumentTabExternalChange(tabId, true);
      return undefined;
    }

    const diskPath = path;
    let cancelled = false;
    let lastReviewedContentChangeStatsKey: string | null = null;

    async function checkDiskStats() {
      try {
        const currentStats = await readMarkdownFileStats(path);
        if (!diskNeedsReview(knownStats, currentStats)) {
          if (!cancelled) setDocumentTabExternalChange(tabId, false);
          return;
        }
        if (!currentStats) {
          if (!cancelled) setDocumentTabExternalChange(tabId, true);
          return;
        }

        const currentStatsKey = `${currentStats.modifiedMs}:${currentStats.size}`;
        if (currentStatsKey === lastReviewedContentChangeStatsKey) {
          if (!cancelled) setDocumentTabExternalChange(tabId, true);
          return;
        }

        const diskFile = await readMarkdownPath(diskPath);
        const changeKind = diskChangeKind(knownStats, currentStats, lastSavedMarkdown, diskFile.markdown);
        if (cancelled) return;

        if (changeKind === "content") {
          lastReviewedContentChangeStatsKey = currentStatsKey;
          setDocumentTabExternalChange(tabId, true);
          promptForExternalDiskReview(tabId, diskPath, diskFile, diskFile.fileStats ?? currentStats);
          return;
        }

        updateDocumentTab(tabId, (current) => ({
          ...current,
          fileStats: diskFile.fileStats ?? currentStats
        }));
        setDocumentTabExternalChange(tabId, false);
      } catch (error) {
        console.warn(error);
        if (!cancelled) setDocumentTabExternalChange(tabId, true);
      }
    }

    const firstCheck = window.setTimeout(checkDiskStats, 1200);
    const interval = window.setInterval(checkDiskStats, 5000);
    return () => {
      cancelled = true;
      window.clearTimeout(firstCheck);
      window.clearInterval(interval);
    };
  }, [activeTab.id, documentState.filePath, documentState.lastSavedMarkdown, documentState.fileStats?.modifiedMs, documentState.fileStats?.size]);

  useEffect(() => {
    if (!desktopRuntime || !desktopRecoveryReady) return undefined;

    let cancelled = false;
    let running = false;

    async function checkCandidate(candidate: DiskReviewCandidate) {
      const currentTab = currentTabSessionForRecovery().tabs.find((tab) => tab.id === candidate.tabId);
      if (!tabMatchesDiskReviewCandidate(currentTab, candidate)) return;

      if (!candidate.knownStats) {
        setDocumentTabExternalChange(candidate.tabId, true);
        return;
      }

      try {
        const currentStats = await readMarkdownFileStats(candidate.filePath);
        if (cancelled) return;

        const freshTab = currentTabSessionForRecovery().tabs.find((tab) => tab.id === candidate.tabId);
        if (!tabMatchesDiskReviewCandidate(freshTab, candidate)) return;

        if (!diskNeedsReview(candidate.knownStats, currentStats)) {
          setDocumentTabExternalChange(candidate.tabId, false);
          return;
        }

        if (!currentStats) {
          setDocumentTabExternalChange(candidate.tabId, true);
          return;
        }

        const diskFile = await readMarkdownPath(candidate.filePath);
        if (cancelled) return;

        const newestTab = currentTabSessionForRecovery().tabs.find((tab) => tab.id === candidate.tabId);
        if (!tabMatchesDiskReviewCandidate(newestTab, candidate)) return;

        const changeKind = diskChangeKind(candidate.knownStats, currentStats, candidate.lastSavedMarkdown, diskFile.markdown);
        if (changeKind === "content") {
          setDocumentTabExternalChange(candidate.tabId, true);
          return;
        }

        updateDocumentTab(candidate.tabId, (current) => ({
          ...current,
          fileStats: diskFile.fileStats ?? currentStats
        }));
        setDocumentTabExternalChange(candidate.tabId, false);
      } catch (error) {
        console.warn(error);
        if (!cancelled) setDocumentTabExternalChange(candidate.tabId, true);
      }
    }

    async function checkInactiveDiskTabs() {
      if (running) return;
      running = true;
      try {
        const { tabs: currentTabs, activeTabId: currentActiveTabId } = currentTabSessionForRecovery();
        const startIndex = inactiveDiskReviewCursorRef.current;
        const candidates = inactiveDiskReviewCandidates(currentTabs, currentActiveTabId, 24, startIndex);
        inactiveDiskReviewCursorRef.current = currentTabs.length > 0
          ? (startIndex + Math.max(1, candidates.length)) % currentTabs.length
          : 0;
        for (const candidate of candidates) {
          if (cancelled) return;
          await checkCandidate(candidate);
        }
      } finally {
        running = false;
      }
    }

    const firstCheck = window.setTimeout(checkInactiveDiskTabs, 2500);
    const interval = window.setInterval(checkInactiveDiskTabs, 15000);
    return () => {
      cancelled = true;
      window.clearTimeout(firstCheck);
      window.clearInterval(interval);
    };
  }, [desktopRuntime, desktopRecoveryReady]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (desktopRecoveryReady) persistSynchronousUnloadRecovery();
      const dirtyDocumentCount = dirtyDocuments(currentTabSessionForRecovery().tabs).length;
      if (!shouldBlockBrowserUnload(desktopRuntime, dirtyDocumentCount)) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [desktopRecoveryReady, desktopRuntime]);

  useEffect(() => {
    if (!isTauriRuntime()) return undefined;

    let disposed = false;
    let unlisten: (() => void) | null = null;
    const appWindow = getCurrentWindow();

    void appWindow.onCloseRequested(async (event) => {
      if (windowCloseApprovedRef.current) return;
      event.preventDefault();
      if (windowCloseInProgressRef.current) return;

      windowCloseInProgressRef.current = true;
      try {
        const dirtyTabs = dirtyDocuments(currentTabSessionForRecovery().tabs);
        const confirmed = dirtyTabs.length === 0 || await requestConfirmation({
          title: "Close NyaMarkdownor?",
          message: dirtyTabs.length === 1
            ? "One tab has unsaved changes. Its current working state will be restored the next time NyaMarkdownor starts."
            : `${dirtyTabs.length} tabs have unsaved changes. Their current working states will be restored the next time NyaMarkdownor starts.`,
          confirmLabel: "Close window",
          cancelLabel: "Keep editing",
          tone: "danger"
        });

        if (!confirmed) {
          showToast("Close canceled");
          return;
        }

        const closeResult = await closeWindowAfterRecovery({
          persistRecovery: persistWindowCloseRecovery,
          approveClose: () => {
            windowCloseApprovedRef.current = true;
          },
          destroy: () => appWindow.destroy(),
          close: () => appWindow.close()
        });
        if (closeResult.recoveryError) console.warn(closeResult.recoveryError);
        if (closeResult.destroyError) console.warn(closeResult.destroyError);
      } catch (error) {
        windowCloseApprovedRef.current = false;
        console.warn(error);
        showToast("Window close was blocked");
      } finally {
        windowCloseInProgressRef.current = false;
      }
    }).then((nextUnlisten) => {
      if (disposed) {
        nextUnlisten();
        return;
      }
      unlisten = nextUnlisten;
    }).catch((error) => {
      console.warn(error);
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => () => {
    stopPaneResize(false);
    if (scrollSyncReleaseTimerRef.current !== null) window.clearTimeout(scrollSyncReleaseTimerRef.current);
    if (editorScrollFrameRef.current !== null) window.cancelAnimationFrame(editorScrollFrameRef.current);
    if (previewScrollFrameRef.current !== null) window.cancelAnimationFrame(previewScrollFrameRef.current);
  }, []);

  function showToast(message: string) {
    setToast(translateUiText(locale, message));
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 1800);
  }

  async function checkApplicationUpdates(interactive: boolean) {
    if (updateInstallInFlightRef.current) return;
    setApplicationUpdate({ status: "checking" });
    try {
      const result = await checkForApplicationUpdates();
      setApplicationUpdate(result);
      if (!interactive) return;
      if (result.status === "upToDate") {
        showToast("NyaMarkdownor is up to date");
      } else if (result.status === "unsupported") {
        if (result.reason === "notInstalled") showToast("Automatic updates are unavailable for portable copies");
        else if (result.reason === "developmentBuild") showToast("Automatic updates are unavailable in development builds");
        else showToast("Automatic updates are unavailable on this platform");
      }
    } catch (error) {
      console.warn("Could not check for application updates", error);
      const message = messageFromError(error);
      setApplicationUpdate({ status: "error", message });
      if (interactive) showToast(t("Update check failed"));
    }
  }

  async function promptApplicationUpdate(update: Extract<UpdateCheckResult, { status: "available" }>) {
    const confirmed = await requestConfirmation({
      title: t("NyaMarkdownor {version} is available", { version: update.version }),
      message: t("The installer will be downloaded from GitHub Releases and verified. NyaMarkdownor will save the current workspace, start the installer, and close."),
      confirmLabel: t("Download and install"),
      cancelLabel: t("Later"),
      tone: "default"
    });
    if (confirmed) await installApplicationUpdate(update.version);
  }

  async function installApplicationUpdate(version: string) {
    if (updateInstallInFlightRef.current) return;
    updateInstallInFlightRef.current = true;
    setApplicationUpdate({ status: "installing", version });
    try {
      await persistWindowCloseRecovery();
      await downloadAndInstallApplicationUpdate(version);
    } catch (error) {
      console.warn("Could not install application update", error);
      setApplicationUpdate({ status: "error", message: messageFromError(error) });
      showToast("Update could not be installed");
    } finally {
      updateInstallInFlightRef.current = false;
    }
  }

  async function openApplicationReleasePage() {
    const repository = buildInfo.updateRepository.trim();
    if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(repository)) {
      showToast("Release page could not be opened");
      return;
    }
    try {
      const result = await openExternalLink(`https://github.com/${repository}/releases/latest`);
      if (result !== "opened") showToast("Release page could not be opened");
    } catch (error) {
      console.warn("Could not open GitHub Releases", error);
      showToast("Release page could not be opened");
    }
  }

  function messageFromError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  function fileWriteFailureLabel(error: unknown, fallback: string): string {
    const message = messageFromError(error);
    if (/file changed on disk before save/i.test(message)) return "File changed while saving; review disk version";
    if (/destination folder does not exist/i.test(message)) return "Destination folder does not exist";
    if (/destination parent is not a folder/i.test(message)) return "Destination parent is not a folder";
    if (/permission denied|access is denied/i.test(message)) return "Permission denied while writing file";
    if (/exceeding the configured maximum backup file size/i.test(message)) return "File exceeds the backup size limit; adjust Backup settings";
    if (/backup storage limits cannot accommodate/i.test(message)) return "Backup storage limit reached; adjust Backup settings";
    if (/failed to prepare active backup folder|active backup path is not a folder/i.test(message)) return "Backup folder is unavailable; choose another location";
    return fallback;
  }

  function isPersistentBackupFailure(error: unknown): boolean {
    return /exceeding the configured maximum backup file size|backup storage limits cannot accommodate|failed to prepare active backup folder|active backup path is not a folder/i.test(messageFromError(error));
  }

  function fileOpenFailureLabel(error: unknown, fallback: string): string {
    const message = messageFromError(error);
    if (/requires the desktop app|file system access/i.test(message)) return message;
    if (/permission denied|access is denied/i.test(message)) return "Permission denied while opening file";
    if (/failed to decode|not valid utf-8|utf-16|legacy/i.test(message)) return message;
    return fallback;
  }

  function requestConfirmation(options: Omit<ConfirmationState, "id">): Promise<boolean> {
    confirmationResolverRef.current?.(false);

    return new Promise((resolve) => {
      confirmationResolverRef.current = resolve;
      setConfirmation({
        ...options,
        id: Date.now()
      });
    });
  }

  function settleConfirmation(accepted: boolean) {
    const resolve = confirmationResolverRef.current;
    confirmationResolverRef.current = null;
    setConfirmation(null);
    resolve?.(accepted);
  }

  function runConfirmationAlternate() {
    const action = confirmation?.onAlternate;
    settleConfirmation(false);
    action?.();
  }

  function openVersionHistoryManagement() {
    setHistoryManagerOpen(true);
  }

  async function requestHistoryCleanup(title: string, message: string): Promise<void> {
    await requestConfirmation({
      title,
      message,
      confirmLabel: "Open Version History",
      cancelLabel: "Cancel",
      tone: "danger"
    }).then((openHistory) => {
      if (openHistory) openVersionHistoryManagement();
    });
  }

  function focusEditorSoon() {
    if (editorFocusTimerRef.current !== null) window.clearTimeout(editorFocusTimerRef.current);
    const targetTabId = activeTabIdRef.current;
    pendingEditorFocusTabIdRef.current = targetTabId;
    let remainingAttempts = 20;

    const attemptFocus = () => {
      editorFocusTimerRef.current = null;
      if (pendingEditorFocusTabIdRef.current !== targetTabId || activeTabIdRef.current !== targetTabId) return;

      if (viewModeRef.current === "preview") {
        const preview = previewRef.current;
        if (preview) {
          preview.focus();
          pendingEditorFocusTabIdRef.current = null;
          return;
        }
      }

      if (viewModeRef.current === "wysiwyg") {
        if (richEditorRef.current) {
          richEditorRef.current.focus();
          pendingEditorFocusTabIdRef.current = null;
          return;
        }
      } else if (shouldFocusEditorView(editorViewTabIdRef.current, activeTabIdRef.current, viewModeRef.current)) {
        currentActiveEditorView()?.focus();
        pendingEditorFocusTabIdRef.current = null;
        return;
      }

      remainingAttempts -= 1;
      if (remainingAttempts > 0) {
        editorFocusTimerRef.current = window.setTimeout(attemptFocus, 25);
      } else {
        pendingEditorFocusTabIdRef.current = null;
      }
    };

    editorFocusTimerRef.current = window.setTimeout(attemptFocus, 0);
  }

  function activateDocumentTab(tabId: string, options: { focusEditor?: boolean } = {}) {
    richEditorRef.current?.flushMarkdownSync();
    activeTabIdRef.current = tabId;
    setActiveTabId(tabId);
    if (options.focusEditor) focusEditorSoon();
  }

  function switchDocumentTab(tabId: string) {
    if (tabId === activeTab.id) {
      focusEditorSoon();
      return;
    }
    activateDocumentTab(tabId, { focusEditor: true });
  }

  function scrollTabList(direction: -1 | 1) {
    tabListRef.current?.scrollBy({
      left: direction * Math.max(160, Math.floor(tabListRef.current.clientWidth * 0.72)),
      behavior: "smooth"
    });
  }

  function moveDocumentTab(tabId: string, direction: -1 | 1) {
    const currentTabs = tabsRef.current;
    const currentIndex = currentTabs.findIndex((tab) => tab.id === tabId);
    const targetTab = currentTabs[currentIndex + direction];
    if (currentIndex < 0 || !targetTab) return;

    const nextTabs = reorderDocumentTabs(currentTabs, tabId, targetTab.id, direction < 0 ? "before" : "after");
    if (sameDocumentTabOrder(currentTabs, nextTabs)) return;

    setDocumentTabs(nextTabs);
    showToast("Tab moved");
  }

  function moveActiveDocumentTab(direction: -1 | 1) {
    moveDocumentTab(activeTabIdRef.current, direction);
  }

  function handleTabDragStart(event: ReactDragEvent<HTMLDivElement>, tabId: string) {
    if (tabsRef.current.length <= 1) {
      event.preventDefault();
      return;
    }

    setDraggedTabId(tabId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(TAB_DRAG_MIME, tabId);
  }

  function handleTabDragOver(event: ReactDragEvent<HTMLDivElement>, targetTabId: string) {
    if (!isDocumentTabDrag(event)) return;

    const sourceTabId = draggedTabId ?? event.dataTransfer.getData(TAB_DRAG_MIME);
    if (!sourceTabId || sourceTabId === targetTabId) return;

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";

    const position = tabDropPositionForClientX(event.currentTarget, event.clientX);
    setTabDropTarget((current) => (
      current?.tabId === targetTabId && current.position === position
        ? current
        : { tabId: targetTabId, position }
    ));
  }

  function handleTabDrop(event: ReactDragEvent<HTMLDivElement>, targetTabId: string) {
    if (!isDocumentTabDrag(event)) return;

    event.preventDefault();
    event.stopPropagation();

    const sourceTabId = draggedTabId ?? event.dataTransfer.getData(TAB_DRAG_MIME);
    const position = tabDropPositionForClientX(event.currentTarget, event.clientX);
    clearTabDragState();

    if (!sourceTabId || sourceTabId === targetTabId) return;

    const currentTabs = tabsRef.current;
    const nextTabs = reorderDocumentTabs(currentTabs, sourceTabId, targetTabId, position);
    if (sameDocumentTabOrder(currentTabs, nextTabs)) return;

    setDocumentTabs(nextTabs);
    showToast("Tab moved");
  }

  function handleTabDragEnd() {
    clearTabDragState();
  }

  function clearTabDragState() {
    setDraggedTabId(null);
    setTabDropTarget(null);
  }

  function isDocumentTabDrag(event: ReactDragEvent<HTMLElement>): boolean {
    return Boolean(draggedTabId) || Array.from(event.dataTransfer.types).includes(TAB_DRAG_MIME);
  }

  function switchRelativeDocumentTab(direction: -1 | 1) {
    const nextId = nextDocumentTabId(tabsRef.current.map((tab) => tab.id), activeTabIdRef.current, direction);
    if (nextId) activateDocumentTab(nextId, { focusEditor: true });
  }

  function switchDocumentTabByShortcutIndex(index: number) {
    const nextId = documentTabIdAtShortcutIndex(tabsRef.current.map((tab) => tab.id), index);
    if (nextId) activateDocumentTab(nextId, { focusEditor: true });
  }

  function runTabNavigationShortcut(shortcut: TabNavigationShortcut) {
    if (shortcut.type === "next") {
      switchRelativeDocumentTab(1);
      return;
    }

    if (shortcut.type === "previous") {
      switchRelativeDocumentTab(-1);
      return;
    }

    switchDocumentTabByShortcutIndex(shortcut.index);
  }

  function currentTabsForImmediateDocumentOpen(): DocumentTab[] {
    const currentTabs = tabsRef.current.length ? tabsRef.current : tabs;
    return documentTabsWithMountedEditorState(currentTabs);
  }

  function commitDocumentTabSession(
    nextTabs: DocumentTab[],
    nextActiveTabId: string,
    options: { focusEditor?: boolean } = { focusEditor: true }
  ) {
    const committedTabs = nextTabs.length ? nextTabs : [createDocumentTab(createDefaultDocument())];
    const committedActiveTabId = committedTabs.some((tab) => tab.id === nextActiveTabId)
      ? nextActiveTabId
      : committedTabs[0].id;

    pruneManualPreviewSnapshotsToTabs(committedTabs);
    pruneExternalChangeState(committedTabs);
    setDocumentTabs(committedTabs);
    activateDocumentTab(committedActiveTabId, { focusEditor: options.focusEditor });
  }

  function addDocumentTab(document: MarkdownDocument): DocumentTab {
    const currentTabs = currentTabsForImmediateDocumentOpen();
    const replaceableDraftId = document.filePath
      ? replaceableDraftTabId(currentTabs, activeTabIdRef.current, [LEGACY_SAMPLE_MARKDOWN])
      : null;
    const existing = document.filePath ? currentTabs.find((tab) => sameLocalPath(tab.document.filePath, document.filePath)) : undefined;

    if (existing) {
      if (replaceableDraftId && replaceableDraftId !== existing.id) {
        forgetEditorStateSnapshot(replaceableDraftId);
        commitDocumentTabSession(currentTabs.filter((tab) => tab.id !== replaceableDraftId), existing.id);
        return existing;
      }

      commitDocumentTabSession(currentTabs, existing.id);
      return existing;
    }

    const nextTab = createDocumentTab(document);
    if (replaceableDraftId) {
      forgetEditorStateSnapshot(replaceableDraftId);
      commitDocumentTabSession(currentTabs.map((tab) => tab.id === replaceableDraftId ? nextTab : tab), nextTab.id);
      return nextTab;
    }

    commitDocumentTabSession([...currentTabs, nextTab], nextTab.id);
    return nextTab;
  }

  function documentFromOpenedFile(opened: OpenedFile): MarkdownDocument {
    return {
      fileName: opened.name,
      filePath: opened.path,
      markdown: opened.markdown,
      lastSavedMarkdown: opened.markdown,
      lineEnding: opened.lineEnding,
      lastBackupPath: null,
      fileStats: opened.fileStats ?? null
    };
  }

  function replaceDocumentTabWithDiskVersion(
    currentTabs: DocumentTab[],
    existing: DocumentTab,
    document: MarkdownDocument
  ): DocumentTab {
    const replaceableDraftId = document.filePath
      ? replaceableDraftTabId(currentTabs, activeTabIdRef.current, [LEGACY_SAMPLE_MARKDOWN])
      : null;
    const nextTab: DocumentTab = {
      ...existing,
      document,
      editorStateSnapshot: undefined
    };
    let nextTabs = currentTabs.map((tab) => tab.id === existing.id ? nextTab : tab);

    forgetEditorStateSnapshot(existing.id);
    clearManualPreviewSnapshot(existing.id);
    setDocumentTabExternalChange(existing.id, false);

    if (replaceableDraftId && replaceableDraftId !== existing.id) {
      forgetEditorStateSnapshot(replaceableDraftId);
      nextTabs = nextTabs.filter((tab) => tab.id !== replaceableDraftId);
    }

    commitDocumentTabSession(nextTabs, existing.id);
    return nextTab;
  }

  function openFileInTab(opened: OpenedFile): OpenFileInTabResult {
    const document = documentFromOpenedFile(opened);
    const currentTabs = currentTabsForImmediateDocumentOpen();
    const existing = document.filePath ? currentTabs.find((tab) => sameLocalPath(tab.document.filePath, document.filePath)) : undefined;
    const duplicateAction = duplicatePathOpenAction(existing?.document, { path: document.filePath, markdown: document.markdown });

    if (existing && duplicateAction === "open-disk-version") {
      return {
        tab: openDiskVersionInDraftTab(opened),
        action: "opened-disk-version"
      };
    }

    if (existing && duplicateAction === "replace-existing") {
      return {
        tab: replaceDocumentTabWithDiskVersion(currentTabs, existing, document),
        action: "refreshed"
      };
    }

    return {
      tab: addDocumentTab(document),
      action: existing ? "switched" : "opened"
    };
  }

  function openDiskVersionInDraftTab(opened: OpenedFile): DocumentTab {
    return addDocumentTab({
      fileName: suggestedMarkdownDiskVersionName(opened.name),
      filePath: null,
      markdown: opened.markdown,
      lastSavedMarkdown: opened.markdown,
      lineEnding: opened.lineEnding,
      lastBackupPath: null,
      fileStats: null
    });
  }

  function openFileInTabToast(opened: OpenedFile, result: OpenFileInTabResult): string {
    switch (result.action) {
      case "opened":
        return openedFileHasLocalBinding(opened) ? `Opened ${opened.name}` : `Imported ${opened.name} as draft`;
      case "switched":
        return `Switched to ${opened.name}`;
      case "refreshed":
        return `Reloaded ${opened.name} from disk`;
      case "opened-disk-version":
        return `Opened disk version of ${opened.name}`;
    }
  }

  async function closeDocumentTab(tabId: string) {
    const { tabs: currentTabs } = currentTabSessionForRecovery();
    const tab = currentTabs.find((candidate) => candidate.id === tabId);
    if (!tab) return;

    const tabDirty = isDocumentDirty(tab.document);
    if (tabDirty && !await requestConfirmation({
      title: `Close ${displayMarkdownDocumentName(tab.document)}?`,
      message: "This tab has unsaved changes. NyaMarkdownor will create a safety checkpoint before closing it.",
      confirmLabel: "Close tab",
      cancelLabel: "Keep tab",
      tone: "danger"
    })) return;

    await closeDocumentTabsById(new Set([tabId]), "Tab closed");
  }

  async function closeOtherDocumentTabs() {
    const { tabs: currentTabs, activeTabId: currentActiveTabId } = currentTabSessionForRecovery();
    const targetIds = new Set(currentTabs.filter((tab) => tab.id !== currentActiveTabId).map((tab) => tab.id));
    await closeDocumentTabsWithConfirmation(targetIds, {
      title: "Close other tabs?",
      message: "Dirty tabs will get safety checkpoints before closing.",
      confirmLabel: "Close other tabs",
      doneLabel: "Other tabs closed",
      emptyLabel: "No other tabs to close",
      skipConfirmationWhenClean: true
    });
  }

  async function closeDocumentTabsToRight() {
    const { tabs: currentTabs, activeTabId: currentActiveTabId } = currentTabSessionForRecovery();
    const targetIds = new Set(documentTabIdsAfter(currentTabs.map((tab) => tab.id), currentActiveTabId));
    await closeDocumentTabsWithConfirmation(targetIds, {
      title: "Close tabs to the right?",
      message: "Dirty tabs to the right will get safety checkpoints before closing.",
      confirmLabel: "Close right tabs",
      doneLabel: "Right tabs closed",
      emptyLabel: "No tabs to the right",
      skipConfirmationWhenClean: true
    });
  }

  async function closeSavedDocumentTabs() {
    const { tabs: currentTabs } = currentTabSessionForRecovery();
    const targetIds = new Set(currentTabs.filter((tab) => !isDocumentDirty(tab.document)).map((tab) => tab.id));
    await closeDocumentTabsWithConfirmation(targetIds, {
      title: "Close saved tabs?",
      message: "This will close tabs that have no unsaved changes. Dirty tabs will stay open.",
      confirmLabel: "Close saved tabs",
      doneLabel: "Saved tabs closed",
      emptyLabel: "No saved tabs to close",
      skipConfirmationWhenClean: true
    });
  }

  async function closeAllDocumentTabs() {
    const { tabs: currentTabs } = currentTabSessionForRecovery();
    await closeDocumentTabsWithConfirmation(new Set(currentTabs.map((tab) => tab.id)), {
      title: "Close all tabs?",
      message: "Dirty tabs will get safety checkpoints before closing. A new blank document will open afterward.",
      confirmLabel: "Close all tabs",
      doneLabel: "All tabs closed",
      emptyLabel: "No tabs to close",
      skipConfirmationWhenClean: true
    });
  }

  async function closeDocumentTabsWithConfirmation(
    targetIds: Set<string>,
    options: {
      title: string;
      message: string;
      confirmLabel: string;
      doneLabel: string;
      emptyLabel: string;
      skipConfirmationWhenClean?: boolean;
    }
  ) {
    const { tabs: currentTabs } = currentTabSessionForRecovery();
    const targetTabs = currentTabs.filter((tab) => targetIds.has(tab.id));
    if (!targetTabs.length) {
      showToast(options.emptyLabel);
      return;
    }

    const dirtyTargets = targetTabs.filter((tab) => isDocumentDirty(tab.document));
    if (
      (!options.skipConfirmationWhenClean || dirtyTargets.length > 0)
      && !await requestConfirmation({
        title: options.title,
        message: dirtyTargets.length > 0
          ? `${options.message} ${dirtyTargets.length} dirty ${dirtyTargets.length === 1 ? "tab" : "tabs"} will get safety checkpoints.`
          : options.message,
        confirmLabel: options.confirmLabel,
        cancelLabel: "Keep tabs",
        tone: dirtyTargets.length > 0 ? "danger" : "default"
      })
    ) return;

    await closeDocumentTabsById(targetIds, options.doneLabel);
  }

  async function closeDocumentTabsById(targetIds: Set<string>, toastLabel: string) {
    const { tabs: currentTabs, activeTabId: currentActiveTabId } = currentTabSessionForRecovery();
    const targetTabs = currentTabs.filter((tab) => targetIds.has(tab.id));
    if (!targetTabs.length) return;

    for (const target of targetTabs) {
      if (!isDocumentDirty(target.document)) continue;
      if (await preserveDocumentSafetyCheckpoint(target.document, "close", target.id)) continue;
      await requestHistoryCleanup(
        "Close canceled",
        "The required safety checkpoint could not be created. Open Version History to free space, then try again."
      );
      return;
    }
    setClosedTabs((current) => rememberClosedDocumentTabs(current, targetTabs));
    for (const tab of targetTabs) forgetEditorStateSnapshot(tab.id);

    const tabIds = currentTabs.map((tab) => tab.id);
    const nextTabIds = remainingDocumentTabIds(tabIds, targetIds);
    if (!nextTabIds.length) {
      const nextTab = createDocumentTab(createDefaultDocument(""));
      commitDocumentTabSession([nextTab], nextTab.id, { focusEditor: true });
      showToast(`${toastLabel}; new draft opened`);
      return;
    }

    const nextActiveTabId = activeDocumentTabIdAfterClosing(tabIds, currentActiveTabId, targetIds) ?? nextTabIds[0];
    commitDocumentTabSession(currentTabs.filter((tab) => nextTabIds.includes(tab.id)), nextActiveTabId, { focusEditor: true });
    showToast(toastLabel);
  }

  function reopenClosedDocumentTab() {
    const closedTab = closedTabs[0];
    if (!closedTab) {
      showToast("No closed tab to reopen");
      return;
    }

    const currentTabs = currentTabsForImmediateDocumentOpen();
    const existing = closedTab.document.filePath
      ? currentTabs.find((tab) => sameLocalPath(tab.document.filePath, closedTab.document.filePath))
      : undefined;

    if (existing) {
      setClosedTabs(closedTabs.slice(1));
      activateDocumentTab(existing.id, { focusEditor: true });
      showToast(`Switched to ${displayMarkdownDocumentName(existing.document)}`);
      return;
    }

    const reopenedTab = currentTabs.some((tab) => tab.id === closedTab.id)
      ? { ...closedTab, id: createTabId() }
      : closedTab;
    if (reopenedTab.editorStateSnapshot) {
      editorStateSnapshotsRef.current.set(reopenedTab.id, reopenedTab.editorStateSnapshot);
    }

    commitDocumentTabSession([...currentTabs, reopenedTab], reopenedTab.id, { focusEditor: true });
    setClosedTabs(closedTabs.slice(1));
    showToast(`Reopened ${displayMarkdownDocumentName(reopenedTab.document)}`);
  }

  function releaseScrollSyncSoon(source: "editor" | "preview") {
    if (scrollSyncReleaseTimerRef.current !== null) window.clearTimeout(scrollSyncReleaseTimerRef.current);
    scrollSyncReleaseTimerRef.current = window.setTimeout(() => {
      if (scrollSyncSourceRef.current === source) scrollSyncSourceRef.current = null;
    }, 120);
  }

  function handleEditorScrollProgress(progress: number) {
    sourceScrollProgressRef.current.set(activeTabIdRef.current, progress);
    richScrollProgressRef.current.set(activeTabIdRef.current, progress);
    if (viewModeRef.current !== "split" || scrollSyncSourceRef.current === "preview") return;

    const preview = previewRef.current;
    if (!preview) return;

    scrollSyncSourceRef.current = "editor";
    if (previewScrollFrameRef.current !== null) window.cancelAnimationFrame(previewScrollFrameRef.current);
    previewScrollFrameRef.current = window.requestAnimationFrame(() => {
      previewScrollFrameRef.current = null;
      setScrollProgress(preview, progress);
      releaseScrollSyncSoon("editor");
    });
  }

  function handlePreviewScroll(event: ReactUIEvent<HTMLElement>) {
    if (viewModeRef.current !== "split" || scrollSyncSourceRef.current === "editor") return;

    const view = currentActiveEditorView();
    if (!view) return;

    const progress = getScrollProgress(event.currentTarget);
    scrollSyncSourceRef.current = "preview";
    if (editorScrollFrameRef.current !== null) window.cancelAnimationFrame(editorScrollFrameRef.current);
    editorScrollFrameRef.current = window.requestAnimationFrame(() => {
      editorScrollFrameRef.current = null;
      setScrollProgress(view.scrollDOM, progress);
      releaseScrollSyncSoon("preview");
    });
  }

  function handlePreviewCopy(event: ReactClipboardEvent<HTMLElement>) {
    const payload = previewSelectionToClipboardPayload(event.currentTarget, window.getSelection());
    if (!payload) return;

    const copied = writeClipboardEventData(event.nativeEvent, payload);
    if (!copied) return;

    event.preventDefault();
    showToast(copied === "plain" ? "Copied preview text" : "Copied preview selection");
  }

  function handlePreviewKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== "a") return;

    const selection = window.getSelection();
    if (!selection) return;

    const range = document.createRange();
    range.selectNodeContents(event.currentTarget);
    selection.removeAllRanges();
    selection.addRange(range);
    event.preventDefault();
  }

  function handlePreviewClick(event: ReactMouseEvent<HTMLElement>) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const link = target.closest("a[href]");
    if (!link || !event.currentTarget.contains(link)) return;

    const href = link.getAttribute("href") ?? "";
    const linkKind = classifyPreviewLinkHref(href);
    if (linkKind === "empty") return;

    event.preventDefault();

    if (linkKind === "anchor") {
      scrollPreviewAnchorIntoView(href);
      return;
    }

    if (linkKind === "external") {
      if (!shouldOpenPreviewLinkWithModifier(event)) {
        showToast("Ctrl/Cmd+click to open preview links");
        return;
      }

      void openExternalDocumentLink(href);
      return;
    }

    if (linkKind === "blocked-protocol") {
      showToast("Preview link protocol blocked");
      return;
    }

    if (linkKind === "local-other") {
      showToast("Only Markdown and text links open inside NyaMarkdownor");
      return;
    }

    const linkedTarget = resolveLocalMarkdownLinkTarget(href, documentState.filePath);
    if (!linkedTarget) {
      showToast("Save this document before opening relative links");
      return;
    }

    void openLinkedMarkdownDocument(linkedTarget.path, linkedTarget.anchorIds);
  }

  function scrollPreviewAnchorIntoView(href: string) {
    const ids = previewAnchorIdCandidatesFromHref(href);
    const preview = previewRef.current;
    if (!ids.length || !preview) return;

    const target = Array.from(preview.querySelectorAll<HTMLElement>("[id]")).find((element) => ids.includes(element.id));
    if (!target) {
      showToast("Heading not found");
      return;
    }

    target.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  async function openExternalDocumentLink(href: string) {
    try {
      const result = await openExternalLink(href);
      if (result === "opened") {
        showToast("Opened external link");
      } else if (result === "blocked") {
        showToast("External link blocked by the browser");
      } else {
        showToast("Preview link protocol blocked");
      }
    } catch (error) {
      console.warn(error);
      showToast("External link could not be opened");
    }
  }

  function handleRichLinkOpen(href: string) {
    const linkKind = classifyPreviewLinkHref(href);

    if (linkKind === "anchor") {
      const ids = previewAnchorIdCandidatesFromHref(href);
      const headingIndex = headings.findIndex((heading) => ids.includes(heading.id));
      if (headingIndex < 0 || !richEditorRef.current?.scrollToHeading(headingIndex)) showToast("Heading not found");
      return;
    }

    if (linkKind === "external") {
      void openExternalDocumentLink(href);
      return;
    }

    if (linkKind === "blocked-protocol") {
      showToast("Preview link protocol blocked");
      return;
    }

    if (linkKind === "local-other") {
      showToast("Only Markdown and text links open inside NyaMarkdownor");
      return;
    }

    if (linkKind === "empty") return;

    const linkedTarget = resolveLocalMarkdownLinkTarget(href, documentState.filePath);
    if (!linkedTarget) {
      showToast("Save this document before opening relative links");
      return;
    }

    void openLinkedMarkdownDocument(linkedTarget.path, linkedTarget.anchorIds);
  }

  async function openLinkedMarkdownDocument(path: string, anchorIds: string[] = []) {
    try {
      const opened = await readMarkdownPath(path);
      const result = openFileInTab(opened);
      setRecentFiles((current) => rememberRecentFile(current, opened.path, opened.name));
      const targetHeading = anchorIds.length
        ? extractHeadings(opened.markdown).find((heading) => anchorIds.includes(heading.id))
        : null;

      if (targetHeading) {
        jumpToLineSoon(result.tab.id, targetHeading.line);
        showToast(`${openFileInTabToast(opened, result)}; jumped to heading`);
      } else {
        showToast(anchorIds.length ? `${openFileInTabToast(opened, result)}; heading not found` : openFileInTabToast(opened, result));
      }
    } catch (error) {
      console.warn(error);
      showToast("Linked Markdown file could not be opened");
    }
  }

  function handlePreviewChange(event: ReactChangeEvent<HTMLElement>) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.classList.contains("task-list-checkbox")) return;

    const line = Number(target.dataset.taskLine);
    if (!Number.isInteger(line)) return;

    const view = currentActiveEditorView();
    const source = view?.state.doc.toString() ?? currentActiveMarkdownForCommand();
    const edit = applyTaskCheckboxToggle(source, line, target.checked);

    if (!edit) {
      target.checked = !target.checked;
      showToast("Task could not be updated");
      return;
    }

    if (view) {
      dispatchEditorTextEdit(view, edit);
    } else {
      setMarkdown(edit.markdown);
      setSelection(toSelectionState(edit.selection));
    }

    showToast(target.checked ? "Task checked" : "Task unchecked");
  }

  function setMarkdown(markdown: string) {
    richDocumentHistoriesRef.current.delete(activeTabIdRef.current);
    setDocumentState((current) => ({ ...current, markdown }));
  }

  function updateRichMarkdown(tabId: string, markdown: string, source: RichMarkdownSyncSource) {
    const tab = tabsRef.current.find((candidate) => candidate.id === tabId);
    if (!tab || tab.document.markdown === markdown) return;

    const history = richDocumentHistoriesRef.current.get(tabId) ?? EMPTY_RICH_DOCUMENT_HISTORY;
    richDocumentHistoriesRef.current.set(tabId, recordRichDocumentChange(history, tab.document.markdown, markdown, source));
    updateDocumentTab(tabId, (current) => ({ ...current, markdown }));
  }

  function applyRichHistoryAction(tabId: string, action: RichDocumentHistoryAction): boolean {
    const tab = tabsRef.current.find((candidate) => candidate.id === tabId);
    if (!tab) return false;

    const history = richDocumentHistoriesRef.current.get(tabId) ?? EMPTY_RICH_DOCUMENT_HISTORY;
    const result = applyRichDocumentHistoryAction(history, tab.document.markdown, action);
    if (!result) return false;

    richDocumentHistoriesRef.current.set(tabId, result.history);
    updateDocumentTab(tabId, (current) => ({ ...current, markdown: result.markdown }));
    return true;
  }

  function runEditorHistoryAction(action: RichDocumentHistoryAction): boolean {
    if (viewMode === "wysiwyg") {
      const applied = richEditorRef.current?.runHistoryAction(action) ?? false;
      if (!applied) showToast(action === "undo" ? "Nothing to undo" : "Nothing to redo");
      return applied;
    }

    const view = currentActiveEditorView();
    const applied = view ? (action === "undo" ? undoCodeMirror(view) : redoCodeMirror(view)) : false;
    if (applied) view?.focus();
    else showToast(action === "undo" ? "Nothing to undo" : "Nothing to redo");
    return applied;
  }

  function currentActiveEditorView(): EditorView | null {
    return activeOwnedEditorView(editorViewRef.current, editorViewTabIdRef.current, activeTabIdRef.current);
  }

  function currentActiveMarkdownForCommand(): string {
    return currentActiveDocumentTabForCommand().document.markdown;
  }

  function rememberEditorView(tabId: string, view: EditorView | null) {
    if (view) {
      editorViewRef.current = view;
      editorViewTabIdRef.current = tabId;
      if (shouldFocusPendingMountedEditor(pendingEditorFocusTabIdRef.current, tabId, activeTabIdRef.current, viewModeRef.current)) {
        view.focus();
        pendingEditorFocusTabIdRef.current = null;
      }
      return;
    }

    if (editorViewTabIdRef.current === tabId) {
      editorViewRef.current = null;
      editorViewTabIdRef.current = null;
    }
  }

  function rememberEditorStateSnapshot(tabId: string, snapshot: EditorStateSnapshot) {
    editorStateSnapshotsRef.current.set(tabId, snapshot);
    if (typeof snapshot.scrollProgress === "number") sourceScrollProgressRef.current.set(tabId, snapshot.scrollProgress);
  }

  function forgetEditorStateSnapshot(tabId: string) {
    editorStateSnapshotsRef.current.delete(tabId);
    sourceScrollProgressRef.current.delete(tabId);
    richScrollProgressRef.current.delete(tabId);
    richSelectionsRef.current.delete(tabId);
    sourceToRichSelectionTextRef.current.delete(tabId);
    richToSourceSelectionTextRef.current.delete(tabId);
  }

  function rememberRichScrollProgress(tabId: string, progress: number) {
    richScrollProgressRef.current.set(tabId, progress);
    sourceScrollProgressRef.current.set(tabId, progress);
  }

  function rememberRichSelection(tabId: string, range: TextRange) {
    richSelectionsRef.current.set(tabId, range);
    sourceToRichSelectionTextRef.current.delete(tabId);
    setRichSelection((current) => current.from === range.from && current.to === range.to ? current : range);
  }

  function rememberRichActiveHeadingIndex(index: number | null) {
    setRichActiveHeadingIndex((current) => current === index ? current : index);
  }

  function openFindPanel(showReplace: boolean) {
    if (viewMode === "wysiwyg") {
      const selected = richEditorRef.current?.getSelectedText() ?? "";
      const nextQuery = selected && selected.length <= 120 && !selected.includes("\n") ? selected : findQuery;

      if (nextQuery !== findQuery) setFindQuery(nextQuery);
      else selectFindMatchForQuery(nextQuery, findOptions, richSelection);

      setReplaceVisible(showReplace);
      setFindOpen(true);
      return;
    }

    const view = currentActiveEditorView();
    const range = view?.state.selection.main ?? selection;
    const source = view?.state.doc.toString() ?? currentActiveMarkdownForCommand();
    const selected = source.slice(Math.min(range.from, range.to), Math.max(range.from, range.to));
    const nextQuery = selected && selected.length <= 120 && !selected.includes("\n") ? selected : findQuery;

    if (nextQuery !== findQuery) setFindQuery(nextQuery);
    else selectFindMatchForQuery(nextQuery, findOptions, range);

    setReplaceVisible(showReplace);
    setFindOpen(true);
  }

  function closeFindPanel() {
    setFindOpen(false);
    focusEditorSoon();
  }

  function selectEditorRange(range: { from: number; to: number }, options: { focus?: boolean } = {}) {
    const view = currentActiveEditorView();
    if (!view) {
      setSelection(toSelectionState(range));
      return;
    }

    view.dispatch({
      selection: { anchor: range.from, head: range.to },
      effects: EditorView.scrollIntoView(range.from, { y: "center" })
    });
    if (options.focus ?? true) view.focus();
  }

  function selectEditorRanges(ranges: Array<{ from: number; to: number }>, mainIndex = ranges.length - 1, options: { focus?: boolean } = {}) {
    if (!ranges.length) return;

    const view = currentActiveEditorView();
    if (!view) {
      const safeMainIndex = Math.max(0, Math.min(mainIndex, ranges.length - 1));
      setSelection(toSelectionState(ranges[safeMainIndex], ranges));
      return;
    }

    const safeMainIndex = Math.max(0, Math.min(mainIndex, ranges.length - 1));
    const selection = EditorSelection.create(
      ranges.map((range) => EditorSelection.range(range.from, range.to)),
      safeMainIndex
    );

    view.dispatch({
      selection,
      effects: EditorView.scrollIntoView(ranges[safeMainIndex].from, { y: "center" })
    });
    if (options.focus ?? true) view.focus();
  }

  function dispatchEditorDocument(markdown: string, range: { from: number; to: number }, options: { focus?: boolean } = {}) {
    const view = currentActiveEditorView();
    if (!view) {
      setDocumentState((current) => ({ ...current, markdown }));
      setSelection(toSelectionState(range));
      return;
    }

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: markdown },
      selection: { anchor: range.from, head: range.to },
      scrollIntoView: true
    });
    if (options.focus ?? true) view.focus();
  }

  function dispatchEditorTextEdit(view: EditorView, edit: TextEdit) {
    const current = view.state.doc.toString();
    const changes = edit.change && applyTextChange(current, edit.change) === edit.markdown
      ? edit.change
      : { from: 0, to: view.state.doc.length, insert: edit.markdown };

    view.dispatch({
      changes,
      selection: { anchor: edit.selection.from, head: edit.selection.to },
      scrollIntoView: true
    });
  }

  function selectFindMatchForQuery(
    query: string,
    options: typeof findOptions,
    preferredRange?: { from: number; to: number }
  ) {
    if (!query) return;

    if (viewMode === "wysiwyg") {
      const matches = richEditorRef.current?.findTextMatches(query, options) ?? [];
      if (!matches.length) return;
      const range = preferredRange ?? richSelection;
      const activeIndex = findMatchIndexAtSelection(matches, range);
      const index = activeIndex >= 0 ? activeIndex : findNextMatchIndex(matches, range.from, "next");
      richEditorRef.current?.selectTextRange(matches[index]);
      return;
    }

    const view = currentActiveEditorView();
    const source = view?.state.doc.toString() ?? currentActiveMarkdownForCommand();
    const range = preferredRange ?? view?.state.selection.main ?? selection;
    const matches = findTextMatches(source, query, options);
    if (!matches.length) return;

    const activeIndex = findMatchIndexAtSelection(matches, range);
    const index = activeIndex >= 0 ? activeIndex : findNextMatchIndex(matches, range.from, "next");
    selectEditorRange(matches[index], { focus: false });
  }

  function handleFindQueryChange(query: string) {
    setFindQuery(query);
    selectFindMatchForQuery(query, findOptions);
  }

  function handleFindCaseSensitiveChange(caseSensitive: boolean) {
    setFindCaseSensitive(caseSensitive);
    selectFindMatchForQuery(findQuery, { caseSensitive, wholeWord: findWholeWord });
  }

  function handleFindWholeWordChange(wholeWord: boolean) {
    setFindWholeWord(wholeWord);
    selectFindMatchForQuery(findQuery, { caseSensitive: findCaseSensitive, wholeWord });
  }

  function goToFindMatch(direction: SearchDirection) {
    if (!findQuery) {
      openFindPanel(false);
      return;
    }

    if (viewMode === "wysiwyg") {
      const matches = richEditorRef.current?.findTextMatches(findQuery, findOptions) ?? [];
      if (!matches.length) {
        showToast("No matches");
        return;
      }

      const activeIndex = findMatchIndexAtSelection(matches, richSelection);
      const index = activeIndex >= 0
        ? direction === "next"
          ? (activeIndex + 1) % matches.length
          : (activeIndex - 1 + matches.length) % matches.length
        : findNextMatchIndex(matches, direction === "next" ? richSelection.to : richSelection.from, direction);

      richEditorRef.current?.selectTextRange(matches[index]);
      return;
    }

    const view = currentActiveEditorView();
    const source = view?.state.doc.toString() ?? currentActiveMarkdownForCommand();
    const range = view?.state.selection.main ?? selection;
    const matches = findTextMatches(source, findQuery, findOptions);

    if (!matches.length) {
      showToast("No matches");
      return;
    }

    const activeIndex = findMatchIndexAtSelection(matches, range);
    const index = activeIndex >= 0
      ? direction === "next"
        ? (activeIndex + 1) % matches.length
        : (activeIndex - 1 + matches.length) % matches.length
      : findNextMatchIndex(matches, direction === "next" ? range.to : range.from, direction);

    selectEditorRange(matches[index], { focus: false });
  }

  function replaceCurrentFindMatch() {
    if (!findQuery) return;

    if (viewMode === "wysiwyg") {
      const matches = richEditorRef.current?.findTextMatches(findQuery, findOptions) ?? [];
      if (!matches.length) {
        showToast("No matches");
        return;
      }

      const activeIndex = findMatchIndexAtSelection(matches, richSelection);
      const match = matches[activeIndex >= 0 ? activeIndex : findNextMatchIndex(matches, richSelection.from, "next")];
      if (!richEditorRef.current?.replaceTextRange(match, replaceValue)) {
        showToast("Replacement could not be applied");
        return;
      }

      const nextMatches = richEditorRef.current.findTextMatches(findQuery, findOptions);
      if (nextMatches.length) {
        richEditorRef.current.selectTextRange(nextMatches[findNextMatchIndex(nextMatches, match.from + replaceValue.length, "next")]);
      }
      showToast("Replaced match");
      return;
    }

    const view = currentActiveEditorView();
    const source = view?.state.doc.toString() ?? currentActiveMarkdownForCommand();
    const range = view?.state.selection.main ?? selection;
    const matches = findTextMatches(source, findQuery, findOptions);

    if (!matches.length) {
      showToast("No matches");
      return;
    }

    const activeIndex = findMatchIndexAtSelection(matches, range);
    const index = activeIndex >= 0 ? activeIndex : findNextMatchIndex(matches, range.from, "next");
    const match = matches[index];
    const markdown = replaceTextRange(source, match, replaceValue);
    const nextSelection = getSelectionAfterReplace(source, findQuery, replaceValue, match, findOptions);
    dispatchEditorDocument(markdown, nextSelection, { focus: false });
    showToast("Replaced match");
  }

  function replaceAllFindMatches() {
    if (!findQuery) return;

    if (viewMode === "wysiwyg") {
      const count = richEditorRef.current?.replaceAllTextMatches(findQuery, replaceValue, findOptions) ?? 0;
      showToast(count ? `${count} replacements` : "No matches");
      return;
    }

    const view = currentActiveEditorView();
    const source = view?.state.doc.toString() ?? currentActiveMarkdownForCommand();
    const result = replaceAllText(source, findQuery, replaceValue, findOptions);

    if (result.count === 0) {
      showToast("No matches");
      return;
    }

    dispatchEditorDocument(result.text, { from: 0, to: 0 }, { focus: false });
    showToast(`${result.count} replacements`);
  }

  function setViewMode(viewMode: ViewMode) {
    const currentViewMode = viewModeRef.current;
    const returnFocusToViewMenu = viewMenuOpen;
    const preserveOverlayFocus = settingsOpen || findOpen;
    if (viewMode === currentViewMode) {
      setViewMenuOpen(false);
      if (returnFocusToViewMenu) window.requestAnimationFrame(() => viewMenuTriggerRef.current?.focus());
      else if (!preserveOverlayFocus) focusEditorSoon();
      return;
    }

    const tabId = activeTabIdRef.current;
    if (viewMode === "wysiwyg") {
      const sourceView = currentActiveEditorView();
      if (sourceView) {
        richScrollProgressRef.current.set(tabId, getScrollProgress(sourceView.scrollDOM));
        const sourceSelection = sourceView.state.selection.main;
        if (!sourceSelection.empty) {
          const selectedText = markdownRangesToClipboardPayload(sourceView.state.doc.toString(), [{
            from: sourceSelection.from,
            to: sourceSelection.to
          }]).plainText.trim();
          if (selectedText) sourceToRichSelectionTextRef.current.set(tabId, selectedText);
        }
      }
    } else if (currentViewMode === "wysiwyg") {
      const richProgress = richEditorRef.current?.getScrollProgress() ?? richScrollProgressRef.current.get(tabId);
      if (typeof richProgress === "number") sourceScrollProgressRef.current.set(tabId, richProgress);
      const selectedText = richEditorRef.current?.getSelectedText() ?? "";
      if (selectedText) richToSourceSelectionTextRef.current.set(tabId, selectedText);
      else richToSourceSelectionTextRef.current.delete(tabId);
      richEditorRef.current?.flushMarkdownSync();
    }

    setViewMenuOpen(false);
    viewModeRef.current = viewMode;
    setViewModeState(viewMode);
    if (returnFocusToViewMenu) {
      window.requestAnimationFrame(() => viewMenuTriggerRef.current?.focus());
    } else if (!preserveOverlayFocus) {
      focusEditorSoon();
    }
  }

  function focusViewMenuItem(direction: ViewMenuFocusDirection) {
    const items = Array.from(viewMenuRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitemradio]") ?? []);
    if (!items.length) return;

    const activeIndex = items.findIndex((item) => item.getAttribute("aria-checked") === "true");
    const focusedIndex = items.findIndex((item) => item === document.activeElement);
    const targetIndex = viewMenuFocusIndex(items.length, activeIndex, focusedIndex, direction);

    if (targetIndex !== null) items[targetIndex]?.focus();
  }

  function handleViewMenuTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;

    event.preventDefault();
    setViewMenuOpen(true);
    window.requestAnimationFrame(() => {
      focusViewMenuItem(event.key === "ArrowUp" || event.key === "End" ? "last" : "first");
    });
  }

  function handleViewMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const direction = event.key === "ArrowDown"
      ? "next"
      : event.key === "ArrowUp"
        ? "previous"
        : event.key === "Home"
          ? "first"
          : event.key === "End"
            ? "last"
            : null;
    if (!direction) return;

    event.preventDefault();
    focusViewMenuItem(direction);
  }

  function commitManualPreviewSnapshots(next: ManualPreviewSnapshots) {
    manualPreviewSnapshotsRef.current = next;
    setManualPreviewSnapshots(next);
  }

  function clearManualPreviewSnapshot(tabId = activeTabIdRef.current) {
    const next = clearManualPreviewSnapshotForTab(manualPreviewSnapshotsRef.current, tabId);
    if (next !== manualPreviewSnapshotsRef.current) commitManualPreviewSnapshots(next);
  }

  function updateManualPreview() {
    const tab = currentActiveDocumentTabForCommand();
    const next = setManualPreviewSnapshotForTab(manualPreviewSnapshotsRef.current, tab.id, tab.document.markdown);
    if (next !== manualPreviewSnapshotsRef.current) commitManualPreviewSnapshots(next);
    showToast("Preview updated");
  }

  function pruneManualPreviewSnapshotsToTabs(openTabs: DocumentTab[]) {
    const next = pruneManualPreviewSnapshots(manualPreviewSnapshotsRef.current, openTabs.map((tab) => tab.id));
    if (next !== manualPreviewSnapshotsRef.current) commitManualPreviewSnapshots(next);
  }

  function toggleTheme() {
    setThemeState((current) => current === "light" ? "dark" : "light");
  }

  function toggleSidebar() {
    setSidebarVisibleState((current) => !current);
  }

  function setSidebarVisible(value: boolean) {
    setSidebarVisibleState(value);
  }

  function setAutoSave(value: boolean) {
    if (value) {
      autoSaveAttemptedMarkdownRef.current.clear();
    }
    setAutoSaveState(value);
  }

  async function chooseBackupDirectory() {
    try {
      const directory = await pickMarkdownBackupDirectory();
      if (!directory) return;
      setBackupPreferencesState((current) => backupPreferencesWithDirectory(current, directory));
    } catch (error) {
      console.warn(error);
      showToast("Backup location could not be changed");
    }
  }

  function resetBackupDirectory() {
    setBackupPreferencesState((current) => backupPreferencesWithDirectory(current, null));
  }

  function setSmartCopy(value: boolean) {
    setSmartCopyState(value);
  }

  function setSoftSyntax(value: boolean) {
    setSoftSyntaxState(value);
  }

  function setEditorFontSize(value: number) {
    setEditorFontSizeState(value);
  }

  function setEditorLineWidth(value: number) {
    setEditorLineWidthState(value);
  }

  function setEditorDensity(value: typeof editorDensity) {
    setEditorDensityState(value);
  }

  function setTableHeightMode(value: TableHeightMode) {
    setTableHeightModeState(value);
  }

  function setTableMaxHeightVh(value: number) {
    setTableMaxHeightVhState(value);
  }

  function resetPaneLayout() {
    setPaneLayoutState(defaultPaneLayout);
    showToast("Pane layout reset");
  }

  function applyPaneLayoutCssVariables(layout: PaneLayout) {
    const target = appShellRef.current;
    if (!target) return;

    const variables = paneLayoutCssVariables(layout);
    Object.entries(variables).forEach(([name, value]) => {
      target.style.setProperty(name, value);
    });
  }

  function startPaneResize(event: ReactPointerEvent<HTMLElement>, type: PaneResizeState["type"]) {
    if (event.button !== 0 || viewModeRef.current !== "split") return;

    const editorPane = editorPaneRef.current;
    const previewPane = previewPaneRef.current;
    if (!editorPane || !previewPane) return;

    const pairWidth = editorPane.getBoundingClientRect().width + previewPane.getBoundingClientRect().width;
    paneResizeStateRef.current = {
      type,
      startX: event.clientX,
      initialLayout: paneLayoutRef.current,
      currentLayout: paneLayoutRef.current,
      pairWidth
    };

    event.preventDefault();
    document.body.classList.add("pane-resizing");
    window.addEventListener("pointermove", handlePaneResizeMove);
    window.addEventListener("pointerup", handlePaneResizeEnd);
    window.addEventListener("pointercancel", handlePaneResizeCancel);
  }

  function handlePaneResizeMove(event: PointerEvent) {
    const state = paneResizeStateRef.current;
    if (!state) return;

    const deltaPx = event.clientX - state.startX;
    const nextLayout = state.type === "editor-preview"
      ? resizeEditorPreviewPaneLayout(state.initialLayout, deltaPx, state.pairWidth)
      : resizeTablePaneLayout(state.initialLayout, deltaPx);

    state.currentLayout = nextLayout;
    paneLayoutRef.current = nextLayout;
    applyPaneLayoutCssVariables(nextLayout);
  }

  function handlePaneResizeEnd() {
    stopPaneResize(true);
  }

  function handlePaneResizeCancel() {
    stopPaneResize(false);
  }

  function stopPaneResize(commit: boolean) {
    const state = paneResizeStateRef.current;
    if (!state) return;

    window.removeEventListener("pointermove", handlePaneResizeMove);
    window.removeEventListener("pointerup", handlePaneResizeEnd);
    window.removeEventListener("pointercancel", handlePaneResizeCancel);
    document.body.classList.remove("pane-resizing");
    paneResizeStateRef.current = null;

    if (commit) {
      setPaneLayoutState(state.currentLayout);
    } else {
      paneLayoutRef.current = paneLayout;
      applyPaneLayoutCssVariables(paneLayout);
    }
  }

  function handlePaneResizeKeyDown(event: ReactKeyboardEvent<HTMLElement>, type: PaneResizeState["type"]) {
    const step = event.shiftKey ? 80 : 24;
    let deltaPx: number | null = null;

    if (event.key === "ArrowLeft") deltaPx = -step;
    if (event.key === "ArrowRight") deltaPx = step;
    if (event.key === "Home") {
      event.preventDefault();
      resetPaneLayout();
      return;
    }

    if (deltaPx === null) return;
    event.preventDefault();

    const editorPane = editorPaneRef.current;
    const previewPane = previewPaneRef.current;
    const pairWidth = editorPane && previewPane
      ? editorPane.getBoundingClientRect().width + previewPane.getBoundingClientRect().width
      : 800;
    const nextLayout = type === "editor-preview"
      ? resizeEditorPreviewPaneLayout(paneLayoutRef.current, deltaPx, pairWidth)
      : resizeTablePaneLayout(paneLayoutRef.current, deltaPx);

    paneLayoutRef.current = nextLayout;
    setPaneLayoutState(nextLayout);
  }

  function preserveRichEditorSelectionOnToolbarMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
    const target = event.target;
    const targetIsControl = target instanceof Element && Boolean(target.closest("button, summary"));
    if (shouldPreserveEditorSelectionOnToolbarMouseDown(viewMode, event.button, targetIsControl)) {
      event.preventDefault();
    }
  }

  // Toolbar summaries stay unfocused to keep the editor selection painted, so
  // close an open menu explicitly when the pointer starts outside that menu.
  function closeOpenToolbarMenus(except?: Element): boolean {
    let closed = false;
    appShellRef.current
      ?.querySelectorAll<HTMLElement>(".toolbar-action-menu-wrap[open], .table-action-menu-wrap[open]")
      .forEach((menu) => {
        if (except && menu.contains(except)) return;
        menu.removeAttribute("open");
        closed = true;
      });
    return closed;
  }

  function closeToolbarMenusOnOutsideMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    closeOpenToolbarMenus(target);
  }

  function runTextCommand(command: MarkdownTextCommand) {
    if (viewMode === "wysiwyg") {
      if (command === "link") {
        const link = richEditorRef.current?.getLinkState();
        if (!link) {
          showToast("Link editor is unavailable");
          return;
        }
        setLinkDialogState({ href: link.href, canUnlink: link.active });
        return;
      }

      if (!richEditorRef.current?.runTextCommand(command)) {
        showToast("Command is unavailable at this cursor");
        return;
      }
      showToast(textCommandLabel(command));
      return;
    }

    const view = currentActiveEditorView();
    const source = view?.state.doc.toString() ?? currentActiveMarkdownForCommand();
    const range = view?.state.selection.main ?? selection;
    const edit = applyMarkdownTextCommand(source, { from: range.from, to: range.to }, command);

    if (view) {
      dispatchEditorTextEdit(view, edit);
      view.focus();
    } else {
      setMarkdown(edit.markdown);
    }

    showToast(textCommandLabel(command));
  }

  function applyRichLink(href: string) {
    const normalized = normalizeRichLinkHref(href);
    if (!normalized) {
      showToast("Enter a safe link destination");
      return;
    }

    const applied = richEditorRef.current?.setLink(normalized);
    if (!applied) {
      showToast("Link could not be applied");
      return;
    }

    setLinkDialogState(null);
    showToast("Link updated");
  }

  function removeRichLink() {
    const removed = richEditorRef.current?.unsetLink();
    if (!removed) {
      showToast("No link at cursor");
      return;
    }

    setLinkDialogState(null);
    showToast("Link removed");
  }

  function runBlockCommand(command: MarkdownBlockCommand) {
    if (viewMode === "wysiwyg") {
      if (!richEditorRef.current?.runBlockCommand(command)) {
        showToast("Command is unavailable at this cursor");
        return;
      }
      showToast(blockCommandLabel(command));
      return;
    }

    const view = currentActiveEditorView();
    const source = view?.state.doc.toString() ?? currentActiveMarkdownForCommand();
    const range = view?.state.selection.main ?? selection;
    const edit = applyMarkdownBlockCommand(source, { from: range.from, to: range.to }, command);

    if (view) {
      dispatchEditorTextEdit(view, edit);
      view.focus();
    } else {
      setMarkdown(edit.markdown);
      setSelection(toSelectionState(edit.selection));
    }

    showToast(blockCommandLabel(command));
  }

  function runListIndentation(direction: MarkdownListIndentDirection) {
    if (viewMode === "wysiwyg") {
      if (!richEditorRef.current?.runListIndentation(direction)) {
        showToast(direction === "indent" ? "No list item to indent" : "No list item to outdent");
        return;
      }
      showToast(direction === "indent" ? "List item indented" : "List item outdented");
      return;
    }

    const view = currentActiveEditorView();
    const source = view?.state.doc.toString() ?? currentActiveMarkdownForCommand();
    const range = view?.state.selection.main ?? selection;
    const edit = applyMarkdownListIndentation(source, { from: range.from, to: range.to }, direction);

    if (!edit) {
      showToast(direction === "indent" ? "No list item to indent" : "No list item to outdent");
      return;
    }

    if (view) {
      dispatchEditorTextEdit(view, edit);
      view.focus();
    } else {
      setMarkdown(edit.markdown);
      setSelection(toSelectionState(edit.selection));
    }

    showToast(direction === "indent" ? "List item indented" : "List item outdented");
  }

  function runTableCommand(command: TableDocumentCommand) {
    if (viewMode === "wysiwyg") {
      switch (command) {
        case "add-row":
        case "add-row-before":
        case "add-column":
        case "add-column-before":
        case "delete-row":
        case "delete-column":
        case "delete-table":
        case "duplicate-row":
        case "duplicate-column":
        case "move-row-up":
        case "move-row-down":
        case "move-column-left":
        case "move-column-right": {
          const applied = richEditorRef.current?.runTableCommand(command);
          showToast(applied ? tableCommandLabel(command) : tableCommandUnavailableLabel(command));
          return;
        }
        default:
          showToast("This table command is available in source mode");
          return;
      }
    }

    const view = currentActiveEditorView();
    const source = view?.state.doc.toString() ?? currentActiveMarkdownForCommand();
    const range = view?.state.selection.main ?? selection;
    const edit = applyTableDocumentCommand(source, { from: range.from, to: range.to }, command);

    if (!edit) {
      showToast(tableCommandUnavailableLabel(command));
      return;
    }

    if (view) {
      dispatchEditorTextEdit(view, edit);
      view.focus();
    } else {
      setMarkdown(edit.markdown);
    }

    showToast(tableCommandLabel(command));
  }

  function openInsertTableDialog() {
    setTableSizeDialogOpen(true);
  }

  function insertSizedTable(size: TableSizeDraft) {
    const nextSize = normalizeTableSizeDraft(size);
    setTableSizeDraft(nextSize);
    setTableSizeDialogOpen(false);

    if (viewMode === "wysiwyg") {
      if (!richEditorRef.current?.insertTable(nextSize)) {
        showToast("Table could not be inserted");
        return;
      }
      showToast(`Inserted ${nextSize.columns}x${nextSize.bodyRows + 1} table`);
      return;
    }

    const view = currentActiveEditorView();
    const source = view?.state.doc.toString() ?? currentActiveMarkdownForCommand();
    const range = view?.state.selection.main ?? selection;
    const edit = insertTableAtSelection(source, { from: range.from, to: range.to }, nextSize);

    if (view) {
      dispatchEditorTextEdit(view, edit);
      view.focus();
    } else {
      setMarkdown(edit.markdown);
      setSelection(toSelectionState(edit.selection));
    }

    showToast(`Inserted ${nextSize.columns}x${nextSize.bodyRows + 1} table`);
  }

  function normalizeTableSizeDraft(size: TableSizeDraft): TableSizeDraft {
    return {
      columns: clampInteger(size.columns, 1, 12),
      bodyRows: clampInteger(size.bodyRows, 0, 30)
    };
  }

  function clampInteger(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, Math.trunc(value)));
  }

  function runTableSelectionCommand(command: TableSelectionCommand) {
    if (viewMode === "wysiwyg") {
      const richCommand = command === "select-cell" ? "select-cell" : "select-table";
      const applied = richEditorRef.current?.runTableSelectionCommand(richCommand);
      showToast(applied ? tableSelectionLabel(command) : tableSelectionUnavailableLabel(command));
      return;
    }

    const view = currentActiveEditorView();
    const source = view?.state.doc.toString() ?? currentActiveMarkdownForCommand();
    const range = view?.state.selection.main ?? selection;
    const nextSelection = applyTableSelectionCommand(source, { from: range.from, to: range.to }, command);

    if (!nextSelection) {
      showToast(tableSelectionUnavailableLabel(command));
      return;
    }

    selectEditorRange(nextSelection);
    showToast(tableSelectionLabel(command));
  }

  function runTableColumnSelectionCommand() {
    if (viewMode === "wysiwyg") {
      const applied = richEditorRef.current?.runTableSelectionCommand("select-column");
      showToast(applied ? "Table column selected" : "No table at cursor");
      return;
    }

    const view = currentActiveEditorView();
    const source = view?.state.doc.toString() ?? currentActiveMarkdownForCommand();
    const range = view?.state.selection.main ?? selection;
    const nextSelection = applyTableColumnSelection(source, { from: range.from, to: range.to });

    if (!nextSelection) {
      showToast("No table at cursor");
      return;
    }

    selectEditorRanges(nextSelection.ranges, nextSelection.mainIndex);
    showToast("Table column selected");
  }

  function runTableColumnBodySelectionCommand(colIndex?: number) {
    const { source, primary } = currentEditorSelection();
    const tableBlock = colIndex === undefined ? null : currentTableContext()?.table;
    const range = colIndex === undefined
      ? primary
      : { from: tableBlock?.startOffset ?? primary.from, to: tableBlock?.startOffset ?? primary.from };
    const nextSelection = applyTableColumnBodySelection(source, { from: range.from, to: range.to }, colIndex);

    if (!nextSelection) {
      showToast((tableBlock ?? currentTableContext()?.table) ? "Table has no body rows" : "No table at cursor");
      return;
    }

    selectEditorRanges(nextSelection.ranges, nextSelection.mainIndex);
    showToast("Table column body selected");
  }

  function runTableRowSelectionCommand(rowPosition?: number) {
    if (viewMode === "wysiwyg") {
      const applied = richEditorRef.current?.runTableSelectionCommand("select-row");
      showToast(applied ? "Table row selected" : "Move the cursor into a table row");
      return;
    }

    const { source, primary } = currentEditorSelection();
    const tableBlock = rowPosition === undefined ? null : currentTableContext()?.table;
    const range = rowPosition === undefined
      ? primary
      : { from: tableBlock?.startOffset ?? primary.from, to: tableBlock?.startOffset ?? primary.from };
    const nextSelection = applyTableRowSelection(source, { from: range.from, to: range.to }, rowPosition);

    if (!nextSelection) {
      showToast("Move the cursor into a table row");
      return;
    }

    selectEditorRanges(nextSelection.ranges, nextSelection.mainIndex);
    showToast("Table row selected");
  }

  function runTableHeaderSelectionCommand() {
    const { source, primary } = currentEditorSelection();
    const tableBlock = currentTableContext()?.table;
    const range = { from: tableBlock?.startOffset ?? primary.from, to: tableBlock?.startOffset ?? primary.from };
    const nextSelection = applyTableRowSelection(source, { from: range.from, to: range.to }, 0);

    if (!nextSelection) {
      showToast("No table at cursor");
      return;
    }

    selectEditorRanges(nextSelection.ranges, nextSelection.mainIndex);
    showToast("Table header selected");
  }

  function runTableContentSelectionCommand() {
    if (viewMode === "wysiwyg") {
      const applied = richEditorRef.current?.runTableSelectionCommand("select-table");
      showToast(applied ? "Table selected" : "No table at cursor");
      return;
    }

    const { source, primary: range } = currentEditorSelection();
    const nextSelection = applyTableContentSelection(source, { from: range.from, to: range.to });

    if (!nextSelection) {
      showToast("No table at cursor");
      return;
    }

    selectEditorRanges(nextSelection.ranges, nextSelection.mainIndex);
    showToast("Table selected");
  }

  function runTableBodySelectionCommand() {
    const { source, primary: range } = currentEditorSelection();
    const nextSelection = applyTableBodySelection(source, { from: range.from, to: range.to });

    if (!nextSelection) {
      showToast(currentTableContext()?.table ? "Table has no body rows" : "No table at cursor");
      return;
    }

    selectEditorRanges(nextSelection.ranges, nextSelection.mainIndex);
    showToast("Table body selected");
  }

  function selectTableColumnByIndex(col: number) {
    const tableBlock = currentTableContext()?.table;
    if (!tableBlock) {
      showToast("No table at cursor");
      return;
    }

    const { source } = currentEditorSelection();
    const range = { from: tableBlock.startOffset, to: tableBlock.startOffset };
    const nextSelection = applyTableColumnSelection(source, { from: range.from, to: range.to }, col);

    if (!nextSelection) {
      showToast("No table at cursor");
      return;
    }

    selectEditorRanges(nextSelection.ranges, nextSelection.mainIndex);
    showToast("Table column selected");
  }

  function selectTableColumnBodyByIndex(col: number) {
    if (!currentTableContext()) {
      showToast("No table at cursor");
      return;
    }

    runTableColumnBodySelectionCommand(col);
  }

  function newDraftDocument(toastMessage?: string) {
    const draftName = nextUntitledDraftName();
    addDocumentTab(createDefaultDocument("", draftName));
    showToast(toastMessage ?? `New draft ${draftName}`);
  }

  function newPrimaryDocument() {
    newDraftDocument();
  }

  function nextUntitledDraftName(): string {
    return suggestedUntitledMarkdownName(currentTabsForImmediateDocumentOpen().map((tab) => tab.document.fileName));
  }

  async function openInitialLaunchFiles() {
    let paths: string[] = [];
    try {
      paths = await initialMarkdownFilePaths();
    } catch (error) {
      console.warn(error);
      showToast("Launch files could not be inspected");
      return;
    }

    await openLaunchMarkdownPaths(paths);
  }

  async function openLaunchMarkdownPaths(paths: string[]) {
    if (!paths.length) return;

    const openedFiles: OpenedFile[] = [];
    const failedMessages: string[] = [];
    let lastResult: OpenFileInTabResult | null = null;

    for (const path of paths) {
      try {
        const opened = await readMarkdownPath(path);
        lastResult = openFileInTab(opened);
        openedFiles.push(opened);
      } catch (error) {
        console.warn(error);
        failedMessages.push(messageFromError(error));
      }
    }

    if (openedFiles.length > 0) {
      setRecentFiles((current) => rememberRecentFiles(current, openedFiles));
    }

    if (openedFiles.length === 1 && failedMessages.length === 0) {
      showToast(lastResult ? openFileInTabToast(openedFiles[0], lastResult) : `Opened ${openedFiles[0].name}`);
      return;
    }

    if (openedFiles.length > 0 || failedMessages.length > 0) {
      showToast(openMarkdownFilesToastWithFailures(openedFiles.length, failedMessages.length, failedMessages));
    }
  }

  async function openDocument() {
    if (!desktopLocalFilesAvailable) {
      showToast("Real file open needs the desktop app");
      return;
    }

    let result: OpenMarkdownFilesResult = { files: [], failedCount: 0, failedMessages: [] };
    try {
      result = await openMarkdownFiles();
    } catch (error) {
      console.warn(error);
      showToast(fileOpenFailureLabel(error, "File could not be opened"));
      return;
    }

    handleOpenedDocumentsResult(result);
  }

  async function openPrimaryDocument() {
    if (desktopLocalFilesAvailable) {
      await openDocument();
      return;
    }

    await importDraftDocument();
  }

  async function importDraftDocument() {
    let result: OpenMarkdownFilesResult = { files: [], failedCount: 0, failedMessages: [] };
    try {
      result = await importMarkdownFilesAsDrafts();
    } catch (error) {
      console.warn(error);
      showToast(fileOpenFailureLabel(error, "Draft could not be imported"));
      return;
    }

    handleOpenedDocumentsResult(result);
  }

  function handleOpenedDocumentsResult(result: OpenMarkdownFilesResult) {
    const openedFiles = result.files;
    const failedCount = result.failedCount;
    if (!openedFiles.length && failedCount > 0) {
      showToast(openMarkdownFilesToastWithFailures(0, failedCount, result.failedMessages));
      return;
    }
    if (!openedFiles.length) return;

    let lastResult: OpenFileInTabResult | null = null;
    setRecentFiles((current) => rememberRecentFiles(current, openedFiles));

    for (const opened of openedFiles) {
      lastResult = openFileInTab(opened);
    }

    if (openedFiles.length === 1) {
      const opened = openedFiles[0];
      if (failedCount > 0) {
        showToast(openMarkdownFilesToastWithFailures(1, failedCount, result.failedMessages));
        return;
      }
      showToast(lastResult ? openFileInTabToast(opened, lastResult) : `Opened ${opened.name}`);
      return;
    }

    showToast(openMarkdownFilesToastWithFailures(openedFiles.length, failedCount, result.failedMessages));
  }

  async function openWorkspace() {
    if (!desktopRuntime) {
      showToast("Folder workspaces need the desktop app");
      return;
    }

    try {
      setWorkspaceLoading(true);
      const opened = await openMarkdownWorkspace();
      if (!opened) return;

      setWorkspace(opened);
      setWorkspaceQuery("");
      saveWorkspaceRoot(opened.rootPath);
      showToast(opened.truncated ? `Opened ${opened.rootName} - first ${opened.files.length} files` : `Opened folder ${opened.rootName}`);
    } catch (error) {
      console.warn(error);
      showToast("Folder workspaces are available in the desktop app");
    } finally {
      setWorkspaceLoading(false);
    }
  }

  async function loadWorkspace(rootPath: string, options: { quiet?: boolean } = {}) {
    try {
      setWorkspaceLoading(true);
      const listing = await listMarkdownWorkspace(rootPath);
      setWorkspace(listing);
      saveWorkspaceRoot(listing.rootPath);
      if (!options.quiet) {
        showToast(listing.truncated ? `Workspace refreshed - first ${listing.files.length} files` : "Workspace refreshed");
      }
    } catch (error) {
      console.warn(error);
      if (!options.quiet) showToast("Workspace could not be opened");
    } finally {
      setWorkspaceLoading(false);
    }
  }

  async function insertLocalImageReferences() {
    if (!isTauriRuntime()) {
      showToast("Local image insertion needs the desktop app");
      return;
    }

    if (!await ensureActiveDocumentPathForLocalImages()) {
      showToast("Save canceled; image references not inserted");
      return;
    }

    const selected = await openLocalImageFiles();
    if (!selected?.length) return;

    const imageInsert = insertLocalImageReferencesFromPaths(selected);
    showToast(imageInsert.blockedByUnsaved ? "Save canceled; image references not inserted" : droppedImageToast(imageInsert.insertedCount, imageInsert.skippedCount));
  }

  async function openDroppedPaths(paths: string[]) {
    const uniquePaths = uniqueDroppedPaths(paths);
    if (uniquePaths.length === 0) return;

    const imagePaths: string[] = [];
    const markdownPaths: string[] = [];
    const openedFiles: OpenedFile[] = [];
    const workspaceCandidates: string[] = [];
    let skippedCount = 0;
    let openedWorkspace: WorkspaceListing | null = null;
    let imageDropNotice = "";

    for (const path of uniquePaths) {
      if (isSupportedImageDropName(path)) {
        imagePaths.push(path);
        continue;
      }

      if (!isSupportedMarkdownDropName(path)) {
        workspaceCandidates.push(path);
        continue;
      }

      markdownPaths.push(path);
    }

    if (imagePaths.length > 0) {
      if (await ensureActiveDocumentPathForLocalImages()) {
        const imageDrop = insertLocalImageReferencesFromPaths(imagePaths);
        imageDropNotice = imageDrop.blockedByUnsaved
          ? "Save canceled; image references not inserted"
          : droppedImageToast(imageDrop.insertedCount, imageDrop.skippedCount);
      } else {
        imageDropNotice = "Save canceled; image references not inserted";
      }
    }

    for (const path of markdownPaths) {
      try {
        const opened = await readMarkdownPath(path);
        openFileInTab(opened);
        openedFiles.push(opened);
      } catch (error) {
        console.warn(error);
        workspaceCandidates.push(path);
      }
    }

    if (workspaceCandidates.length > 0) {
      setWorkspaceLoading(true);
      try {
        for (const path of workspaceCandidates) {
          if (openedWorkspace) {
            skippedCount += 1;
            continue;
          }

          try {
            const listing = await listMarkdownWorkspace(path);
            setWorkspace(listing);
            setWorkspaceQuery("");
            saveWorkspaceRoot(listing.rootPath);
            openedWorkspace = listing;
          } catch (error) {
            console.warn(error);
            skippedCount += 1;
          }
        }
      } finally {
        setWorkspaceLoading(false);
      }
    }

    if (openedFiles.length > 0) {
      setRecentFiles((current) => rememberRecentFiles(current, openedFiles));
    }

    showToast(combineDropToasts(
      imageDropNotice,
      openedFiles.length,
      openedWorkspace?.rootName ?? null,
      skippedCount
    ));
  }

  async function openDroppedBrowserFiles(files: FileList) {
    const droppedFiles = Array.from(files);
    const openedFiles = await openedFilesFromBrowserDrop(droppedFiles);
    if (openedFiles.length === 0) {
      showToast(droppedFiles.some((file) => isSupportedImageDropName(file.name)) ? "Local image drops need the desktop app" : "No Markdown files found");
      return;
    }

    for (const opened of openedFiles) {
      openFileInTab(opened);
    }

    showToast(droppedDraftImportToast(openedFiles.length, files.length - openedFiles.length));
  }

  async function ensureActiveDocumentPathForLocalImages(): Promise<boolean> {
    const currentDocument = currentActiveDocumentTabForCommand().document;
    if (currentDocument.filePath) return true;

    const result = await saveDocumentTab(currentActiveDocumentTabForCommand(), { mode: "save", announce: false });
    if (result !== "saved") return false;

    return Boolean(currentActiveDocumentTabForCommand().document.filePath);
  }

  function insertLocalImageReferencesFromPaths(paths: string[]): LocalImageInsertResult {
    const currentDocument = currentActiveDocumentTabForCommand().document;
    if (!currentDocument.filePath) {
      return {
        insertedCount: 0,
        skippedCount: paths.length,
        blockedByUnsaved: true
      };
    }

    const imageDrop = droppedImageMarkdown(paths, currentDocument.filePath);
    if (!imageDrop.markdown) {
      return {
        insertedCount: 0,
        skippedCount: imageDrop.skippedCount,
        blockedByUnsaved: false
      };
    }

    if (viewMode === "wysiwyg") {
      const inserted = richEditorRef.current?.insertMarkdown(imageDrop.markdown);
      return {
        insertedCount: inserted ? imageDrop.insertedCount : 0,
        skippedCount: imageDrop.skippedCount + (inserted ? 0 : imageDrop.insertedCount),
        blockedByUnsaved: false
      };
    }

    const view = currentActiveEditorView();
    const source = view?.state.doc.toString() ?? currentDocument.markdown;
    const range = view?.state.selection.main ?? selection;
    const edit = createDroppedImageTextEdit(source, { from: range.from, to: range.to }, imageDrop.markdown);
    if (!edit) {
      return {
        insertedCount: 0,
        skippedCount: paths.length,
        blockedByUnsaved: false
      };
    }

    if (view) {
      dispatchEditorTextEdit(view, edit);
      view.focus();
    } else {
      setDocumentState((current) => ({ ...current, markdown: edit.markdown }));
      setSelection(toSelectionState(edit.selection));
    }

    return {
      insertedCount: imageDrop.insertedCount,
      skippedCount: imageDrop.skippedCount,
      blockedByUnsaved: false
    };
  }

  function combineDropToasts(
    imageDropNotice: string,
    openedFileCount: number,
    workspaceName: string | null,
    skippedCount: number
  ): string {
    const openNotice = openedFileCount > 0 || workspaceName || skippedCount > 0 || !imageDropNotice
      ? droppedOpenToast(openedFileCount, workspaceName, skippedCount)
      : "";

    if (!imageDropNotice) return openNotice;
    if (!openNotice || openNotice === "No Markdown files found") return imageDropNotice;
    return `${imageDropNotice} - ${openNotice}`;
  }

  function hasFileDrag(event: ReactDragEvent<HTMLElement>): boolean {
    return Array.from(event.dataTransfer.types).includes("Files");
  }

  function handleShellDragEnter(event: ReactDragEvent<HTMLDivElement>) {
    if (!hasFileDrag(event)) return;
    event.preventDefault();
    browserDragDepthRef.current += 1;
    setDropOverlayActive(true);
  }

  function handleShellDragOver(event: ReactDragEvent<HTMLDivElement>) {
    if (!hasFileDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDropOverlayActive((current) => current ? current : true);
  }

  function handleShellDragLeave(event: ReactDragEvent<HTMLDivElement>) {
    if (!hasFileDrag(event)) return;
    browserDragDepthRef.current = Math.max(0, browserDragDepthRef.current - 1);
    if (browserDragDepthRef.current === 0) setDropOverlayActive(false);
  }

  function handleShellDrop(event: ReactDragEvent<HTMLDivElement>) {
    if (!hasFileDrag(event)) return;
    event.preventDefault();
    browserDragDepthRef.current = 0;
    setDropOverlayActive(false);

    if (isTauriRuntime()) return;
    if (event.dataTransfer.files.length > 0) {
      void openDroppedBrowserFiles(event.dataTransfer.files);
    }
  }

  function closeWorkspace() {
    setWorkspace(null);
    setWorkspaceQuery("");
    saveWorkspaceRoot(null);
    showToast("Workspace closed");
  }

  async function refreshWorkspace() {
    if (!workspace) return;
    await loadWorkspace(workspace.rootPath);
  }

  function focusWorkspaceFilter() {
    if (!workspace) {
      showToast("No folder open");
      return;
    }

    workspaceSearchRef.current?.focus();
    workspaceSearchRef.current?.select();
  }

  async function openWorkspaceFile(file: WorkspaceFile) {
    try {
      const opened = await readMarkdownPath(file.path);
      const result = openFileInTab(opened);
      setRecentFiles((current) => rememberRecentFile(current, opened.path, opened.name));
      showToast(openFileInTabToast(opened, result));
    } catch (error) {
      console.warn(error);
      showToast("Workspace file could not be opened");
    }
  }

  async function openRecentDocument(path: string) {
    try {
      const opened = await readMarkdownPath(path);
      const result = openFileInTab(opened);
      setRecentFiles((current) => rememberRecentFile(current, opened.path, opened.name));
      showToast(openFileInTabToast(opened, result));
    } catch (error) {
      console.warn(error);
      setRecentFiles((current) => forgetRecentFile(current, path));
      showToast("Recent file could not be opened");
    }
  }

  function removeRecentDocument(path: string) {
    setRecentFiles((current) => forgetRecentFile(current, path));
    showToast("Removed from recent files");
  }

  async function applyDiskFileToDocumentTab(
    tabId: string,
    expectedPath: string,
    opened: OpenedFile,
    replacementReason: "reload" | "recovery-discard" = "reload"
  ): Promise<boolean> {
    const session = currentTabSessionForRecovery();
    const liveTab = session.tabs.find((candidate) => candidate.id === tabId);
    if (
      session.activeTabId !== tabId
      || !liveTab?.document.filePath
      || !sameLocalPath(liveTab.document.filePath, expectedPath)
    ) {
      showToast("Reload canceled because the active file changed");
      return false;
    }

    const mustPreserveRecoveryContent = replacementReason === "recovery-discard"
      && liveTab.document.markdown !== opened.markdown;
    if (!await preserveDirtyDraftSnapshotBeforeReplace(
      liveTab.document,
      replacementReason,
      mustPreserveRecoveryContent,
      liveTab.id
    )) {
      await requestHistoryCleanup(
        "Reload canceled",
        "The required safety checkpoint could not be created. Open Version History to free space, then try again."
      );
      return false;
    }
    richDocumentHistoriesRef.current.delete(tabId);
    updateDocumentTab(tabId, {
      fileName: opened.name,
      filePath: opened.path,
      markdown: opened.markdown,
      lastSavedMarkdown: opened.markdown,
      lineEnding: opened.lineEnding,
      lastBackupPath: null,
      fileStats: opened.fileStats ?? null
    });
    clearManualPreviewSnapshot(tabId);
    setDocumentTabExternalChange(tabId, false);
    setExternalDiskReview((current) => current?.tabId === tabId ? null : current);
    setRecentFiles((current) => rememberRecentFile(current, opened.path, opened.name));
    return true;
  }

  async function reloadExternalDiskReview(review: ExternalDiskReviewState) {
    if (await applyDiskFileToDocumentTab(
      review.tabId,
      review.filePath,
      review.diskFile,
      review.replacementReason ?? "reload"
    )) {
      showToast(`Reloaded ${review.diskFile.name}`);
    }
  }

  function compareExternalDiskReview(review: ExternalDiskReviewState) {
    const session = currentTabSessionForRecovery();
    const liveTab = session.tabs.find((candidate) => candidate.id === review.tabId);
    if (
      session.activeTabId !== review.tabId
      || !liveTab?.document.filePath
      || !sameLocalPath(liveTab.document.filePath, review.filePath)
    ) {
      showToast("Comparison canceled because the active file changed");
      return;
    }
    if (
      new Blob([review.diskFile.markdown]).size > MAX_INTERACTIVE_BACKUP_COMPARE_BYTES
      || new Blob([liveTab.document.markdown]).size > MAX_INTERACTIVE_BACKUP_COMPARE_BYTES
    ) {
      showToast("Version is too large for interactive comparison");
      return;
    }

    setBackupComparison({
      restore: () => void reloadExternalDiskReview(review),
      tabId: review.tabId,
      versionMarkdown: liveTab.document.markdown,
      currentMarkdown: review.diskFile.markdown,
      currentName: displayMarkdownDocumentName(liveTab.document),
      versionLabel: displayMarkdownDocumentName(liveTab.document),
      currentLabel: review.filePath,
      versionTitle: "Current editor",
      currentTitle: "Disk version",
      actionLabel: "Reload from disk"
    });
  }

  async function compareDiskVersionWithEditor() {
    const tab = currentActiveDocumentTabForCommand();
    const document = tab.document;
    if (!document.filePath) {
      showToast("No saved file open");
      return;
    }

    try {
      const diskFile = await readMarkdownPath(document.filePath);
      const session = currentTabSessionForRecovery();
      const liveTab = session.tabs.find((candidate) => candidate.id === tab.id);
      if (
        session.activeTabId !== tab.id
        || !liveTab?.document.filePath
        || !sameLocalPath(liveTab.document.filePath, document.filePath)
      ) {
        showToast("Comparison canceled because the active file changed");
        return;
      }

      if (
        liveTab.document.fileStats
        && diskFile.fileStats
        && diskChangeKind(liveTab.document.fileStats, diskFile.fileStats, liveTab.document.lastSavedMarkdown, diskFile.markdown) !== "content"
      ) {
        updateDocumentTab(tab.id, (current) => ({
          ...current,
          fileStats: diskFile.fileStats
        }));
        setDocumentTabExternalChange(tab.id, false);
        showToast("Disk version is already current");
        return;
      }

      setDocumentTabExternalChange(tab.id, true);
      compareExternalDiskReview({
        tabId: tab.id,
        filePath: document.filePath,
        diskFile
      });
    } catch (error) {
      console.warn(error);
      showToast("Disk version could not be opened for comparison");
    }
  }

  async function reloadDocumentFromDisk() {
    const tab = currentActiveDocumentTabForCommand();
    const document = tab.document;
    if (!document.filePath) {
      showToast("No saved file open");
      return;
    }

    if (isDocumentDirty(document) && !await requestConfirmation({
      title: "Reload from disk?",
      message: "Reloading will replace the current unsaved editor content with the file currently on disk after creating a safety checkpoint.",
      confirmLabel: "Reload",
      cancelLabel: "Keep editing",
      tone: "danger"
    })) return;

    try {
      const opened = await readMarkdownPath(document.filePath);
      if (await applyDiskFileToDocumentTab(tab.id, document.filePath, opened)) showToast(`Reloaded ${opened.name}`);
    } catch (error) {
      console.warn(error);
      showToast("File could not be reloaded");
    }
  }

  async function openDiskVersionInNewTab() {
    const document = currentActiveDocumentTabForCommand().document;
    if (!document.filePath) {
      showToast("No saved file open");
      return;
    }
    try {
      const opened = await readMarkdownPath(document.filePath);
      openDiskVersionInDraftTab(opened);
      setRecentFiles((current) => rememberRecentFile(current, opened.path, opened.name));
      showToast(`Opened disk version of ${opened.name}`);
    } catch (error) {
      console.warn(error);
      showToast("Disk version could not be opened");
    }
  }

  function requestUnverifiedSaveConfirmation(tab: DocumentTab): Promise<boolean> {
    const document = tab.document;
    activateDocumentTab(tab.id);
    setDocumentTabExternalChange(tab.id, true);
    return requestConfirmation({
      title: `Save ${displayMarkdownDocumentName(document)} without disk check?`,
      message: "NyaMarkdownor could not verify the current file on disk. It may have been moved, deleted, locked, or changed by another app.",
      confirmLabel: "Save anyway",
      cancelLabel: "Cancel",
      tone: "danger"
    });
  }

  async function confirmSaveAgainstDiskVersion(tab: DocumentTab, interactive = true): Promise<SaveDiskCheck> {
    const document = tab.document;
    if (!document.filePath) return { expectedStats: null, overwriteExternal: false };
    if (!document.fileStats) {
      if (!interactive) {
        setDocumentTabExternalChange(tab.id, true);
        return false;
      }
      return await requestUnverifiedSaveConfirmation(tab)
        ? { expectedStats: null, overwriteExternal: true }
        : false;
    }

    try {
      const currentStats = await readMarkdownFileStats(document.filePath);
      const needsReview = diskNeedsReview(document.fileStats, currentStats);
      setDocumentTabExternalChange(tab.id, needsReview);
      if (!needsReview) return { expectedStats: currentStats, overwriteExternal: false };
      if (!currentStats) {
        if (!interactive) return false;
        return await requestUnverifiedSaveConfirmation(tab)
          ? { expectedStats: null, overwriteExternal: true }
          : false;
      }

      const diskFile = await readMarkdownPath(document.filePath);
      const confirmedStats = diskFile.fileStats ?? currentStats;
      if (diskChangeKind(document.fileStats, currentStats, document.lastSavedMarkdown, diskFile.markdown) !== "content") {
        updateDocumentTab(tab.id, (current) => ({
          ...current,
          fileStats: confirmedStats
        }));
        setDocumentTabExternalChange(tab.id, false);
        return { expectedStats: confirmedStats, overwriteExternal: false };
      }

      if (!interactive) return false;
      activateDocumentTab(tab.id);
      setDocumentTabExternalChange(tab.id, true);
      return await requestConfirmation({
        title: `Save ${displayMarkdownDocumentName(document)} over disk changes?`,
        message: "This file changed on disk since it was opened or last saved. NyaMarkdownor will back up the disk version before replacing it.",
        confirmLabel: "Save anyway",
        cancelLabel: "Review first",
        tone: "danger"
      }) ? { expectedStats: confirmedStats, overwriteExternal: true } : false;
    } catch (error) {
      console.warn(error);
      if (!interactive) {
        setDocumentTabExternalChange(tab.id, true);
        return false;
      }
      return await requestUnverifiedSaveConfirmation(tab)
        ? { expectedStats: null, overwriteExternal: true }
        : false;
    }
  }

  async function autoSaveDocumentTab(tab: DocumentTab): Promise<void> {
    if (!tab.document.filePath || autoSaveInFlightTabIdsRef.current.has(tab.id)) return;
    if (!shouldRetryAutoSave(autoSaveAttemptedMarkdownRef.current.get(tab.id), tab.document.markdown)) return;

    autoSaveAttemptedMarkdownRef.current.set(tab.id, tab.document.markdown);
    autoSaveInFlightTabIdsRef.current.add(tab.id);
    try {
      await saveDocumentTab(tab, { mode: "auto", announce: false });
    } finally {
      autoSaveInFlightTabIdsRef.current.delete(tab.id);
    }
  }

  async function saveDocument() {
    await saveDocumentTab(currentActiveDocumentTabForCommand(), { mode: "save", announce: true });
  }

  async function saveAllDocuments() {
    const { tabs: currentTabs } = currentTabSessionForRecovery();
    const dirtyTabs = dirtyDocuments(currentTabs);
    if (!dirtyTabs.length) {
      showToast("All tabs already saved");
      return;
    }

    let savedCount = 0;
    for (const tab of dirtyTabs) {
      const freshTab = currentTabSessionForRecovery().tabs.find((candidate) => candidate.id === tab.id);
      if (!freshTab || !isDocumentDirty(freshTab.document)) continue;

      const result = await saveDocumentTab(freshTab, { mode: "save", announce: false, fromSaveAll: true });
      if (result === "saved") {
        savedCount += 1;
        continue;
      }

      showToast(saveAllStoppedLabel(savedCount, result === "downloaded" ? "downloaded" : "canceled"));
      return;
    }

    showToast(savedTabsLabel(savedCount));
  }

  function commitSavedFileToTab(tab: DocumentTab, saved: OpenedFile): CommitSavedFileResult {
    const { tabs: currentTabs } = currentTabSessionForRecovery();
    const savedTab = currentTabs.find((candidate) => candidate.id === tab.id) ?? tab;
    const nextSavedTab: DocumentTab = {
      ...savedTab,
      document: applySavedFileToDocument(savedTab.document, saved)
    };
    const conflict = savedPathConflictingTab(currentTabs, savedTab.id, saved.path);

    if (!conflict) {
      setDocumentTabs((current) => current.map((candidate) => candidate.id === savedTab.id ? nextSavedTab : candidate));
      return { tab: nextSavedTab, conflictAction: null };
    }

    const conflictAction = savedPathConflictAction(conflict.document, saved.markdown);
    const nextTabs = currentTabs.flatMap((candidate) => {
      if (candidate.id === savedTab.id) return [nextSavedTab];
      if (candidate.id !== conflict.id) return [candidate];

      if (conflictAction === "detach-conflicting-tab") {
        preserveDocumentDraftSnapshot(conflict.document, "save-conflict", conflict.id);
        return [{
          ...candidate,
          document: {
            ...candidate.document,
            fileName: suggestedMarkdownCopyName(displayMarkdownDocumentName(candidate.document)),
            filePath: null,
            lastBackupPath: null,
            fileStats: null
          }
        }];
      }

      forgetEditorStateSnapshot(candidate.id);
      return [];
    });

    const activeAfterSave = activeTabIdRef.current === conflict.id && conflictAction === "close-conflicting-tab"
      ? savedTab.id
      : activeTabIdRef.current;
    commitDocumentTabSession(nextTabs, activeAfterSave, { focusEditor: false });
    if (conflictAction === "detach-conflicting-tab") setDocumentTabExternalChange(conflict.id, false);

    return {
      tab: nextSavedTab,
      conflictAction: conflictAction === "detach-conflicting-tab" ? "detached" : "closed"
    };
  }

  function savedFileToastLabel(saved: OpenedFile, conflictAction: CommitSavedFileResult["conflictAction"]): string {
    const baseLabel = saved.backupPath ? `Saved ${saved.name} with backup` : `Saved ${saved.name}`;
    if (conflictAction === "detached") return `${baseLabel}; kept other edit as draft`;
    if (conflictAction === "closed") return `${baseLabel}; merged duplicate tab`;
    return baseLabel;
  }

  async function saveDocumentTab(
    tab: DocumentTab,
    options: { mode: "auto" | "save" | "save-as"; announce: boolean; fromSaveAll?: boolean }
  ): Promise<SaveDocumentResult> {
    return queueKeyedTask(documentSaveQueueRef.current, tab.id, async () => {
      const freshTab = currentTabSessionForRecovery().tabs.find((candidate) => candidate.id === tab.id);
      if (!freshTab) return "canceled";
      return saveDocumentTabNow(freshTab, options);
    });
  }

  async function saveDocumentTabNow(
    tab: DocumentTab,
    options: { mode: "auto" | "save" | "save-as"; announce: boolean; fromSaveAll?: boolean }
  ): Promise<SaveDocumentResult> {
    if (options.mode === "save" && tab.document.filePath && !isDocumentDirty(tab.document)) {
      if (options.announce) showToast("No changes to save");
      return "saved";
    }

    const needsDiskCheck = options.mode === "save" || options.mode === "auto";
    const saveDiskCheck = needsDiskCheck ? await confirmSaveAgainstDiskVersion(tab, options.mode !== "auto") : null;
    if (saveDiskCheck === false) return "canceled";

    if (options.fromSaveAll && options.mode === "save" && !tab.document.filePath) {
      activateDocumentTab(tab.id);
    }

    const targetPath = options.mode === "save-as" ? null : tab.document.filePath;
    const backupKind = options.mode === "save-as" || saveDiskCheck?.overwriteExternal ? "safety" : "automatic";
    const suggestedTarget = options.mode === "save-as"
      ? suggestedMarkdownSaveAsTarget(tab.document)
      : displayMarkdownDocumentName(tab.document);
    const writeFile = (skipBackup = false) => saveMarkdownFile(
      targetPath,
      tab.document.markdown,
      suggestedTarget,
      saveDiskCheck?.expectedStats ?? null,
      tab.document.lineEnding,
      backupKind,
      backupPreferences,
      skipBackup
    );
    let saved: OpenedFile | null = null;
    try {
      saved = await writeFile();
    } catch (error) {
      console.warn(error);
      if (/file changed on disk before save/i.test(messageFromError(error))) {
        setDocumentTabExternalChange(tab.id, true);
      }
      if (isPersistentBackupFailure(error)) {
        if (options.mode === "auto") {
          showToast("Automatic save paused; version history storage needs attention");
          return "canceled";
        }

        activateDocumentTab(tab.id);
        const saveWithoutHistory = await requestConfirmation({
          title: "Save without version history?",
          message: "A recovery version could not be created. Open Version History to free space, save this file once without adding a history version, or cancel.",
          confirmLabel: "Save without history",
          cancelLabel: "Cancel save",
          alternateLabel: "Open Version History",
          onAlternate: openVersionHistoryManagement,
          tone: "danger"
        });
        if (!saveWithoutHistory) return "canceled";

        try {
          saved = await writeFile(true);
        } catch (retryError) {
          console.warn(retryError);
          if (/file changed on disk before save/i.test(messageFromError(retryError))) {
            setDocumentTabExternalChange(tab.id, true);
          }
          if (options.announce) {
            showToast(fileWriteFailureLabel(retryError, "File could not be saved"));
          }
          return "canceled";
        }
      } else {
        if (options.announce || options.mode === "auto") {
          showToast(fileWriteFailureLabel(error, "File could not be saved"));
        }
        return "canceled";
      }
    }

    if (!saved) return "canceled";

    if (!openedFileHasLocalBinding(saved)) {
      if (options.announce) {
        showToast("Downloaded copy; local file binding unavailable");
      }
      return "downloaded";
    }

    const commit = commitSavedFileToTab(tab, saved);
    setDocumentTabExternalChange(tab.id, false);
    setRecentFiles((current) => rememberRecentFile(current, saved.path, saved.name));
    if (options.announce) showToast(savedFileToastLabel(saved, commit.conflictAction));
    return "saved";
  }

  async function saveAsDocument() {
    await saveDocumentTab(currentActiveDocumentTabForCommand(), { mode: "save-as", announce: true });
  }

  async function saveCopyAsDocument() {
    const document = currentActiveDocumentTabForCommand().document;
    const writeCopy = (skipBackup = false) => saveMarkdownFile(
      null,
      document.markdown,
      suggestedMarkdownCopyTarget(document),
      null,
      document.lineEnding,
      "safety",
      backupPreferences,
      skipBackup
    );
    let saved: OpenedFile | null = null;
    try {
      saved = await writeCopy();
    } catch (error) {
      console.warn(error);
      if (!isPersistentBackupFailure(error) || !await requestConfirmation({
        title: "Save copy without version history?",
        message: "The target's previous content could not be added to version history. Open Version History to free space, overwrite the target once without adding a history version, or cancel.",
        confirmLabel: "Save without history",
        cancelLabel: "Cancel save",
        alternateLabel: "Open Version History",
        onAlternate: openVersionHistoryManagement,
        tone: "danger"
      })) {
        showToast(fileWriteFailureLabel(error, "Copy could not be saved"));
        return;
      }

      try {
        saved = await writeCopy(true);
      } catch (retryError) {
        console.warn(retryError);
        showToast(fileWriteFailureLabel(retryError, "Copy could not be saved"));
        return;
      }
    }

    if (!saved) return;

    showToast(openedFileHasLocalBinding(saved) ? (saved.backupPath ? `Saved copy ${saved.name} with backup` : `Saved copy ${saved.name}`) : `Downloaded copy ${saved.name}`);
  }

  async function exportHtmlDocument() {
    const document = currentActiveDocumentTabForCommand().document;
    const displayName = displayMarkdownDocumentName(document);
    const html = createExportHtmlDocument(document.markdown, {
      title: removeMarkdownFileExtension(displayName)
    });
    let saved: SavedExport | null = null;
    try {
      saved = await saveHtmlExport(html, displayName);
    } catch (error) {
      console.warn(error);
      showToast(fileWriteFailureLabel(error, "HTML export failed"));
      return;
    }

    if (!saved) return;

    showToast(`Exported ${saved.name}`);
  }

  async function preserveDirtyDraftSnapshotBeforeReplace(
    document = currentActiveDocumentTabForCommand().document,
    reason: "reload" | "restore" | "recovery-discard" = "restore",
    force = false,
    documentId = currentActiveDocumentTabForCommand().id
  ): Promise<boolean> {
    if (!force && !isDocumentDirty(document)) return true;
    return preserveDocumentSafetyCheckpoint(document, reason, documentId);
  }

  async function preserveDocumentSafetyCheckpoint(
    document: MarkdownDocument,
    reason: "close" | "reload" | "restore" | "recovery-discard" | "save-conflict" | "save-as-overwrite",
    documentId: string | null = null
  ): Promise<boolean> {
    try {
      await sealMarkdownBackupRolling(document.filePath, backupPreferences);
    } catch (error) {
      console.warn(error);
      return false;
    }
    const snapshot = createDraftSnapshot(document, Date.now(), reason, documentId);
    const currentSnapshots = draftSnapshotsRef.current;
    const duplicate = currentSnapshots.some((candidate) => (
      snapshotDocumentKey(candidate) === snapshotDocumentKey(snapshot)
      && candidate.contentHash === snapshot.contentHash
      && candidate.markdown === snapshot.markdown
    ));
    const next = rememberDraftSnapshot(currentSnapshots, snapshot, backupPreferences);
    if (next === currentSnapshots) return duplicate;
    if (!duplicate && !next.some((candidate) => candidate.id === snapshot.id)) return false;

    draftSnapshotsRef.current = next;
    setDraftSnapshots(next);
    return saveDraftSnapshotsImmediately(next);
  }

  function preserveDocumentDraftSnapshot(
    document: MarkdownDocument,
    reason: DraftSnapshot["reason"] = "save-conflict",
    documentId: string | null = null
  ): boolean {
    const snapshot = createDraftSnapshot(document, Date.now(), reason, documentId);
    const currentSnapshots = draftSnapshotsRef.current;
    const next = rememberDraftSnapshot(currentSnapshots, snapshot, backupPreferences);
    if (next === currentSnapshots) return false;

    draftSnapshotsRef.current = next;
    setDraftSnapshots(next);
    return saveDraftSnapshots(next);
  }

  function currentTabSessionForRecovery(): DocumentTabSession {
    richEditorRef.current?.flushMarkdownSync();
    const currentTabs = tabsRef.current;
    const currentActiveTabId = activeTabIdRef.current;
    return {
      tabs: documentTabsWithMountedEditorState(currentTabs),
      activeTabId: currentActiveTabId
    };
  }

  function documentTabsWithMountedEditorState(currentTabs: DocumentTab[]): DocumentTab[] {
    const view = editorViewRef.current;
    const viewTabId = editorViewTabIdRef.current;
    const viewMarkdown = view && viewTabId ? view.state.doc.toString() : undefined;
    const viewSnapshot = view && viewTabId ? createEditorStateSnapshot(view.state, getScrollProgress(view.scrollDOM)) : undefined;

    return documentTabsWithLiveEditorState(currentTabs, {
      tabId: viewTabId,
      markdown: viewMarkdown,
      editorStateSnapshot: viewSnapshot,
      storedEditorStateSnapshots: editorStateSnapshotsRef.current,
      storedRichScrollProgress: richScrollProgressRef.current,
      storedRichSelections: richSelectionsRef.current
    });
  }

  function currentActiveDocumentTabForCommand(): DocumentTab {
    const session = currentTabSessionForRecovery();
    return session.tabs.find((tab) => tab.id === session.activeTabId) ?? session.tabs[0] ?? activeTab;
  }

  function persistSynchronousUnloadRecovery(): void {
    const { tabs: currentTabs, activeTabId: currentActiveTabId } = currentTabSessionForRecovery();
    const activeDocument = activeDocumentFromSession({ tabs: currentTabs, activeTabId: currentActiveTabId }) ?? documentStateRef.current;

    saveDocumentTabsRecord(currentTabs, currentActiveTabId);
    saveDraftDocument(activeDocument);
    lastWorkRecoveryPersistedAtRef.current = Date.now();
  }

  async function persistWindowCloseRecovery(): Promise<void> {
    const { tabs: currentTabs, activeTabId: currentActiveTabId } = currentTabSessionForRecovery();
    const activeDocument = activeDocumentFromSession({ tabs: currentTabs, activeTabId: currentActiveTabId }) ?? documentStateRef.current;

    await Promise.all([
      saveDocumentTabsRecordImmediately(currentTabs, currentActiveTabId),
      saveDraftDocumentImmediately(activeDocument)
    ]);
    lastWorkRecoveryPersistedAtRef.current = Date.now();
  }

  async function createLocalSnapshot() {
    const tab = currentActiveDocumentTabForCommand();
    const document = tab.document;
    try {
      await sealMarkdownBackupRolling(document.filePath, backupPreferences);
    } catch (error) {
      console.warn(error);
      showToast("Checkpoint could not be saved");
      return;
    }

    const snapshot = createDraftSnapshot(document, Date.now(), "manual", tab.id);
    const currentSnapshots = draftSnapshotsRef.current;
    const duplicate = currentSnapshots.some((candidate) => (
      snapshotDocumentKey(candidate) === snapshotDocumentKey(snapshot)
      && candidate.contentHash === snapshot.contentHash
      && candidate.markdown === snapshot.markdown
    ));
    const next = rememberDraftSnapshot(currentSnapshots, snapshot, backupPreferences);
    const capacityCandidate = duplicate ? next : [...currentSnapshots, snapshot];
    if (applyDraftSnapshotRetention(capacityCandidate, backupPreferences, {
      candidateSnapshotIds: duplicate ? [] : [snapshot.id]
    }).capacityExceeded) {
      const openHistory = await requestConfirmation({
        title: "Checkpoint storage needs attention",
        message: "Manual checkpoints are kept until you remove them. Open Version History to free space before creating another checkpoint.",
        confirmLabel: "Open Version History",
        cancelLabel: "Cancel",
        tone: "danger"
      });
      if (openHistory) openVersionHistoryManagement();
      return;
    }

    if (next === currentSnapshots) {
      showToast("No new changes to checkpoint");
      return;
    }

    draftSnapshotsRef.current = next;
    setDraftSnapshots(next);
    const persisted = saveDraftSnapshots(next);
    showToast(persisted ? "Manual checkpoint saved" : "Checkpoint kept for this session only");
  }

  function currentEditorSelection(): { source: string; ranges: TextRange[]; primary: TextRange } {
    const view = currentActiveEditorView();
    if (!view) {
      return {
        source: currentActiveMarkdownForCommand(),
        ranges: selection.ranges,
        primary: { from: selection.from, to: selection.to }
      };
    }

    const primary = view.state.selection.main;
    return {
      source: view.state.doc.toString(),
      ranges: view.state.selection.ranges.map((range) => ({ from: range.from, to: range.to })),
      primary: { from: primary.from, to: primary.to }
    };
  }

  function currentTableContext(): TableActionContext | null {
    const { source, primary } = currentEditorSelection();
    return tableActionContextFromSelection(source, primary, activeTable);
  }

  function currentTableForClipboard(): TableBlock | null {
    return currentTableContext()?.table ?? null;
  }

  function currentReferenceLabels(): ReadonlySet<string> {
    return referenceLabelsFromMarkdown(currentEditorSelection().source);
  }

  async function copyMarkdown() {
    if (viewMode === "wysiwyg") {
      const content = richEditorRef.current?.getSelectionClipboardContent();
      if (!content) {
        showToast("Clipboard source is unavailable");
        return;
      }
      const mode = await copyRichContent({ plainText: content.markdown, markdown: content.markdown });
      showToast(mode ? (content.selected ? "Copied Markdown selection" : "Copied Markdown document") : "Clipboard write failed");
      return;
    }

    const { source, ranges } = currentEditorSelection();
    const copiedSelection = hasNonEmptySelection(ranges, source.length);
    const markdown = markdownFromSelectionRanges(source, ranges);
    const mode = await copyRichContent({ plainText: markdown, markdown });
    showToast(mode ? (copiedSelection ? "Copied Markdown selection" : "Copied Markdown document") : "Clipboard write failed");
  }

  async function copyPlainText() {
    if (viewMode === "wysiwyg") {
      const content = richEditorRef.current?.getSelectionClipboardContent();
      if (!content) {
        showToast("Clipboard source is unavailable");
        return;
      }
      const copied = await copyText(content.plainText);
      showToast(copied ? (content.selected ? "Copied clean text selection" : "Copied clean text document") : "Clipboard write failed");
      return;
    }

    const { source, ranges } = currentEditorSelection();
    const copiedSelection = hasNonEmptySelection(ranges, source.length);
    const payload = markdownRangesToClipboardPayload(source, selectionRangesOrWholeDocument(ranges, source.length));
    const copied = await copyText(payload.plainText);
    showToast(copied ? (copiedSelection ? "Copied clean text selection" : "Copied clean text document") : "Clipboard write failed");
  }

  async function copyActiveTableCell() {
    const tableActive = viewMode === "wysiwyg" ? richTableActive : Boolean(activeTable);
    if (!tableActive) {
      showToast("No table at cursor");
      return;
    }

    selectTableCell();
    await Promise.resolve();
    await copyPlainText();
  }

  async function copyDocumentPath() {
    const document = currentActiveDocumentTabForCommand().document;
    if (!document.filePath) {
      showToast("No file path yet");
      return;
    }

    const copied = await copyText(document.filePath);
    showToast(copied ? "Copied file path" : "Clipboard write failed");
  }

  async function revealDocumentInFolder() {
    const document = currentActiveDocumentTabForCommand().document;
    if (!document.filePath) {
      showToast("No file path yet");
      return;
    }

    try {
      await revealMarkdownFile(document.filePath);
      showToast("Revealed file in folder");
    } catch (error) {
      console.warn(error);
      showToast(isTauriRuntime() ? "File could not be revealed" : "Desktop app required to reveal files");
    }
  }

  async function manageFileAssociations(scope: FileAssociationScope) {
    try {
      await manageFileAssociation(scope);
      showToast("Opened system file association settings");
    } catch (error) {
      console.warn(error);
      showToast("File association settings could not be opened");
    }
  }

  async function copySelectionAsCsv() {
    if (viewMode === "wysiwyg") {
      const table = richEditorRef.current?.getTableClipboardContent();
      if (!table) {
        showToast("Place the cursor in a table or select table cells");
        return;
      }
      const copied = await copyText(table.csv);
      showToast(copied ? (table.selected ? "Copied table selection as CSV" : "Copied table as CSV") : "Clipboard write failed");
      return;
    }

    const { source, ranges } = currentEditorSelection();
    const csv = markdownRangesToTableCsv(source, ranges);

    if (csv === null) {
      showToast("Select table cells to copy as CSV");
      return;
    }

    const copied = await copyText(csv);
    showToast(copied ? "Copied selection as CSV" : "Clipboard write failed");
  }

  async function copySelectionAsTsv() {
    if (viewMode === "wysiwyg") {
      const table = richEditorRef.current?.getTableClipboardContent();
      if (!table) {
        showToast("Place the cursor in a table or select table cells");
        return;
      }
      const copied = await copyText(table.tsv);
      showToast(copied ? (table.selected ? "Copied table selection as TSV" : "Copied table as TSV") : "Clipboard write failed");
      return;
    }

    const { source, ranges } = currentEditorSelection();
    const tsv = markdownRangesToTableTsv(source, ranges);

    if (tsv === null) {
      showToast("Select table cells to copy as TSV");
      return;
    }

    const copied = await copyText(tsv);
    showToast(copied ? "Copied selection as TSV" : "Clipboard write failed");
  }

  async function copySelectionAsMarkdownTable() {
    if (viewMode === "wysiwyg") {
      const table = richEditorRef.current?.getTableClipboardContent();
      if (!table) {
        showToast("Place the cursor in a table or select table cells");
        return;
      }
      const copied = await copyText(table.markdown);
      showToast(copied ? (table.selected ? "Copied table selection as Markdown table" : "Copied table as Markdown table") : "Clipboard write failed");
      return;
    }

    const { source, ranges } = currentEditorSelection();
    const markdownTable = markdownRangesToTableMarkdown(source, ranges);

    if (!markdownTable) {
      showToast("Select table cells to copy as Markdown table");
      return;
    }

    const copied = await copyText(markdownTable);
    showToast(copied ? "Copied selection as Markdown table" : "Clipboard write failed");
  }

  async function copyRichText() {
    if (viewMode === "wysiwyg") {
      const content = richEditorRef.current?.getSelectionClipboardContent();
      if (!content) {
        showToast("Clipboard source is unavailable");
        return;
      }
      const mode = await copyRichContent(content);
      showToast(mode ? (content.selected ? "Copied rich selection" : "Copied rich document") : "Clipboard write failed");
      return;
    }

    const { source, ranges } = currentEditorSelection();
    const copiedSelection = hasNonEmptySelection(ranges, source.length);
    const mode = await copyRichContent(markdownRangesToClipboardPayload(source, selectionRangesOrWholeDocument(ranges, source.length)));

    showToast(mode ? (copiedSelection ? "Copied rich selection" : "Copied rich document") : "Clipboard write failed");
  }

  async function copyCurrentTable() {
    if (viewMode === "wysiwyg") {
      const table = richEditorRef.current?.getTableClipboardContent();
      if (!table) {
        showToast("No table at cursor");
        return;
      }
      const mode = await copyRichContent({ plainText: table.plainText, markdown: table.markdown, html: table.html });
      showToast(mode ? (table.selected ? "Copied table selection" : "Copied table") : "Clipboard write failed");
      return;
    }

    const tableBlock = currentTableForClipboard();
    if (!tableBlock) {
      showToast("No table at cursor");
      return;
    }

    const rowPositions = allTableRowPositions(tableBlock);
    const payload = markdownTableSliceToClipboardPayload(tableBlock.table, rowPositions, undefined, currentReferenceLabels());
    const mode = payload ? await copyRichContent(payload) : null;
    showToast(mode ? "Copied table" : "Clipboard write failed");
  }

  async function copyCurrentTableAsCsv() {
    if (viewMode === "wysiwyg") {
      const table = richEditorRef.current?.getTableClipboardContent();
      if (!table) {
        showToast("No table at cursor");
        return;
      }
      const copied = await copyText(table.csv);
      showToast(copied ? (table.selected ? "Copied table selection as CSV" : "Copied table as CSV") : "Clipboard write failed");
      return;
    }

    const tableBlock = currentTableForClipboard();
    if (!tableBlock) {
      showToast("No table at cursor");
      return;
    }

    const copied = await copyTableSliceAsCsv(tableBlock, allTableRowPositions(tableBlock));
    showToast(copied ? "Copied table as CSV" : "Clipboard write failed");
  }

  async function copyCurrentTableAsTsv() {
    if (viewMode === "wysiwyg") {
      const table = richEditorRef.current?.getTableClipboardContent();
      if (!table) {
        showToast("No table at cursor");
        return;
      }
      const copied = await copyText(table.tsv);
      showToast(copied ? (table.selected ? "Copied table selection as TSV" : "Copied table as TSV") : "Clipboard write failed");
      return;
    }

    const tableBlock = currentTableForClipboard();
    if (!tableBlock) {
      showToast("No table at cursor");
      return;
    }

    const copied = await copyTableSliceAsTsv(tableBlock, allTableRowPositions(tableBlock));
    showToast(copied ? "Copied table as TSV" : "Clipboard write failed");
  }

  async function copyCurrentTableAsMarkdownTable() {
    if (viewMode === "wysiwyg") {
      const table = richEditorRef.current?.getTableClipboardContent();
      if (!table) {
        showToast("No table at cursor");
        return;
      }
      const copied = await copyText(table.markdown);
      showToast(copied ? (table.selected ? "Copied table selection as Markdown table" : "Copied table as Markdown table") : "Clipboard write failed");
      return;
    }

    const tableBlock = currentTableForClipboard();
    if (!tableBlock) {
      showToast("No table at cursor");
      return;
    }

    const copied = await copyTableSliceAsMarkdownTable(tableBlock, allTableRowPositions(tableBlock));
    showToast(copied ? "Copied table as Markdown table" : "Clipboard write failed");
  }

  async function copyCurrentTableHeader() {
    const tableBlock = currentTableForClipboard();
    if (!tableBlock) {
      showToast("No table at cursor");
      return;
    }

    const payload = markdownTableSliceToClipboardPayload(tableBlock.table, [0], undefined, currentReferenceLabels());
    const mode = payload ? await copyRichContent(payload) : null;
    showToast(mode ? "Copied table header" : "Clipboard write failed");
  }

  async function copyCurrentTableHeaderAsCsv() {
    const tableBlock = currentTableForClipboard();
    if (!tableBlock) {
      showToast("No table at cursor");
      return;
    }

    const copied = await copyTableSliceAsCsv(tableBlock, [0]);
    showToast(copied ? "Copied table header as CSV" : "Clipboard write failed");
  }

  async function copyCurrentTableHeaderAsTsv() {
    const tableBlock = currentTableForClipboard();
    if (!tableBlock) {
      showToast("No table at cursor");
      return;
    }

    const copied = await copyTableSliceAsTsv(tableBlock, [0]);
    showToast(copied ? "Copied table header as TSV" : "Clipboard write failed");
  }

  async function copyCurrentTableHeaderAsMarkdownTable() {
    const tableBlock = currentTableForClipboard();
    if (!tableBlock) {
      showToast("No table at cursor");
      return;
    }

    const copied = await copyTableSliceAsMarkdownTable(tableBlock, [0]);
    showToast(copied ? "Copied table header as Markdown table" : "Clipboard write failed");
  }

  async function copyCurrentTableBody() {
    const tableBlock = currentTableForClipboard();
    if (!tableBlock) {
      showToast("No table at cursor");
      return;
    }

    const rowPositions = tableBodyRowPositions(tableBlock);
    if (!rowPositions.length) {
      showToast("Table has no body rows");
      return;
    }

    const payload = markdownTableSliceToClipboardPayload(tableBlock.table, rowPositions, undefined, currentReferenceLabels());
    const mode = payload ? await copyRichContent(payload) : null;
    showToast(mode ? "Copied table body" : "Clipboard write failed");
  }

  async function copyCurrentTableBodyAsCsv() {
    const tableBlock = currentTableForClipboard();
    if (!tableBlock) {
      showToast("No table at cursor");
      return;
    }

    const rowPositions = tableBodyRowPositions(tableBlock);
    if (!rowPositions.length) {
      showToast("Table has no body rows");
      return;
    }

    const copied = await copyTableSliceAsCsv(tableBlock, rowPositions);
    showToast(copied ? "Copied table body as CSV" : "Clipboard write failed");
  }

  async function copyCurrentTableBodyAsTsv() {
    const tableBlock = currentTableForClipboard();
    if (!tableBlock) {
      showToast("No table at cursor");
      return;
    }

    const rowPositions = tableBodyRowPositions(tableBlock);
    if (!rowPositions.length) {
      showToast("Table has no body rows");
      return;
    }

    const copied = await copyTableSliceAsTsv(tableBlock, rowPositions);
    showToast(copied ? "Copied table body as TSV" : "Clipboard write failed");
  }

  async function copyCurrentTableBodyAsMarkdownTable() {
    const tableBlock = currentTableForClipboard();
    if (!tableBlock) {
      showToast("No table at cursor");
      return;
    }

    const rowPositions = tableBodyRowPositions(tableBlock);
    if (!rowPositions.length) {
      showToast("Table has no body rows");
      return;
    }

    const copied = await copyTableSliceAsMarkdownTable(tableBlock, rowPositions);
    showToast(copied ? "Copied table body as Markdown table" : "Clipboard write failed");
  }

  async function copyActiveTableRow() {
    const tableBlock = currentTableForClipboard();
    if (!tableBlock) {
      showToast("No table at cursor");
      return;
    }

    if (tableBlock.position.row === 1) {
      showToast("Move the cursor into a table row");
      return;
    }

    const payload = markdownTableSliceToClipboardPayload(tableBlock.table, [tableBlock.position.row], undefined, currentReferenceLabels());
    const mode = payload ? await copyRichContent(payload) : null;
    showToast(mode ? "Copied table row" : "Clipboard write failed");
  }

  async function copyActiveTableRowAsCsv() {
    const tableBlock = currentTableForClipboard();
    if (!tableBlock) {
      showToast("No table at cursor");
      return;
    }

    if (tableBlock.position.row === 1) {
      showToast("Move the cursor into a table row");
      return;
    }

    const copied = await copyTableSliceAsCsv(tableBlock, [tableBlock.position.row]);
    showToast(copied ? "Copied table row as CSV" : "Clipboard write failed");
  }

  async function copyActiveTableRowAsTsv() {
    const tableBlock = currentTableForClipboard();
    if (!tableBlock) {
      showToast("No table at cursor");
      return;
    }

    if (tableBlock.position.row === 1) {
      showToast("Move the cursor into a table row");
      return;
    }

    const copied = await copyTableSliceAsTsv(tableBlock, [tableBlock.position.row]);
    showToast(copied ? "Copied table row as TSV" : "Clipboard write failed");
  }

  async function copyActiveTableRowAsMarkdownTable() {
    const tableBlock = currentTableForClipboard();
    if (!tableBlock) {
      showToast("No table at cursor");
      return;
    }

    if (tableBlock.position.row === 1) {
      showToast("Move the cursor into a table row");
      return;
    }

    const copied = await copyTableSliceAsMarkdownTable(tableBlock, [tableBlock.position.row]);
    showToast(copied ? "Copied table row as Markdown table" : "Clipboard write failed");
  }

  async function copyActiveTableColumn() {
    const tableBlock = currentTableForClipboard();
    if (!tableBlock) {
      showToast("No table at cursor");
      return;
    }

    await copyTableColumn(tableBlock.position.col, tableBlock);
  }

  async function copyActiveTableColumnBody() {
    const tableBlock = currentTableForClipboard();
    if (!tableBlock) {
      showToast("No table at cursor");
      return;
    }

    await copyTableColumnBody(tableBlock.position.col, tableBlock);
  }

  async function copyActiveTableColumnAsCsv() {
    const tableBlock = currentTableForClipboard();
    if (!tableBlock) {
      showToast("No table at cursor");
      return;
    }

    const copied = await copyTableColumnAsCsv(tableBlock.position.col, tableBlock);
    showToast(copied ? "Copied table column as CSV" : "Clipboard write failed");
  }

  async function copyActiveTableColumnAsTsv() {
    const tableBlock = currentTableForClipboard();
    if (!tableBlock) {
      showToast("No table at cursor");
      return;
    }

    const copied = await copyTableColumnAsTsv(tableBlock.position.col, tableBlock);
    showToast(copied ? "Copied table column as TSV" : "Clipboard write failed");
  }

  async function copyActiveTableColumnAsMarkdownTable() {
    const tableBlock = currentTableForClipboard();
    if (!tableBlock) {
      showToast("No table at cursor");
      return;
    }

    const copied = await copyTableColumnAsMarkdownTable(tableBlock.position.col, tableBlock);
    showToast(copied ? "Copied table column as Markdown table" : "Clipboard write failed");
  }

  async function copyActiveTableColumnBodyAsCsv() {
    const tableBlock = currentTableForClipboard();
    if (!tableBlock) {
      showToast("No table at cursor");
      return;
    }

    const copied = await copyTableColumnBodyAsCsv(tableBlock.position.col, tableBlock);
    showToast(copied ? "Copied table column body as CSV" : "Clipboard write failed");
  }

  async function copyActiveTableColumnBodyAsTsv() {
    const tableBlock = currentTableForClipboard();
    if (!tableBlock) {
      showToast("No table at cursor");
      return;
    }

    const copied = await copyTableColumnBodyAsTsv(tableBlock.position.col, tableBlock);
    showToast(copied ? "Copied table column body as TSV" : "Clipboard write failed");
  }

  async function copyActiveTableColumnBodyAsMarkdownTable() {
    const tableBlock = currentTableForClipboard();
    if (!tableBlock) {
      showToast("No table at cursor");
      return;
    }

    const copied = await copyTableColumnBodyAsMarkdownTable(tableBlock.position.col, tableBlock);
    showToast(copied ? "Copied table column body as Markdown table" : "Clipboard write failed");
  }

  async function copyTableColumn(col: number, tableBlock = currentTableForClipboard()) {
    if (!tableBlock) {
      showToast("No table at cursor");
      return;
    }

    const rowPositions = allTableRowPositions(tableBlock);
    const payload = markdownTableSliceToClipboardPayload(tableBlock.table, rowPositions, [col], currentReferenceLabels());
    const mode = payload ? await copyRichContent(payload) : null;
    showToast(mode ? "Copied table column" : "Clipboard write failed");
  }

  async function copyTableColumnBody(col: number, tableBlock = currentTableForClipboard()) {
    if (!tableBlock) {
      showToast("No table at cursor");
      return;
    }

    const rowPositions = tableBodyRowPositions(tableBlock);
    if (!rowPositions.length) {
      showToast("Table has no body rows");
      return;
    }

    const payload = markdownTableSliceToClipboardPayload(tableBlock.table, rowPositions, [col], currentReferenceLabels());
    const mode = payload ? await copyRichContent(payload) : null;
    showToast(mode ? "Copied table column body" : "Clipboard write failed");
  }

  async function copyTableColumnAsCsv(col: number, tableBlock = currentTableForClipboard()): Promise<boolean> {
    if (!tableBlock) return false;
    return copyTableSliceAsCsv(tableBlock, allTableRowPositions(tableBlock), [col]);
  }

  async function copyTableColumnAsTsv(col: number, tableBlock = currentTableForClipboard()): Promise<boolean> {
    if (!tableBlock) return false;
    return copyTableSliceAsTsv(tableBlock, allTableRowPositions(tableBlock), [col]);
  }

  async function copyTableColumnAsMarkdownTable(col: number, tableBlock = currentTableForClipboard()): Promise<boolean> {
    if (!tableBlock) return false;
    return copyTableSliceAsMarkdownTable(tableBlock, allTableRowPositions(tableBlock), [col]);
  }

  async function copyTableColumnBodyAsCsv(col: number, tableBlock = currentTableForClipboard()): Promise<boolean> {
    if (!tableBlock) return false;
    const rowPositions = tableBodyRowPositions(tableBlock);
    return rowPositions.length ? copyTableSliceAsCsv(tableBlock, rowPositions, [col]) : false;
  }

  async function copyTableColumnBodyAsTsv(col: number, tableBlock = currentTableForClipboard()): Promise<boolean> {
    if (!tableBlock) return false;
    const rowPositions = tableBodyRowPositions(tableBlock);
    return rowPositions.length ? copyTableSliceAsTsv(tableBlock, rowPositions, [col]) : false;
  }

  async function copyTableColumnBodyAsMarkdownTable(col: number, tableBlock = currentTableForClipboard()): Promise<boolean> {
    if (!tableBlock) return false;
    const rowPositions = tableBodyRowPositions(tableBlock);
    return rowPositions.length ? copyTableSliceAsMarkdownTable(tableBlock, rowPositions, [col]) : false;
  }

  async function copyTableSliceAsCsv(tableBlock: TableBlock, rowPositions: number[], columnIndexes?: number[]): Promise<boolean> {
    const csv = markdownTableSliceToCsv(tableBlock.table, rowPositions, columnIndexes, currentReferenceLabels());
    return csv !== null ? copyText(csv) : false;
  }

  async function copyTableSliceAsTsv(tableBlock: TableBlock, rowPositions: number[], columnIndexes?: number[]): Promise<boolean> {
    const tsv = markdownTableSliceToTsv(tableBlock.table, rowPositions, columnIndexes, currentReferenceLabels());
    return tsv !== null ? copyText(tsv) : false;
  }

  async function copyTableSliceAsMarkdownTable(tableBlock: TableBlock, rowPositions: number[], columnIndexes?: number[]): Promise<boolean> {
    const markdownTable = markdownTableSliceToMarkdown(tableBlock.table, rowPositions, columnIndexes);
    return markdownTable !== null ? copyText(markdownTable) : false;
  }

  async function compareBackup(backup: MarkdownBackup) {
    const tab = currentActiveDocumentTabForCommand();
    const document = tab.document;
    if (!document.filePath) {
      showToast("No saved file open");
      return;
    }
    if (
      backup.size > MAX_INTERACTIVE_BACKUP_COMPARE_BYTES
      || new Blob([document.markdown]).size > MAX_INTERACTIVE_BACKUP_COMPARE_BYTES
    ) {
      showToast("Version is too large for interactive comparison");
      return;
    }

    try {
      const restored = await readMarkdownBackup(document.filePath, backup.path, backupPreferences);
      const liveSession = currentTabSessionForRecovery();
      const liveTab = liveSession.tabs.find((candidate) => candidate.id === tab.id);
      if (
        liveSession.activeTabId !== tab.id
        || !liveTab?.document.filePath
        || !sameLocalPath(liveTab.document.filePath, document.filePath)
      ) {
        showToast("Comparison canceled because the active file changed");
        return;
      }
      if (new Blob([liveTab.document.markdown]).size > MAX_INTERACTIVE_BACKUP_COMPARE_BYTES) {
        showToast("Version is too large for interactive comparison");
        return;
      }

      setBackupComparison({
        restore: () => void restoreBackup(backup, document.filePath ?? undefined, tab.id),
        tabId: tab.id,
        versionMarkdown: restored.markdown,
        currentMarkdown: liveTab.document.markdown,
        currentName: displayMarkdownDocumentName(liveTab.document),
        versionLabel: `${formatBackupTime(backup.modifiedMs)} - ${t(backupKindMessage(backup.kind))}`
      });
    } catch (error) {
      console.warn(error);
      showToast("Backup could not be opened for comparison");
    }
  }

  async function restoreBackup(backup: MarkdownBackup, expectedSourcePath?: string, expectedTabId?: string) {
    const tab = currentActiveDocumentTabForCommand();
    const document = tab.document;
    if (!document.filePath) {
      showToast("No saved file open");
      return;
    }
    if (expectedSourcePath && !sameLocalPath(document.filePath, expectedSourcePath)) {
      showToast("The comparison belongs to another file");
      return;
    }
    if (expectedTabId && tab.id !== expectedTabId) {
      showToast("The comparison belongs to another tab");
      return;
    }

    try {
      const restored = await readMarkdownBackup(document.filePath, backup.path, backupPreferences);
      const loadedSession = currentTabSessionForRecovery();
      const loadedTab = loadedSession.tabs.find((candidate) => candidate.id === tab.id);
      if (
        loadedSession.activeTabId !== tab.id
        || !loadedTab?.document.filePath
        || !sameLocalPath(loadedTab.document.filePath, document.filePath)
      ) {
        showToast("Restore canceled because the active file changed");
        return;
      }

      if (isDocumentDirty(loadedTab.document) && !await requestConfirmation({
        title: "Restore this backup?",
        message: "Restoring will replace the current unsaved editor content with this version after creating a safety checkpoint.",
        confirmLabel: "Restore backup",
        cancelLabel: "Keep editing",
        tone: "danger"
      })) return;

      const finalSession = currentTabSessionForRecovery();
      const finalTab = finalSession.tabs.find((candidate) => candidate.id === tab.id);
      if (
        finalSession.activeTabId !== tab.id
        || !finalTab?.document.filePath
        || !sameLocalPath(finalTab.document.filePath, document.filePath)
      ) {
        showToast("Restore canceled because the active file changed");
        return;
      }

      if (!await preserveDirtyDraftSnapshotBeforeReplace(finalTab.document, "restore", false, finalTab.id)) {
        await requestHistoryCleanup(
          "Restore canceled",
          "The required safety checkpoint could not be created. Open Version History to free space, then try again."
        );
        return;
      }
      richDocumentHistoriesRef.current.delete(tab.id);
      updateDocumentTab(tab.id, (current) => ({
        ...current,
        fileName: restored.name,
        filePath: restored.path,
        markdown: restored.markdown,
        lineEnding: restored.lineEnding,
        lastBackupPath: backup.path,
        fileStats: restored.fileStats ?? current.fileStats ?? null
      }));
      clearManualPreviewSnapshot(tab.id);
      showToast("Backup restored into editor");
    } catch (error) {
      console.warn(error);
      showToast("Backup could not be restored");
    }
  }

  async function refreshFileHistoryDocuments() {
    if (!desktopRuntime) return;
    try {
      setBackupHistories(await listMarkdownBackupHistories(backupPreferences, historyKnownSourcePaths));
    } catch (error) {
      console.warn(error);
    }
  }

  async function loadManagedFileHistoryVersions(document: FileHistoryDocument): Promise<MarkdownBackup[]> {
    if (!document.filePath) return [];
    return listMarkdownBackups(document.filePath, backupPreferences);
  }

  async function readManagedHistoryVersion(
    document: FileHistoryDocument,
    version: FileHistoryVersion
  ): Promise<HistoryComparisonContent> {
    if (version.source === "local") {
      return {
        markdown: version.snapshot.markdown,
        label: `${formatBackupTime(version.timestamp)} - ${t(draftSnapshotCheckpointMessage(version.snapshot))}`,
        title: "Historical version"
      };
    }
    if (!document.filePath) throw new Error("Disk history has no source path");

    const restored = await readMarkdownBackup(document.filePath, version.backup.path, backupPreferences);
    return {
      markdown: restored.markdown,
      label: `${formatBackupTime(version.timestamp)} - ${t(backupKindMessage(version.backup.kind))}`,
      title: "Historical version"
    };
  }

  function openManagedHistoryVersionAsDraft(document: FileHistoryDocument, version: FileHistoryVersion) {
    if (version.source === "disk") {
      void openManagedDiskVersionAsDraft(document, version.backup);
      return;
    }
    openManagedSnapshotAsDraft(version.snapshot);
  }

  function openTabForManagedHistory(document: FileHistoryDocument): DocumentTab | null {
    const session = currentTabSessionForRecovery();
    return session.tabs.find((tab) => document.filePath
      ? sameLocalPath(tab.document.filePath, document.filePath)
      : fileHistoryDocumentKey({
          ...tab.document,
          documentId: tab.id
        }) === document.key) ?? null;
  }

  function editorComparisonContent(tab: DocumentTab): HistoryComparisonContent {
    return {
      markdown: tab.document.markdown,
      label: tab.document.filePath ?? displayMarkdownDocumentName(tab.document),
      title: isDocumentDirty(tab.document) ? "Unsaved editor content" : "Saved editor content"
    };
  }

  async function chooseManagedCurrentContent(
    tab: DocumentTab,
    diskFile: OpenedFile
  ): Promise<HistoryComparisonContent | null> {
    let editorSelected = false;
    const diskSelected = await requestConfirmation({
      title: "Choose current content for comparison",
      message: "The open editor and disk file have different current content. Choose the comparison baseline. This choice does not overwrite either version.",
      confirmLabel: "Use disk content",
      cancelLabel: "Cancel comparison",
      alternateLabel: "Use editor content",
      onAlternate: () => {
        editorSelected = true;
      }
    });
    if (diskSelected) {
      return {
        markdown: diskFile.markdown,
        label: diskFile.path ?? tab.document.filePath ?? diskFile.name,
        title: "Current disk content"
      };
    }
    return editorSelected ? editorComparisonContent(tab) : null;
  }

  async function currentContentForManagedHistory(
    document: FileHistoryDocument
  ): Promise<HistoryComparisonContent | null> {
    const openTab = openTabForManagedHistory(document);
    if (!openTab) {
      if (!document.filePath || document.sourceState === "missing") {
        showToast("Current content is unavailable; select two history versions instead");
        return null;
      }
      const diskFile = await readMarkdownPath(document.filePath);
      return {
        markdown: diskFile.markdown,
        label: document.filePath,
        title: "Current disk content"
      };
    }

    if (!openTab.document.filePath) return editorComparisonContent(openTab);

    let diskFile: OpenedFile;
    try {
      diskFile = await readMarkdownPath(openTab.document.filePath);
    } catch (error) {
      if (externalChangeTabIds.has(openTab.id) || !openTab.document.fileStats) {
        console.warn(error);
        const useEditor = await requestConfirmation({
          title: "Disk content is unavailable",
          message: "The disk file could not be read, so its current content cannot be used for comparison. Continue with the open editor content?",
          confirmLabel: "Use editor content",
          cancelLabel: "Cancel comparison"
        });
        return useEditor ? editorComparisonContent(openTab) : null;
      }
      return editorComparisonContent(openTab);
    }

    const diskContentChanged = diskChangeKind(
      openTab.document.fileStats,
      diskFile.fileStats,
      openTab.document.lastSavedMarkdown,
      diskFile.markdown
    ) === "content";
    const currentContentDiffers = diskFile.markdown !== openTab.document.markdown;
    if (currentContentDiffers && (diskContentChanged || externalChangeTabIds.has(openTab.id))) {
      return chooseManagedCurrentContent(openTab, diskFile);
    }
    return editorComparisonContent(openTab);
  }

  async function compareManagedHistoryVersions(
    document: FileHistoryDocument,
    selectedVersions: FileHistoryVersion[]
  ) {
    if (selectedVersions.length < 1 || selectedVersions.length > 2) return;
    if (selectedVersions.some((version) => (
      version.source === "disk" ? version.backup.size : version.snapshot.size
    ) > MAX_INTERACTIVE_BACKUP_COMPARE_BYTES)) {
      showToast("Version is too large for interactive comparison");
      return;
    }

    try {
      const orderedVersions = orderFileHistoryVersionsOldestFirst(selectedVersions);
      const loadedVersions = await Promise.all(orderedVersions.map((version) => (
        readManagedHistoryVersion(document, version)
      )));
      if (loadedVersions.some((version) => (
        new Blob([version.markdown]).size > MAX_INTERACTIVE_BACKUP_COMPARE_BYTES
      ))) {
        showToast("Version is too large for interactive comparison");
        return;
      }

      if (loadedVersions.length === 2) {
        setBackupComparison({
          restore: () => undefined,
          tabId: document.key,
          versionMarkdown: loadedVersions[0].markdown,
          currentMarkdown: loadedVersions[1].markdown,
          currentName: document.fileName,
          versionLabel: loadedVersions[0].label,
          currentLabel: loadedVersions[1].label,
          versionTitle: "Earlier history version",
          currentTitle: "Later history version",
          showAction: false
        });
        return;
      }

      const current = await currentContentForManagedHistory(document);
      if (!current) return;
      if (new Blob([current.markdown]).size > MAX_INTERACTIVE_BACKUP_COMPARE_BYTES) {
        showToast("Version is too large for interactive comparison");
        return;
      }
      const selectedVersion = orderedVersions[0];
      setBackupComparison({
        restore: () => openManagedHistoryVersionAsDraft(document, selectedVersion),
        tabId: document.key,
        versionMarkdown: loadedVersions[0].markdown,
        currentMarkdown: current.markdown,
        currentName: document.fileName,
        versionLabel: loadedVersions[0].label,
        currentLabel: current.label,
        versionTitle: loadedVersions[0].title,
        currentTitle: current.title,
        actionLabel: "Open version as draft",
        actionIcon: "open"
      });
    } catch (error) {
      console.warn(error);
      showToast("History version could not be opened for comparison");
    }
  }

  async function openManagedDiskVersionAsDraft(document: FileHistoryDocument, backup: MarkdownBackup) {
    if (!document.filePath) return;
    try {
      const restored = await readMarkdownBackup(document.filePath, backup.path, backupPreferences);
      addDocumentTab({
        fileName: document.fileName,
        filePath: null,
        markdown: restored.markdown,
        lastSavedMarkdown: restored.markdown,
        lineEnding: restored.lineEnding,
        lastBackupPath: null,
        fileStats: null
      });
      setHistoryManagerOpen(false);
      showToast("Opened backup as draft");
    } catch (error) {
      console.warn(error);
      showToast("Backup could not be opened");
    }
  }

  function openManagedSnapshotAsDraft(snapshot: DraftSnapshot) {
    openDraftSnapshotAsNewTab(snapshot);
    setHistoryManagerOpen(false);
  }

  async function deleteManagedFileHistory(document: FileHistoryDocument): Promise<boolean> {
    if (!await requestConfirmation({
      title: "Delete all history for this document?",
      message: "This permanently deletes every retained disk version and local checkpoint for this document. The source file and current editor content will not change.",
      confirmLabel: "Delete all history",
      cancelLabel: "Cancel",
      tone: "danger"
    })) return false;

    const result = await performDeleteManagedFileHistories([document]);
    const deleted = result.deletedKeys.includes(document.key);
    showToast(deleted
      ? result.localPersisted
        ? "Document history deleted"
        : "Disk history deleted; local checkpoints were removed for this session only"
      : "Document history could not be deleted");
    return deleted;
  }

  async function deleteManagedFileHistories(documents: FileHistoryDocument[]): Promise<string[]> {
    if (documents.length === 0 || !await requestConfirmation({
      title: t("Delete {count} selected document histories?", { count: documents.length }),
      message: t("This permanently deletes all retained versions for the selected documents. Source files and current editor content will not change."),
      confirmLabel: t("Delete selected history"),
      cancelLabel: t("Cancel"),
      tone: "danger"
    })) return [];

    const result = await performDeleteManagedFileHistories(documents);
    if (result.deletedKeys.length === documents.length) {
      showToast(t("Deleted history for {count} documents", { count: result.deletedKeys.length }));
    } else if (result.deletedKeys.length > 0) {
      showToast(t("Deleted history for {deleted} of {count} documents", {
        deleted: result.deletedKeys.length,
        count: documents.length
      }));
    } else {
      showToast("Document history could not be deleted");
    }
    return result.deletedKeys;
  }

  async function performDeleteManagedFileHistories(documents: FileHistoryDocument[]): Promise<{
    deletedKeys: string[];
    localPersisted: boolean;
  }> {
    const diskResults = await Promise.all(documents.map(async (document) => {
      if (!document.filePath || !document.diskHistory) return { document, deleted: true };
      try {
        await deleteMarkdownBackupHistory(document.filePath, backupPreferences);
        return { document, deleted: true };
      } catch (error) {
        console.warn(error);
        return { document, deleted: false };
      }
    }));
    const deletedKeys = diskResults
      .filter((result) => result.deleted)
      .map((result) => result.document.key);
    const deletedDiskPaths = diskResults
      .filter((result) => result.deleted && result.document.filePath && result.document.diskHistory)
      .map((result) => result.document.filePath!);
    const targetKeys = new Set(deletedKeys);
    const currentSnapshots = draftSnapshotsRef.current;
    let nextSnapshots = currentSnapshots;
    for (const documentKey of targetKeys) {
      nextSnapshots = removeSnapshotsForDocument(nextSnapshots, documentKey);
    }
    const snapshotsChanged = nextSnapshots.length !== currentSnapshots.length;
    if (snapshotsChanged) {
      draftSnapshotsRef.current = nextSnapshots;
      setDraftSnapshots(nextSnapshots);
    }
    const localPersisted = !snapshotsChanged || saveDraftSnapshots(nextSnapshots);

    if (deletedDiskPaths.length > 0) {
      setBackupHistories((current) => current.filter((history) => (
        !deletedDiskPaths.some((path) => sameLocalPath(history.sourcePath, path))
      )));
      if (documentState.filePath && deletedDiskPaths.some((path) => sameLocalPath(documentState.filePath!, path))) {
        setBackups([]);
      }
    }
    await refreshFileHistoryDocuments();
    return { deletedKeys, localPersisted };
  }

  async function deleteManagedDiskVersion(document: FileHistoryDocument, backup: MarkdownBackup): Promise<boolean> {
    if (!document.filePath) return false;
    if (!await requestConfirmation({
      title: "Delete this version?",
      message: "This permanently deletes the selected retained version. The source file and current editor content will not change.",
      confirmLabel: "Delete version",
      cancelLabel: "Cancel",
      tone: "danger"
    })) return false;

    const result = await performDeleteManagedVersions(document, [{
      source: "disk",
      timestamp: backup.updatedAtMs ?? backup.modifiedMs,
      backup
    }]);
    const deleted = result.deletedDiskPaths.includes(backup.path);
    showToast(deleted ? "Version deleted" : "Version could not be deleted");
    return deleted;
  }

  async function deleteManagedVersions(
    document: FileHistoryDocument,
    versions: FileHistoryVersion[]
  ): Promise<FileHistoryVersionDeleteResult> {
    if (versions.length === 0 || !await requestConfirmation({
      title: t("Delete {count} selected versions?", { count: versions.length }),
      message: t("This permanently deletes the selected retained versions. The source file and current editor content will not change."),
      confirmLabel: t("Delete selected versions"),
      cancelLabel: t("Cancel"),
      tone: "danger"
    })) return { deletedDiskPaths: [], deletedSnapshotIds: [] };

    const result = await performDeleteManagedVersions(document, versions);
    const deletedCount = result.deletedDiskPaths.length + result.deletedSnapshotIds.length;
    if (deletedCount === versions.length) {
      showToast(t("Deleted {count} versions", { count: deletedCount }));
    } else if (deletedCount > 0) {
      showToast(t("Deleted {deleted} of {count} versions", { deleted: deletedCount, count: versions.length }));
    } else {
      showToast("Version could not be deleted");
    }
    return result;
  }

  async function performDeleteManagedVersions(
    document: FileHistoryDocument,
    versions: FileHistoryVersion[]
  ): Promise<FileHistoryVersionDeleteResult> {
    const diskVersions = versions.filter((version) => version.source === "disk");
    const diskResults = await Promise.all(diskVersions.map(async (version) => {
      if (!document.filePath) return { path: version.backup.path, deleted: false };
      try {
        await deleteMarkdownBackup(document.filePath, version.backup.path, backupPreferences);
        return { path: version.backup.path, deleted: true };
      } catch (error) {
        console.warn(error);
        return { path: version.backup.path, deleted: false };
      }
    }));
    const deletedDiskPaths = diskResults
      .filter((result) => result.deleted)
      .map((result) => result.path);
    const deletedSnapshotIds = versions
      .filter((version) => version.source === "local")
      .map((version) => version.snapshot.id);

    if (deletedSnapshotIds.length > 0) {
      const ids = new Set(deletedSnapshotIds);
      const nextSnapshots = draftSnapshotsRef.current.filter((snapshot) => !ids.has(snapshot.id));
      draftSnapshotsRef.current = nextSnapshots;
      setDraftSnapshots(nextSnapshots);
      saveDraftSnapshots(nextSnapshots);
    }
    if (deletedDiskPaths.length > 0 && document.filePath && documentState.filePath
      && sameLocalPath(document.filePath, documentState.filePath)) {
      const paths = new Set(deletedDiskPaths);
      setBackups((current) => current.filter((candidate) => !paths.has(candidate.path)));
    }
    await refreshFileHistoryDocuments();
    return { deletedDiskPaths, deletedSnapshotIds };
  }

  async function restoreDraftSnapshot(snapshot: DraftSnapshot, expectedTabId?: string) {
    const session = currentTabSessionForRecovery();
    const tab = session.tabs.find((candidate) => candidate.id === session.activeTabId) ?? session.tabs[0] ?? activeTab;
    const document = tab.document;
    if (
      (expectedTabId && tab.id !== expectedTabId)
      || snapshotDocumentKey({ ...document, documentId: tab.id }) !== snapshotDocumentKey(snapshot)
    ) {
      showToast("The comparison belongs to another document");
      return;
    }

    if (isDocumentDirty(document) && !await requestConfirmation({
      title: "Restore this checkpoint?",
      message: "Restoring will replace the current unsaved editor content with the selected checkpoint after creating a safety checkpoint of the current editor content.",
      confirmLabel: "Restore snapshot",
      cancelLabel: "Keep editing",
      tone: "danger"
    })) return;

    const finalSession = currentTabSessionForRecovery();
    const finalTab = finalSession.tabs.find((candidate) => candidate.id === tab.id);
    if (
      finalSession.activeTabId !== tab.id
      || !finalTab
      || snapshotDocumentKey({ ...finalTab.document, documentId: finalTab.id }) !== snapshotDocumentKey(snapshot)
    ) {
      showToast("Restore canceled because the active file changed");
      return;
    }

    if (!await preserveDirtyDraftSnapshotBeforeReplace(finalTab.document, "restore", false, finalTab.id)) {
      await requestHistoryCleanup(
        "Restore canceled",
        "The required safety checkpoint could not be created. Open Version History to free space, then try again."
      );
      return;
    }

    richDocumentHistoriesRef.current.delete(tab.id);
    updateDocumentTab(tab.id, {
      fileName: finalTab.document.fileName,
      filePath: finalTab.document.filePath,
      markdown: snapshot.markdown,
      lastSavedMarkdown: finalTab.document.lastSavedMarkdown,
      lineEnding: snapshot.lineEnding,
      lastBackupPath: null,
      fileStats: finalTab.document.fileStats ?? null
    });
    clearManualPreviewSnapshot(tab.id);
    showToast("Checkpoint restored into editor");
  }

  function compareDraftSnapshot(snapshot: DraftSnapshot) {
    const tab = currentActiveDocumentTabForCommand();
    const document = tab.document;
    if (
      snapshot.size > MAX_INTERACTIVE_BACKUP_COMPARE_BYTES
      || new Blob([document.markdown]).size > MAX_INTERACTIVE_BACKUP_COMPARE_BYTES
    ) {
      showToast("Version is too large for interactive comparison");
      return;
    }

    setBackupComparison({
      restore: () => void restoreDraftSnapshot(snapshot, tab.id),
      tabId: tab.id,
      versionMarkdown: snapshot.markdown,
      currentMarkdown: document.markdown,
      currentName: displayMarkdownDocumentName(document),
      versionLabel: `${formatBackupTime(snapshot.createdAt)} - ${t(draftSnapshotCheckpointMessage(snapshot))}`
    });
  }

  function openDraftSnapshotAsNewTab(snapshot: DraftSnapshot) {
    addDocumentTab({
      fileName: `Recovered ${snapshot.fileName}`,
      filePath: null,
      markdown: snapshot.markdown,
      lastSavedMarkdown: snapshot.markdown,
      lineEnding: snapshot.lineEnding,
      lastBackupPath: null,
      fileStats: null
    });
    showToast("Opened local checkpoint as draft");
  }

  async function deleteDraftSnapshot(snapshot: DraftSnapshot): Promise<boolean> {
    if (!await requestConfirmation({
      title: "Delete this checkpoint?",
      message: "This removes the checkpoint from this device. The current editor content will not change.",
      confirmLabel: "Delete snapshot",
      cancelLabel: "Cancel",
      tone: "danger"
    })) return false;

    const next = forgetDraftSnapshot(draftSnapshotsRef.current, snapshot.id);
    draftSnapshotsRef.current = next;
    setDraftSnapshots(next);
    const persisted = saveDraftSnapshots(next);
    showToast(persisted ? "Checkpoint deleted" : "Checkpoint removed for this session only");
    return true;
  }

  function replaceActiveTable(nextMarkdown: string, position = activeTable?.position) {
    const context = currentTableContext();
    if (!context) return;

    const tableBlock = context.table;
    const targetPosition = position ?? tableBlock.position;
    const trailingBreak = tableBlock.endOffset < context.source.length ? "\n" : "";
    const view = currentActiveEditorView();
    const nextSelection = selectTableCellInMarkdownTable(
      nextMarkdown,
      tableBlock.startOffset,
      targetPosition.row,
      targetPosition.col
    );

    if (view) {
      view.dispatch({
        changes: { from: tableBlock.startOffset, to: tableBlock.endOffset, insert: `${nextMarkdown}${trailingBreak}` },
        selection: nextSelection ? { anchor: nextSelection.from, head: nextSelection.to } : undefined
      });
      return;
    }

    const before = context.source.slice(0, tableBlock.startOffset);
    const after = context.source.slice(tableBlock.endOffset);
    setMarkdown(`${before}${nextMarkdown}${trailingBreak}${after}`);
  }

  function replaceActiveTableModel(nextTable: MarkdownTable, position = activeTable?.position) {
    replaceActiveTable(buildMarkdownTable(nextTable), position);
  }

  function normalizeTable() {
    runTableCommand("normalize");
  }

  function addRow() {
    runTableCommand("add-row");
  }

  function addRowBefore() {
    runTableCommand("add-row-before");
  }

  function addColumn() {
    runTableCommand("add-column");
  }

  function addColumnBefore() {
    runTableCommand("add-column-before");
  }

  function removeRow() {
    runTableCommand("delete-row");
  }

  function removeColumn() {
    runTableCommand("delete-column");
  }

  function removeTable() {
    runTableCommand("delete-table");
  }

  function duplicateRow() {
    runTableCommand("duplicate-row");
  }

  function duplicateColumn() {
    runTableCommand("duplicate-column");
  }

  function moveRowUp() {
    runTableCommand("move-row-up");
  }

  function moveRowDown() {
    runTableCommand("move-row-down");
  }

  function moveColumnLeft() {
    runTableCommand("move-column-left");
  }

  function moveColumnRight() {
    runTableCommand("move-column-right");
  }

  function selectTableCell() {
    runTableSelectionCommand("select-cell");
  }

  function selectTableRow() {
    runTableRowSelectionCommand();
  }

  function selectTableColumn() {
    runTableColumnSelectionCommand();
  }

  function selectTableColumnBody() {
    runTableColumnBodySelectionCommand();
  }

  function selectTableHeader() {
    runTableHeaderSelectionCommand();
  }

  function selectActiveTable() {
    runTableContentSelectionCommand();
  }

  function selectTableBody() {
    runTableBodySelectionCommand();
  }

  function canRunTableSelectionShortcut(shortcut: TableSelectionShortcut): boolean {
    if (viewMode === "wysiwyg") {
      return richTableActive && (shortcut === "cell" || shortcut === "row" || shortcut === "column" || shortcut === "table");
    }

    const tableBlock = currentTableContext()?.table;
    if (!tableBlock) return false;

    switch (shortcut) {
      case "row":
        return tableBlock.position.row !== 1;
      case "body":
      case "column-body":
        return tableBlock.table.rows.length > 0;
      case "cell":
      case "column":
      case "header":
      case "table":
        return true;
    }
  }

  function runTableSelectionShortcut(shortcut: TableSelectionShortcut) {
    switch (shortcut) {
      case "cell":
        selectTableCell();
        return;
      case "row":
        selectTableRow();
        return;
      case "column":
        selectTableColumn();
        return;
      case "column-body":
        selectTableColumnBody();
        return;
      case "header":
        selectTableHeader();
        return;
      case "body":
        selectTableBody();
        return;
      case "table":
        selectActiveTable();
        return;
    }
  }

  function sortColumnAscending() {
    if (viewMode === "wysiwyg") {
      const applied = richEditorRef.current?.sortCurrentTableColumn("ascending");
      showToast(applied ? tableCommandLabel("sort-column-asc") : tableCommandUnavailableLabel("sort-column-asc"));
      return;
    }

    runTableCommand("sort-column-asc");
  }

  function sortColumnDescending() {
    if (viewMode === "wysiwyg") {
      const applied = richEditorRef.current?.sortCurrentTableColumn("descending");
      showToast(applied ? tableCommandLabel("sort-column-desc") : tableCommandUnavailableLabel("sort-column-desc"));
      return;
    }

    runTableCommand("sort-column-desc");
  }

  function selectTableRowByIndex(rowIndex: number) {
    if (!currentTableContext()) {
      showToast("No table at cursor");
      return;
    }

    runTableRowSelectionCommand(rowIndex + 2);
  }

  async function copyTableRowByIndex(rowIndex: number) {
    const tableBlock = currentTableContext()?.table;
    if (!tableBlock) {
      showToast("No table at cursor");
      return;
    }

    const payload = markdownTableSliceToClipboardPayload(tableBlock.table, [rowIndex + 2], undefined, currentReferenceLabels());
    const mode = payload ? await copyRichContent(payload) : null;
    showToast(mode ? "Copied table row" : "Clipboard write failed");
  }

  function insertTableRowAfter(rowIndex: number) {
    const tableBlock = currentTableContext()?.table;
    if (!tableBlock) {
      showToast("No table at cursor");
      return;
    }

    const insertAt = rowIndex + 1;
    const targetPosition = {
      row: insertAt + 2,
      col: tableBlock.position.col
    };
    replaceActiveTableModel(insertTableRowModel(tableBlock.table, insertAt), targetPosition);
    focusTableInspectorSourcePosition(targetPosition);
    showToast("Row inserted");
  }

  function insertTableRowBefore(rowIndex: number) {
    const tableBlock = currentTableContext()?.table;
    if (!tableBlock) {
      showToast("No table at cursor");
      return;
    }

    const insertAt = rowIndex;
    const targetPosition = {
      row: insertAt + 2,
      col: tableBlock.position.col
    };
    replaceActiveTableModel(insertTableRowModel(tableBlock.table, insertAt), targetPosition);
    focusTableInspectorSourcePosition(targetPosition);
    showToast("Row inserted");
  }

  function duplicateTableRowAt(rowIndex: number) {
    const tableBlock = currentTableContext()?.table;
    if (!tableBlock) {
      showToast("No table at cursor");
      return;
    }

    const targetPosition = {
      row: rowIndex + 3,
      col: tableBlock.position.col
    };
    replaceActiveTableModel(duplicateTableRowModel(tableBlock.table, rowIndex), targetPosition);
    focusTableInspectorSourcePosition(targetPosition);
    showToast("Row duplicated");
  }

  function moveTableRowAt(rowIndex: number, direction: -1 | 1) {
    const tableBlock = currentTableContext()?.table;
    if (!tableBlock) {
      showToast("No table at cursor");
      return;
    }

    const nextRowIndex = rowIndex + direction;
    if (nextRowIndex < 0 || nextRowIndex >= tableBlock.table.rows.length) {
      showToast(direction < 0 ? "Row is already at the top" : "Row is already at the bottom");
      return;
    }

    const targetPosition = {
      row: nextRowIndex + 2,
      col: tableBlock.position.col
    };
    replaceActiveTableModel(moveTableRowModel(tableBlock.table, rowIndex, direction), targetPosition);
    focusTableInspectorSourcePosition(targetPosition);
    showToast(direction < 0 ? "Row moved up" : "Row moved down");
  }

  function deleteTableRowAt(rowIndex: number) {
    const tableBlock = currentTableContext()?.table;
    if (!tableBlock) {
      showToast("No table at cursor");
      return;
    }

    const nextTable = deleteTableRowModel(tableBlock.table, rowIndex);
    const nextRow = nextTable.rows.length ? Math.min(rowIndex, nextTable.rows.length - 1) + 2 : 0;
    const targetPosition = {
      row: nextRow,
      col: tableBlock.position.col
    };
    replaceActiveTableModel(nextTable, targetPosition);
    focusTableInspectorSourcePosition(targetPosition);
    showToast("Row deleted");
  }

  function insertTableColumnAfter(col: number) {
    const tableBlock = currentTableContext()?.table;
    if (!tableBlock) {
      showToast("No table at cursor");
      return;
    }

    const insertAt = col + 1;
    const targetPosition = focusableTableSourcePosition({
      row: tableBlock.position.row,
      col: insertAt
    });
    replaceActiveTableModel(insertTableColumnModel(tableBlock.table, insertAt), targetPosition);
    focusTableInspectorSourcePosition(targetPosition);
    showToast("Column inserted");
  }

  function insertTableColumnBefore(col: number) {
    const tableBlock = currentTableContext()?.table;
    if (!tableBlock) {
      showToast("No table at cursor");
      return;
    }

    const insertAt = col;
    const targetPosition = focusableTableSourcePosition({
      row: tableBlock.position.row,
      col: insertAt
    });
    replaceActiveTableModel(insertTableColumnModel(tableBlock.table, insertAt), targetPosition);
    focusTableInspectorSourcePosition(targetPosition);
    showToast("Column inserted");
  }

  function duplicateTableColumnAt(col: number) {
    const tableBlock = currentTableContext()?.table;
    if (!tableBlock) {
      showToast("No table at cursor");
      return;
    }

    const targetPosition = focusableTableSourcePosition({
      row: tableBlock.position.row,
      col: col + 1
    });
    replaceActiveTableModel(duplicateTableColumnModel(tableBlock.table, col), targetPosition);
    focusTableInspectorSourcePosition(targetPosition);
    showToast("Column duplicated");
  }

  function moveTableColumnAt(col: number, direction: -1 | 1) {
    const tableBlock = currentTableContext()?.table;
    if (!tableBlock) {
      showToast("No table at cursor");
      return;
    }

    const nextCol = col + direction;
    if (nextCol < 0 || nextCol >= tableBlock.table.headers.length) {
      showToast(direction < 0 ? "Column is already at the left edge" : "Column is already at the right edge");
      return;
    }

    const targetPosition = focusableTableSourcePosition({
      row: tableBlock.position.row,
      col: nextCol
    });
    replaceActiveTableModel(moveTableColumnModel(tableBlock.table, col, direction), targetPosition);
    focusTableInspectorSourcePosition(targetPosition);
    showToast(direction < 0 ? "Column moved left" : "Column moved right");
  }

  function deleteTableColumnAt(col: number) {
    const tableBlock = currentTableContext()?.table;
    if (!tableBlock) {
      showToast("No table at cursor");
      return;
    }

    if (tableBlock.table.headers.length <= 1) {
      showToast("Table needs at least two columns");
      return;
    }

    const nextTable = deleteTableColumnModel(tableBlock.table, col);
    const targetPosition = focusableTableSourcePosition({
      row: tableBlock.position.row,
      col: Math.min(col, nextTable.headers.length - 1)
    });
    replaceActiveTableModel(nextTable, targetPosition);
    focusTableInspectorSourcePosition(targetPosition);
    showToast("Column deleted");
  }

  function sortTableColumn(col: number, direction: TableSortDirection) {
    const tableBlock = currentTableContext()?.table;
    if (!tableBlock) {
      showToast("No table at cursor");
      return;
    }

    if (tableBlock.table.rows.length < 2) {
      showToast("Need at least two rows to sort");
      return;
    }

    const order = getSortedTableRowOrder(tableBlock.table, col, direction);
    const currentDataRow = tableBlock.position.row >= 2 ? tableBlock.position.row - 2 : -1;
    const nextRow = currentDataRow >= 0 ? order.indexOf(currentDataRow) + 2 : tableBlock.position.row;
    const targetPosition = focusableTableSourcePosition({
      row: nextRow,
      col
    });

    replaceActiveTable(buildMarkdownTable(sortTableRows(tableBlock.table, col, direction)), targetPosition);
    focusTableInspectorSourcePosition(targetPosition);
    showToast(direction === "ascending" ? "Column sorted ascending" : "Column sorted descending");
  }

  function editTableCell(row: number, col: number, value: string) {
    const tableBlock = currentTableContext()?.table;
    if (!tableBlock) return;
    replaceActiveTable(
      buildMarkdownTable(updateTableCell(tableBlock.table, row, col, value)),
      tableSourcePositionForInspectorCell(row, col)
    );
  }

  function focusTableInspectorCell(rowIndex: number, colIndex: number, options: { select?: boolean; caret?: number } = {}) {
    window.requestAnimationFrame(() => {
      const input = tableInspectorRef.current?.querySelector<HTMLInputElement>(
        `input[data-table-cell-row="${rowIndex}"][data-table-cell-col="${colIndex}"]`
      );
      input?.focus();
      if (typeof options.caret === "number") {
        input?.setSelectionRange(options.caret, options.caret);
      } else if (options.select ?? true) {
        input?.select();
      }
    });
  }

  function focusTableInspectorSourcePosition(position: { row: number; col: number }) {
    const focusPosition = focusableTableSourcePosition(position);
    const rowIndex = inspectorRowIndexForTableSourceRow(focusPosition.row);
    if (rowIndex === null) return;
    focusTableInspectorCell(rowIndex, focusPosition.col);
  }

  function selectTableInspectorCellInSource(rowIndex: number, colIndex: number) {
    const context = currentTableContext();
    if (!context) return;

    const view = currentActiveEditorView();
    if (!view) return;

    const tableBlock = context.table;
    const position = tableSourcePositionForInspectorCell(rowIndex, colIndex);
    const tableMarkdown = context.source.slice(tableBlock.startOffset, tableBlock.endOffset).replace(/\n$/, "");
    const nextSelection = selectTableCellInMarkdownTable(tableMarkdown, tableBlock.startOffset, position.row, position.col);
    if (!nextSelection) return;

    view.dispatch({
      selection: { anchor: nextSelection.from, head: nextSelection.to },
      effects: EditorView.scrollIntoView(nextSelection.from, { y: "nearest" })
    });
  }

  function navigateTableInspectorCell(rowIndex: number, colIndex: number, direction: TableInspectorNavigationDirection): boolean {
    const tableBlock = currentTableContext()?.table;
    if (!tableBlock) return false;

    const bodyRowCount = tableBlock.table.rows.length;
    const columnCount = tableBlock.table.headers.length;
    const next = nextTableInspectorCellPosition(
      { rowIndex, colIndex },
      direction,
      bodyRowCount,
      columnCount
    );
    if (!next) {
      const appended = appendedTableInspectorRowTarget({ rowIndex, colIndex }, direction, bodyRowCount, columnCount);
      if (!appended) return false;

      replaceActiveTableModel(insertTableRowModel(tableBlock.table, bodyRowCount), tableSourcePositionForInspectorCell(appended.rowIndex, appended.colIndex));
      focusTableInspectorCell(appended.rowIndex, appended.colIndex);
      showToast("Row added");
      return true;
    }

    selectTableInspectorCellInSource(next.rowIndex, next.colIndex);
    focusTableInspectorCell(next.rowIndex, next.colIndex);
    return true;
  }

  function handleTableInspectorCellKeyDown(event: ReactKeyboardEvent<HTMLInputElement>, rowIndex: number, colIndex: number) {
    const keyState = {
      key: event.key,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
      isComposing: event.nativeEvent.isComposing,
      keyCode: event.nativeEvent.keyCode
    };
    if (isTableInspectorComposingKeyEvent(keyState)) return;

    if (isTableInspectorCellBreakKey(keyState)) {
      const input = event.currentTarget;
      const edit = insertSerializedTableCellBreak(input.value, input.selectionStart, input.selectionEnd);
      editTableCell(rowIndex, colIndex, edit.value);
      focusTableInspectorCell(rowIndex, colIndex, { select: false, caret: edit.caret });
      event.preventDefault();
      showToast("Cell line break inserted");
      return;
    }

    const direction = tableInspectorNavigationDirectionFromKey(keyState);
    if (!direction) return;
    if (!navigateTableInspectorCell(rowIndex, colIndex, direction)) return;

    event.preventDefault();
  }

  function handleTableInspectorCellPaste(event: ReactClipboardEvent<HTMLInputElement>, rowIndex: number, colIndex: number) {
    const tableBlock = currentTableContext()?.table;
    if (!tableBlock) return;

    const tablePaste = clipboardRowsForTablePaste({
      text: event.clipboardData.getData("text/plain"),
      html: event.clipboardData.getData("text/html"),
      markdown: event.clipboardData.getData("text/markdown")
    });
    if (!tablePaste) return;

    const start = tableSourcePositionForInspectorCell(rowIndex, colIndex);
    const nextTable = fillTableCells(tableBlock.table, start.row, start.col, tablePaste.rows);
    const lastRowOffset = tablePaste.rows.length - 1;
    const lastColOffset = Math.max(0, (tablePaste.rows[tablePaste.rows.length - 1]?.length ?? 1) - 1);
    const nextPosition = {
      row: tableSourceRowForPastedOffset(start.row, lastRowOffset),
      col: start.col + lastColOffset
    };

    replaceActiveTableModel(nextTable, nextPosition);
    focusTableInspectorSourcePosition(nextPosition);
    event.preventDefault();
    showToast(t("Filled table from {source}", { source: t(clipboardTableSourceLabel(tablePaste.source)) }));
  }

  function alignTableColumn(col: number, alignment: TableAlignment) {
    const tableBlock = currentTableContext()?.table;
    if (!tableBlock) return;

    const targetPosition = focusableTableSourcePosition({
      row: tableBlock.position.row,
      col
    });
    replaceActiveTable(buildMarkdownTable(setColumnAlignment(tableBlock.table, col, alignment)), targetPosition);
    focusTableInspectorSourcePosition(targetPosition);
    showToast(columnAlignmentLabel(alignment));
  }

  function alignActiveColumn(alignment: TableAlignment) {
    if (viewMode === "wysiwyg") {
      const applied = richEditorRef.current?.alignCurrentTableColumn(alignment === "none" ? null : alignment);
      showToast(applied ? columnAlignmentLabel(alignment) : "No table at cursor");
      return;
    }

    const tableBlock = currentTableContext()?.table;
    if (!tableBlock) {
      showToast("No table at cursor");
      return;
    }

    alignTableColumn(tableBlock.position.col, alignment);
  }

  function jumpToLine(line: number) {
    const view = currentActiveEditorView();
    if (!view) return;

    const targetLine = view.state.doc.line(Math.min(line + 1, view.state.doc.lines));
    view.dispatch({
      selection: { anchor: targetLine.from },
      effects: EditorView.scrollIntoView(targetLine.from, { y: "start" })
    });
    view.focus();
  }

  function scrollPreviewHeadingIntoView(headingId: string) {
    const preview = previewRef.current;
    if (!preview) return false;

    const target = Array.from(preview.querySelectorAll<HTMLElement>("[id]")).find((element) => element.id === headingId);
    if (!target) return false;

    target.scrollIntoView({ block: "start", behavior: "smooth" });
    return true;
  }

  function jumpToOutlineHeading(heading: Heading, headingIndex: number) {
    if (viewMode === "wysiwyg") {
      if (!richEditorRef.current?.scrollToHeading(headingIndex)) showToast("Heading not found");
      return;
    }

    if (viewMode === "preview") {
      if (!scrollPreviewHeadingIntoView(heading.id)) showToast("Heading not found");
      return;
    }

    if (viewMode === "split") scrollSyncSourceRef.current = "preview";
    jumpToLine(heading.line);

    if (viewMode === "split") {
      window.requestAnimationFrame(() => {
        scrollPreviewHeadingIntoView(heading.id);
        releaseScrollSyncSoon("preview");
      });
    }
  }

  function jumpToLineSoon(tabId: string, line: number) {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (activeTabIdRef.current === tabId) jumpToLine(line);
      });
    });
  }

  useEffect(() => {
    function handleGlobalKeyDown(event: KeyboardEvent) {
      if (confirmation) {
        if (event.key === "Escape") {
          event.preventDefault();
          settleConfirmation(false);
        }
        return;
      }

      if (backupComparison) return;

      if (tableSizeDialogOpen) {
        if (event.key === "Escape") {
          event.preventDefault();
          setTableSizeDialogOpen(false);
        }
        return;
      }

      if (linkDialogState) return;

      if (areAppShortcutsBlocked({
        commandPaletteOpen,
        settingsOpen,
        historyManagerOpen,
        externalDiskReviewOpen: Boolean(externalDiskReview)
      })) return;

      if (viewMenuOpen && event.key === "Escape") {
        event.preventDefault();
        setViewMenuOpen(false);
        window.requestAnimationFrame(() => viewMenuTriggerRef.current?.focus());
        return;
      }

      if (event.key === "Escape") {
        const focusedToolbarMenu = document.activeElement instanceof Element
          ? document.activeElement.closest<HTMLDetailsElement>(".toolbar-action-menu-wrap, .table-action-menu-wrap")
          : null;
        if (closeOpenToolbarMenus()) {
          event.preventDefault();
          focusedToolbarMenu?.querySelector<HTMLElement>("summary")?.focus();
          return;
        }
      }

      if (event.key === "F3") {
        event.preventDefault();
        goToFindMatch(event.shiftKey ? "previous" : "next");
        return;
      }

      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;
      const key = event.key.toLowerCase();

      const tabNavigationShortcut = getTabNavigationShortcut(event);
      if (tabNavigationShortcut) {
        event.preventDefault();
        runTabNavigationShortcut(tabNavigationShortcut);
        return;
      }

      if (event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }

      if (!event.shiftKey && !event.altKey && key === "p") {
        event.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }

      if (event.shiftKey && key === "o" && !event.altKey) {
        event.preventDefault();
        void openWorkspace();
        return;
      }

      if (event.altKey && !event.shiftKey && key === "o") {
        event.preventDefault();
        focusWorkspaceFilter();
        return;
      }

      if (!event.altKey && key === "f") {
        event.preventDefault();
        openFindPanel(false);
        return;
      }

      if (!event.altKey && key === "h") {
        event.preventDefault();
        openFindPanel(true);
        return;
      }

      if (event.key === ",") {
        event.preventDefault();
        setSettingsOpen(true);
        return;
      }

      const tableSelectionShortcut = getTableSelectionShortcut(event);
      if (tableSelectionShortcut && canRunTableSelectionShortcut(tableSelectionShortcut)) {
        event.preventDefault();
        runTableSelectionShortcut(tableSelectionShortcut);
        return;
      }

      if (event.altKey && !event.shiftKey && key === "s") {
        event.preventDefault();
        void saveAllDocuments();
        return;
      }

      if (event.altKey && !event.shiftKey && key === "i") {
        event.preventDefault();
        void insertLocalImageReferences();
        return;
      }

      if (!event.altKey && event.shiftKey && key === "t") {
        event.preventDefault();
        reopenClosedDocumentTab();
        return;
      }

      if (event.altKey && !event.shiftKey && key === "t") {
        event.preventDefault();
        openInsertTableDialog();
        return;
      }

      if (!event.altKey && event.shiftKey && (key === "\\" || key === "|")) {
        event.preventDefault();
        toggleSidebar();
        return;
      }

      if (event.altKey || event.shiftKey) return;

      if (key === "s") {
        event.preventDefault();
        void saveDocument();
      } else if (key === "o") {
        event.preventDefault();
        void openPrimaryDocument();
      } else if (key === "n") {
        event.preventDefault();
        newPrimaryDocument();
      } else if (key === "w") {
        event.preventDefault();
        void closeDocumentTab(activeTab.id);
      } else if (key === "1") {
        event.preventDefault();
        setViewMode("focus");
      } else if (key === "2") {
        event.preventDefault();
        setViewMode("split");
      } else if (key === "3") {
        event.preventDefault();
        setViewMode("preview");
      } else if (key === "4") {
        event.preventDefault();
        setViewMode("wysiwyg");
      }
    }

    window.addEventListener("keydown", handleGlobalKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleGlobalKeyDown, { capture: true });
  });

  const commands = useMemo<CommandItem[]>(() => {
    if (!commandPaletteOpen) return [];
    const tableInCurrentEditor = viewMode === "wysiwyg" ? richTableActive : Boolean(activeTable);
    const structuredTableSelection = viewMode === "wysiwyg" ? richTableActive : Boolean(selectedTableCells);

    return [
    { id: "new", title: desktopLocalFilesAvailable ? "New File" : "New Draft Tab", group: desktopLocalFilesAvailable ? "File" : "Tabs", shortcut: "Ctrl+N", run: newPrimaryDocument },
    { id: "close-tab", title: "Close Tab", group: "File", shortcut: "Ctrl+W", run: () => closeDocumentTab(activeTab.id) },
    { id: "close-other-tabs", title: "Close Other Tabs", group: "Tabs", disabled: tabs.length <= 1, run: closeOtherDocumentTabs },
    { id: "close-tabs-to-right", title: "Close Tabs to the Right", group: "Tabs", disabled: documentTabIdsAfter(tabs.map((tab) => tab.id), activeTab.id).length === 0, run: closeDocumentTabsToRight },
    { id: "close-saved-tabs", title: "Close Saved Tabs", group: "Tabs", disabled: tabs.every((tab) => isDocumentDirty(tab.document)), run: closeSavedDocumentTabs },
    { id: "close-all-tabs", title: "Close All Tabs", group: "Tabs", disabled: tabs.length <= 1 && !dirty, run: closeAllDocumentTabs },
    { id: "reopen-closed-tab", title: "Reopen Closed Tab", group: "Tabs", shortcut: "Ctrl+Shift+T", disabled: closedTabs.length === 0, run: reopenClosedDocumentTab },
    { id: "next-tab", title: "Next Tab", group: "Tabs", shortcut: "Ctrl+Tab", disabled: tabs.length <= 1, run: () => switchRelativeDocumentTab(1) },
    { id: "previous-tab", title: "Previous Tab", group: "Tabs", shortcut: "Ctrl+Shift+Tab", disabled: tabs.length <= 1, run: () => switchRelativeDocumentTab(-1) },
    { id: "move-tab-left", title: "Move Tab Left", group: "Tabs", disabled: tabs[0]?.id === activeTab.id, run: () => moveActiveDocumentTab(-1) },
    { id: "move-tab-right", title: "Move Tab Right", group: "Tabs", disabled: tabs[tabs.length - 1]?.id === activeTab.id, run: () => moveActiveDocumentTab(1) },
    ...documentTabCommands(tabs, activeTab.id, switchDocumentTab),
    ...(desktopLocalFilesAvailable
      ? [{ id: "open", title: "Open Document", group: "File", shortcut: "Ctrl+O", run: openPrimaryDocument }]
      : [{ id: "import-draft", title: "Import Draft Copy", group: "File", shortcut: "Ctrl+O", run: importDraftDocument }]),
    { id: "open-workspace", title: "Open Folder", group: "File", shortcut: "Ctrl+Shift+O", disabled: !desktopRuntime, run: openWorkspace },
    { id: "filter-workspace", title: "Filter Folder Files", group: "File", shortcut: "Ctrl+Alt+O", disabled: !workspace, run: focusWorkspaceFilter },
    { id: "sort-workspace-path", title: "Sort Folder by Path", group: "File", disabled: !workspace || workspaceSortMode === "path", run: () => setWorkspaceSortMode("path") },
    { id: "sort-workspace-modified", title: "Sort Folder by Recent", group: "File", disabled: !workspace || workspaceSortMode === "modified", run: () => setWorkspaceSortMode("modified") },
    { id: "refresh-workspace", title: "Refresh Folder", group: "File", disabled: !workspace, run: refreshWorkspace },
    { id: "close-workspace", title: "Close Folder", group: "File", disabled: !workspace, run: closeWorkspace },
    { id: "save", title: "Save", group: "File", shortcut: "Ctrl+S", run: saveDocument },
    { id: "save-all", title: "Save All", group: "File", shortcut: "Ctrl+Alt+S", disabled: !hasDirtyTabs, run: saveAllDocuments },
    { id: "save-as", title: "Save As", group: "File", run: saveAsDocument },
    { id: "save-copy-as", title: "Save Copy As", group: "File", run: saveCopyAsDocument },
    { id: "export-html", title: "Export HTML", group: "File", run: exportHtmlDocument },
    { id: "reload-from-disk", title: "Reload From Disk", group: "File", disabled: !documentState.filePath, run: reloadDocumentFromDisk },
    { id: "open-disk-version", title: "Open Disk Version in New Tab", group: "File", disabled: !documentState.filePath, run: openDiskVersionInNewTab },
    { id: "reveal-file", title: "Reveal in Folder", group: "File", disabled: !documentState.filePath, run: revealDocumentInFolder },
    { id: "restore-latest-backup", title: "Restore Latest Backup", group: "File", disabled: backups.length === 0, run: () => backups[0] ? restoreBackup(backups[0]) : undefined },
    { id: "create-local-snapshot", title: "Create Local Snapshot", group: "File", disabled: !documentState.markdown.trim(), run: createLocalSnapshot },
    { id: "view-focus", title: "Focus View", group: "View", shortcut: "Ctrl+1", run: () => setViewMode("focus") },
    { id: "view-split", title: "Split View", group: "View", shortcut: "Ctrl+2", run: () => setViewMode("split") },
    { id: "view-preview", title: "Preview View", group: "View", shortcut: "Ctrl+3", run: () => setViewMode("preview") },
    { id: "view-wysiwyg", title: "Visual Editor", group: "View", shortcut: "Ctrl+4", run: () => setViewMode("wysiwyg") },
    { id: "update-preview", title: "Update Preview", group: "View", disabled: autoPreviewEnabled, run: updateManualPreview },
    { id: "toggle-sidebar", title: sidebarVisible ? "Hide Sidebar" : "Show Sidebar", group: "View", shortcut: "Ctrl+Shift+\\", run: toggleSidebar },
    { id: "reset-pane-layout", title: "Reset Pane Layout", group: "View", run: resetPaneLayout },
    { id: "settings", title: "Settings", group: "View", shortcut: "Ctrl+,", run: () => setSettingsOpen(true) },
    { id: "undo", title: "Undo", group: "Edit", shortcut: "Ctrl+Z", run: () => runEditorHistoryAction("undo") },
    { id: "redo", title: "Redo", group: "Edit", shortcut: "Ctrl+Shift+Z / Ctrl+Y", run: () => runEditorHistoryAction("redo") },
    { id: "find", title: "Find", group: "Edit", shortcut: "Ctrl+F", run: () => openFindPanel(false) },
    { id: "replace", title: "Find and Replace", group: "Edit", shortcut: "Ctrl+H", run: () => openFindPanel(true) },
    { id: "toggle-theme", title: theme === "light" ? "Dark Theme" : "Light Theme", group: "View", run: toggleTheme },
    { id: "toggle-smart-copy", title: smartCopy ? "Disable Smart Copy" : "Enable Smart Copy", group: "Clipboard", run: () => setSmartCopy(!smartCopy) },
    { id: "toggle-soft-syntax", title: softSyntax ? "Show Markdown Syntax" : "Soften Markdown Syntax", group: "Editor", run: () => setSoftSyntax(!softSyntax) },
    { id: "bold", title: "Bold", group: "Format", shortcut: "Ctrl+B", run: () => runTextCommand("bold") },
    { id: "italic", title: "Italic", group: "Format", shortcut: "Ctrl+I", run: () => runTextCommand("italic") },
    { id: "code", title: "Inline Code", group: "Format", shortcut: "Ctrl+`", run: () => runTextCommand("code") },
    { id: "link", title: "Link", group: "Format", shortcut: "Ctrl+K", run: () => runTextCommand("link") },
    { id: "insert-local-image", title: "Insert Local Image", group: "Format", detail: "Choose image files and insert relative Markdown references.", shortcut: "Ctrl+Alt+I", run: insertLocalImageReferences },
    { id: "heading-1", title: "Heading 1", group: "Format", run: () => runBlockCommand("heading-1") },
    { id: "heading-2", title: "Heading 2", group: "Format", run: () => runBlockCommand("heading-2") },
    { id: "heading-3", title: "Heading 3", group: "Format", run: () => runBlockCommand("heading-3") },
    { id: "bullet-list", title: "Bullet List", group: "Format", run: () => runBlockCommand("bullet-list") },
    { id: "ordered-list", title: "Ordered List", group: "Format", run: () => runBlockCommand("ordered-list") },
    { id: "task-list", title: "Task List", group: "Format", run: () => runBlockCommand("task-list") },
    { id: "indent-list-item", title: "Indent List Item", group: "Format", shortcut: "Tab", run: () => runListIndentation("indent") },
    { id: "outdent-list-item", title: "Outdent List Item", group: "Format", shortcut: "Shift+Tab", run: () => runListIndentation("outdent") },
    { id: "blockquote", title: "Blockquote", group: "Format", run: () => runBlockCommand("blockquote") },
    { id: "code-block", title: "Code Block", group: "Format", run: () => runBlockCommand("code-block") },
    { id: "insert-table", title: "Insert Table", group: "Table", detail: `${tableSizeDraft.columns} columns, ${tableSizeDraft.bodyRows + 1} rows`, shortcut: "Ctrl+Alt+T", run: openInsertTableDialog },
    { id: "align-table", title: "Align Table", group: "Table", shortcut: "Ctrl+Alt+L", disabled: !activeTable, run: () => runTableCommand("normalize") },
    { id: "select-table-cell", title: "Select Table Cell", group: "Table", shortcut: "Ctrl+Alt+E", disabled: !tableInCurrentEditor, run: selectTableCell },
    { id: "select-table-row", title: "Select Table Row", group: "Table", shortcut: "Ctrl+Alt+R", disabled: !tableInCurrentEditor || (viewMode !== "wysiwyg" && activeTable!.position.row === 1), run: selectTableRow },
    { id: "select-table-column", title: "Select Table Column", group: "Table", shortcut: "Ctrl+Alt+C", disabled: !tableInCurrentEditor, run: selectTableColumn },
    { id: "select-table-column-body", title: "Select Table Column Body", group: "Table", shortcut: "Ctrl+Alt+Shift+C", disabled: !activeTable || activeTable.table.rows.length === 0, run: selectTableColumnBody },
    { id: "select-table-header", title: "Select Table Header", group: "Table", shortcut: "Ctrl+Alt+H", disabled: !activeTable, run: selectTableHeader },
    { id: "select-table-body", title: "Select Table Body", group: "Table", shortcut: "Ctrl+Alt+B", disabled: !activeTable || activeTable.table.rows.length === 0, run: selectTableBody },
    { id: "select-table", title: "Select Table", group: "Table", shortcut: "Ctrl+Alt+A", disabled: !tableInCurrentEditor, run: selectActiveTable },
    { id: "add-row", title: "Add Table Row", group: "Table", shortcut: "Ctrl+Alt+Enter", disabled: !tableInCurrentEditor, run: () => runTableCommand("add-row") },
    { id: "add-row-before", title: "Add Table Row Above", group: "Table", shortcut: "Ctrl+Alt+Shift+Enter", disabled: !tableInCurrentEditor, run: addRowBefore },
    { id: "add-column", title: "Add Table Column", group: "Table", shortcut: "Ctrl+Alt+]", disabled: !tableInCurrentEditor, run: () => runTableCommand("add-column") },
    { id: "add-column-before", title: "Add Table Column Left", group: "Table", shortcut: "Ctrl+Alt+[", disabled: !tableInCurrentEditor, run: addColumnBefore },
    { id: "delete-row", title: "Delete Table Row", group: "Table", disabled: !tableInCurrentEditor || (viewMode !== "wysiwyg" && activeTable!.position.row < 2), run: removeRow },
    { id: "delete-column", title: "Delete Table Column", group: "Table", disabled: !tableInCurrentEditor || (viewMode !== "wysiwyg" && activeTable!.table.headers.length <= 1), run: removeColumn },
    { id: "delete-table", title: "Delete Table", group: "Table", disabled: !tableInCurrentEditor, run: removeTable },
    { id: "duplicate-row", title: "Duplicate Table Row", group: "Table", disabled: !tableInCurrentEditor || (viewMode !== "wysiwyg" && activeTable!.position.row < 2), run: duplicateRow },
    { id: "duplicate-column", title: "Duplicate Table Column", group: "Table", disabled: !tableInCurrentEditor, run: duplicateColumn },
    { id: "move-row-up", title: "Move Table Row Up", group: "Table", shortcut: "Ctrl+Alt+Up", disabled: !tableInCurrentEditor || (viewMode !== "wysiwyg" && activeTable!.position.row <= 2), run: moveRowUp },
    { id: "move-row-down", title: "Move Table Row Down", group: "Table", shortcut: "Ctrl+Alt+Down", disabled: !tableInCurrentEditor || (viewMode !== "wysiwyg" && (activeTable!.position.row < 2 || activeTable!.position.row >= activeTable!.table.rows.length + 1)), run: moveRowDown },
    { id: "move-column-left", title: "Move Table Column Left", group: "Table", shortcut: "Ctrl+Alt+Left", disabled: !tableInCurrentEditor || (viewMode !== "wysiwyg" && activeTable!.position.col <= 0), run: moveColumnLeft },
    { id: "move-column-right", title: "Move Table Column Right", group: "Table", shortcut: "Ctrl+Alt+Right", disabled: !tableInCurrentEditor || (viewMode !== "wysiwyg" && activeTable!.position.col >= activeTable!.table.headers.length - 1), run: moveColumnRight },
    { id: "sort-column-asc", title: "Sort Table Column Ascending", group: "Table", disabled: !tableInCurrentEditor || (viewMode !== "wysiwyg" && activeTable!.table.rows.length < 2), run: sortColumnAscending },
    { id: "sort-column-desc", title: "Sort Table Column Descending", group: "Table", disabled: !tableInCurrentEditor || (viewMode !== "wysiwyg" && activeTable!.table.rows.length < 2), run: sortColumnDescending },
    { id: "align-column-default", title: "Default Table Column Alignment", group: "Table", disabled: !tableInCurrentEditor, run: () => alignActiveColumn("none") },
    { id: "align-column-left", title: "Align Table Column Left", group: "Table", disabled: !tableInCurrentEditor, run: () => alignActiveColumn("left") },
    { id: "align-column-center", title: "Align Table Column Center", group: "Table", disabled: !tableInCurrentEditor, run: () => alignActiveColumn("center") },
    { id: "align-column-right", title: "Align Table Column Right", group: "Table", disabled: !tableInCurrentEditor, run: () => alignActiveColumn("right") },
    { id: "copy-md", title: "Copy Markdown", group: "Clipboard", run: copyMarkdown },
    { id: "copy-text", title: "Copy Clean Text", group: "Clipboard", run: copyPlainText },
    { id: "copy-file-path", title: "Copy File Path", group: "Clipboard", disabled: !documentState.filePath, run: copyDocumentPath },
    { id: "copy-selection-md-table", title: "Copy Selection as Markdown Table", group: "Clipboard", disabled: !structuredTableSelection, run: copySelectionAsMarkdownTable },
    { id: "copy-selection-tsv", title: "Copy Selection as TSV", group: "Clipboard", disabled: !structuredTableSelection, run: copySelectionAsTsv },
    { id: "copy-selection-csv", title: "Copy Selection as CSV", group: "Clipboard", disabled: !structuredTableSelection, run: copySelectionAsCsv },
    { id: "copy-rich", title: "Copy Rich Text", group: "Clipboard", run: copyRichText },
    { id: "copy-table", title: "Copy Table", group: "Clipboard", disabled: !tableInCurrentEditor, run: copyCurrentTable },
    { id: "copy-table-md", title: "Copy Table as Markdown Table", group: "Clipboard", disabled: !tableInCurrentEditor, run: copyCurrentTableAsMarkdownTable },
    { id: "copy-table-tsv", title: "Copy Table as TSV", group: "Clipboard", disabled: !tableInCurrentEditor, run: copyCurrentTableAsTsv },
    { id: "copy-table-header", title: "Copy Table Header", group: "Clipboard", disabled: !activeTable, run: copyCurrentTableHeader },
    { id: "copy-table-header-md", title: "Copy Table Header as Markdown Table", group: "Clipboard", disabled: !activeTable, run: copyCurrentTableHeaderAsMarkdownTable },
    { id: "copy-table-header-tsv", title: "Copy Table Header as TSV", group: "Clipboard", disabled: !activeTable, run: copyCurrentTableHeaderAsTsv },
    { id: "copy-table-body", title: "Copy Table Body", group: "Clipboard", disabled: !activeTable || activeTable.table.rows.length === 0, run: copyCurrentTableBody },
    { id: "copy-table-body-md", title: "Copy Table Body as Markdown Table", group: "Clipboard", disabled: !activeTable || activeTable.table.rows.length === 0, run: copyCurrentTableBodyAsMarkdownTable },
    { id: "copy-table-body-tsv", title: "Copy Table Body as TSV", group: "Clipboard", disabled: !activeTable || activeTable.table.rows.length === 0, run: copyCurrentTableBodyAsTsv },
    { id: "copy-table-row", title: "Copy Table Row", group: "Clipboard", disabled: !activeTable || activeTable.position.row === 1, run: copyActiveTableRow },
    { id: "copy-table-row-md", title: "Copy Table Row as Markdown Table", group: "Clipboard", disabled: !activeTable || activeTable.position.row === 1, run: copyActiveTableRowAsMarkdownTable },
    { id: "copy-table-row-tsv", title: "Copy Table Row as TSV", group: "Clipboard", disabled: !activeTable || activeTable.position.row === 1, run: copyActiveTableRowAsTsv },
    { id: "copy-table-column", title: "Copy Table Column", group: "Clipboard", disabled: !activeTable, run: copyActiveTableColumn },
    { id: "copy-table-column-md", title: "Copy Table Column as Markdown Table", group: "Clipboard", disabled: !activeTable, run: copyActiveTableColumnAsMarkdownTable },
    { id: "copy-table-column-tsv", title: "Copy Table Column as TSV", group: "Clipboard", disabled: !activeTable, run: copyActiveTableColumnAsTsv },
    { id: "copy-table-column-body", title: "Copy Table Column Body", group: "Clipboard", disabled: !activeTable || activeTable.table.rows.length === 0, run: copyActiveTableColumnBody },
    { id: "copy-table-column-body-md", title: "Copy Table Column Body as Markdown Table", group: "Clipboard", disabled: !activeTable || activeTable.table.rows.length === 0, run: copyActiveTableColumnBodyAsMarkdownTable },
    { id: "copy-table-column-body-tsv", title: "Copy Table Column Body as TSV", group: "Clipboard", disabled: !activeTable || activeTable.table.rows.length === 0, run: copyActiveTableColumnBodyAsTsv },
    { id: "copy-table-csv", title: "Copy Table as CSV", group: "Clipboard", disabled: !tableInCurrentEditor, run: copyCurrentTableAsCsv },
    { id: "copy-table-header-csv", title: "Copy Table Header as CSV", group: "Clipboard", disabled: !activeTable, run: copyCurrentTableHeaderAsCsv },
    { id: "copy-table-body-csv", title: "Copy Table Body as CSV", group: "Clipboard", disabled: !activeTable || activeTable.table.rows.length === 0, run: copyCurrentTableBodyAsCsv },
    { id: "copy-table-row-csv", title: "Copy Table Row as CSV", group: "Clipboard", disabled: !activeTable || activeTable.position.row === 1, run: copyActiveTableRowAsCsv },
    { id: "copy-table-column-csv", title: "Copy Table Column as CSV", group: "Clipboard", disabled: !activeTable, run: copyActiveTableColumnAsCsv },
    { id: "copy-table-column-body-csv", title: "Copy Table Column Body as CSV", group: "Clipboard", disabled: !activeTable || activeTable.table.rows.length === 0, run: copyActiveTableColumnBodyAsCsv },
    ...(commandPaletteOpen ? recentFileCommands(recentFiles, openRecentDocument) : []),
    ...(commandPaletteOpen ? workspaceFileCommands(
      workspace
        ? workspaceSortMode === "modified"
          ? sortWorkspaceFilesByModified(workspace.files)
          : sortWorkspaceFiles(workspace.files)
        : [],
      openWorkspaceFile
    ) : [])
  ];
  }, [activeTab.id, activeTable, autoPreviewEnabled, backups, closedTabs, commandPaletteOpen, desktopRuntime, draftSnapshots, dirty, hasDirtyTabs, desktopLocalFilesAvailable, recentFiles, richTableActive, sidebarVisible, smartCopy, softSyntax, tabs, theme, viewMode, workspace, workspaceSortMode, documentState.markdown, documentState.filePath, documentState.fileName, documentState.fileStats, selectedTableCells, selection, tableSizeDraft]);

  const deferredMetricsMarkdown = useDeferredValue(documentState.markdown);
  const metricsMarkdown = documentState.markdown.length > DEFERRED_METRICS_THRESHOLD
    ? deferredMetricsMarkdown
    : documentState.markdown;
  const documentMetrics = useMemo(() => getDocumentMetrics(metricsMarkdown), [metricsMarkdown]);
  const cursorPosition = useMemo(
    () => viewMode === "wysiwyg" ? null : selection.cursorPosition ?? getDocumentCursorPosition(documentState.markdown, selection.from),
    [documentState.markdown, selection.cursorPosition, selection.from, viewMode]
  );
  const richSelectionText = viewMode === "wysiwyg" ? richEditorRef.current?.getSelectedText() ?? "" : "";
  const selectionStatus = viewMode === "wysiwyg"
    ? richTableSelection
      ? richTableSelectionStatusLabel(richTableSelection, t)
      : richSelection.from === richSelection.to
      ? "No selection"
      : richSelectionText
        ? `${Array.from(richSelectionText).length} selected`
        : "Visual selection"
    : selectionStatusLabel(selectionSummary);
  const paneLayoutVariables = paneLayoutCssVariables(paneLayout);
  const appStyle = {
    "--editor-font-size": `${editorFontSize}px`,
    "--editor-content-width": `${editorLineWidth}px`,
    "--table-max-height": `${tableMaxHeightVh}vh`,
    "--outline-empty-label": JSON.stringify(t("No headings")),
    "--editor-placeholder": JSON.stringify(t("Start writing")),
    ...paneLayoutVariables
  } as CSSProperties;
  const headerSaveSafetyLabel = saveSafetyStatusLabel(documentState);
  const headerSaveSafetyClassName = documentState.filePath
    ? documentState.lastBackupPath ? "safety-pill protected" : "safety-pill"
    : "safety-pill draft";
  const headerSaveSafetyTitle = !documentState.filePath
    ? t("This draft has no disk file yet")
    : documentState.lastBackupPath ?? t("Backups are created before overwriting a saved file");
  const headerEditStatusLabel = documentEditStatusLabel(documentState);
  const headerEditStatusClassName = [
    "dirty-pill",
    dirty ? "dirty" : "",
    documentState.filePath ? "" : "draft"
  ].filter(Boolean).join(" ");
  const sessionEditStatusLabel = tabSessionEditStatusLabel(documentState, dirtyTabsCount);

  return (
    <div
      ref={appShellRef}
      className={dropOverlayActive ? "app-shell drop-active" : "app-shell"}
      data-view={viewMode}
      data-markup={softSyntax ? "soft" : "source"}
      data-density={editorDensity}
      data-table-height={tableHeightMode}
      data-sidebar={sidebarVisible ? "visible" : "hidden"}
      data-table={activeTable ? "active" : "inactive"}
      style={appStyle}
      onMouseDown={closeToolbarMenusOnOutsideMouseDown}
      onDragEnter={handleShellDragEnter}
      onDragOver={handleShellDragOver}
      onDragLeave={handleShellDragLeave}
      onDrop={handleShellDrop}
    >
      {dropOverlayActive && (
        <div className="drop-overlay" aria-hidden="true">
          <div className="drop-target">
            <FolderOpen size={28} />
            <strong>{t(desktopRuntime ? "Open or Insert Local Files" : "Import Draft Files")}</strong>
            <span>{t(desktopRuntime ? "Markdown as tabs - Images as references - Folders as workspace" : "Markdown/text as draft tabs - images and folders need desktop")}</span>
          </div>
        </div>
      )}
      <header className="topbar">
        <div className="topbar-tools" onMouseDown={preserveRichEditorSelectionOnToolbarMouseDown}>
          <div className="brand-block">
          <div className="brand-mark">N</div>
          <div>
            <div className="brand-name">NyaMarkdownor</div>
            <div className="brand-subtitle">{runtimeSubtitle}</div>
          </div>
        </div>

        <div className="toolbar file-toolbar">
          <IconButton className="toolbar-primary" label={t(desktopLocalFilesAvailable ? "New File" : "New Draft")} icon={<FilePlus2 />} onClick={newPrimaryDocument} />
          {desktopLocalFilesAvailable ? (
            <IconButton className="toolbar-primary" label={t("Open")} icon={<FolderOpen />} onClick={openPrimaryDocument} />
          ) : (
            <IconButton className="toolbar-primary" label={t("Import Draft")} icon={<FileText />} onClick={importDraftDocument} />
          )}
          <IconButton className="toolbar-primary" label={t("Save")} icon={<Save />} onClick={saveDocument} />
          <ToolbarActionMenu label={t("File")} icon={<FileText />}>
            <MenuSectionLabel>{t("File")}</MenuSectionLabel>
            <TableMenuItem label={t(desktopLocalFilesAvailable ? "New File" : "New Draft")} icon={<FilePlus2 />} onClick={newPrimaryDocument} />
            {desktopLocalFilesAvailable ? (
              <TableMenuItem label={t("Open")} icon={<FolderOpen />} onClick={openPrimaryDocument} />
            ) : (
              <TableMenuItem label={t("Import Draft")} icon={<FileText />} onClick={importDraftDocument} />
            )}
            <TableMenuItem label={t("Open Folder")} icon={<PanelLeft />} disabled={!desktopRuntime} onClick={openWorkspace} />
            <MenuSectionLabel>{t("Save")}</MenuSectionLabel>
            <TableMenuItem label={t("Save")} icon={<Save />} onClick={saveDocument} />
            <TableMenuItem label={t("Save All")} icon={<SaveAll />} disabled={!hasDirtyTabs} onClick={saveAllDocuments} />
            <TableMenuItem label={t("Save As")} icon={<FileDown />} onClick={saveAsDocument} />
            <TableMenuItem label={t("Save Copy")} icon={<Copy />} onClick={saveCopyAsDocument} />
            <TableMenuItem label={t("Export HTML")} icon={<FileCode2 />} onClick={exportHtmlDocument} />
          </ToolbarActionMenu>
        </div>

        <div className="toolbar format-toolbar">
          <IconButton className="toolbar-primary" label={t("Bold")} icon={<Bold />} onClick={() => runTextCommand("bold")} />
          <IconButton className="toolbar-primary" label={t("Italic")} icon={<Italic />} onClick={() => runTextCommand("italic")} />
          <IconButton className="toolbar-primary" label={t("Link")} icon={<Link2 />} onClick={() => runTextCommand("link")} />
          <ToolbarActionMenu label={t("Format")} icon={<PenLine />}>
            <MenuSectionLabel>{t("Edit")}</MenuSectionLabel>
            <TableMenuItem label={t("Undo")} icon={<Undo2 />} onClick={() => runEditorHistoryAction("undo")} />
            <TableMenuItem label={t("Redo")} icon={<Redo2 />} onClick={() => runEditorHistoryAction("redo")} />
            <MenuSectionLabel>{t("Format")}</MenuSectionLabel>
            <TableMenuItem label={t("Bold")} icon={<Bold />} onClick={() => runTextCommand("bold")} />
            <TableMenuItem label={t("Italic")} icon={<Italic />} onClick={() => runTextCommand("italic")} />
            <TableMenuItem label={t("Inline code")} icon={<Code2 />} onClick={() => runTextCommand("code")} />
            <TableMenuItem label={t("Link")} icon={<Link2 />} onClick={() => runTextCommand("link")} />
            <TableMenuItem label={t("Image")} icon={<ImagePlus />} onClick={insertLocalImageReferences} />
            <MenuSectionLabel>{t("Editor")}</MenuSectionLabel>
            <ToolbarMenuToggle label={t("Soft syntax")} icon={<Code2 />} checked={softSyntax} onToggle={() => setSoftSyntax(!softSyntax)} />
          </ToolbarActionMenu>
        </div>

        <div className="toolbar block-toolbar">
          <ToolbarActionMenu label={t("Blocks")} icon={<Heading2 />}>
            <TableMenuItem label={t("Heading 1")} icon={<Heading1 />} onClick={() => runBlockCommand("heading-1")} />
            <TableMenuItem label={t("Heading 2")} icon={<Heading2 />} onClick={() => runBlockCommand("heading-2")} />
            <TableMenuItem label={t("Heading 3")} icon={<Heading3 />} onClick={() => runBlockCommand("heading-3")} />
            <MenuSectionLabel>{t("Blocks")}</MenuSectionLabel>
            <TableMenuItem label={t("Bullet list")} icon={<List />} onClick={() => runBlockCommand("bullet-list")} />
            <TableMenuItem label={t("Ordered list")} icon={<ListOrdered />} onClick={() => runBlockCommand("ordered-list")} />
            <TableMenuItem label={t("Task list")} icon={<ListChecks />} onClick={() => runBlockCommand("task-list")} />
            <TableMenuItem label={t("Blockquote")} icon={<TextQuote />} onClick={() => runBlockCommand("blockquote")} />
            <TableMenuItem label={t("Code block")} icon={<Code2 />} onClick={() => runBlockCommand("code-block")} />
          </ToolbarActionMenu>
        </div>

        <div className="toolbar table-toolbar">
          <ToolbarActionMenu label={t("Table")} icon={<Table2 />} align="right" wide>
            <TableMenuItem label={t("Insert table")} icon={<Table2 />} onClick={openInsertTableDialog} />
            {activeTable && viewMode !== "wysiwyg" && (
              <TableMenuItem label={t("Align table")} icon={<AlignJustify />} onClick={normalizeTable} />
            )}
            {(viewMode === "wysiwyg" ? richTableActive : Boolean(activeTable)) && (
              <>
                <MenuSectionLabel>{t("Selection")}</MenuSectionLabel>
                <TableMenuItem label={t("Select cell")} icon={<TextSelect />} onClick={selectTableCell} />
                <TableMenuItem label={t("Select row")} icon={<Rows3 />} onClick={selectTableRow} disabled={viewMode !== "wysiwyg" && activeTable?.position.row === 1} />
                <TableMenuItem label={t("Select column")} icon={<Columns3 />} onClick={selectTableColumn} />
                {activeTable && viewMode !== "wysiwyg" && (
                  <>
                    <TableMenuItem label={t("Select header")} icon={<Heading2 />} onClick={selectTableHeader} />
                    <TableMenuItem label={t("Select body")} icon={<Rows3 />} onClick={selectTableBody} disabled={activeTable.table.rows.length === 0} />
                  </>
                )}
                <TableMenuItem label={t("Select table")} icon={<SquareMousePointer />} onClick={selectActiveTable} />
                <TableMenuItem label={t("Copy cell content")} icon={<ClipboardCopy />} onClick={copyActiveTableCell} />

                <MenuSectionLabel>{t("Rows")}</MenuSectionLabel>
                <TableMenuItem label={t("Add row above")} icon={<ArrowUp />} onClick={addRowBefore} />
                <TableMenuItem label={t("Add row below")} icon={<ArrowDown />} onClick={addRow} />
                <TableMenuItem label={t("Duplicate row")} icon={<CopyPlus />} onClick={duplicateRow} disabled={viewMode !== "wysiwyg" && Boolean(activeTable && activeTable.position.row < 2)} />
                <TableMenuItem label={t("Move row up")} icon={<ArrowUp />} onClick={moveRowUp} disabled={viewMode !== "wysiwyg" && Boolean(activeTable && activeTable.position.row <= 2)} />
                <TableMenuItem label={t("Move row down")} icon={<ArrowDown />} onClick={moveRowDown} disabled={viewMode !== "wysiwyg" && Boolean(activeTable && (activeTable.position.row < 2 || activeTable.position.row >= activeTable.table.rows.length + 1))} />

                <MenuSectionLabel>{t("Columns")}</MenuSectionLabel>
                <TableMenuItem label={t("Add column left")} icon={<ArrowLeft />} onClick={addColumnBefore} />
                <TableMenuItem label={t("Add column right")} icon={<ArrowRight />} onClick={addColumn} />
                <TableMenuItem label={t("Duplicate column")} icon={<CopyPlus />} onClick={duplicateColumn} />
                <TableMenuItem label={t("Move column left")} icon={<ArrowLeft />} onClick={moveColumnLeft} disabled={viewMode !== "wysiwyg" && Boolean(activeTable && activeTable.position.col <= 0)} />
                <TableMenuItem label={t("Move column right")} icon={<ArrowRight />} onClick={moveColumnRight} disabled={viewMode !== "wysiwyg" && Boolean(activeTable && activeTable.position.col >= activeTable.table.headers.length - 1)} />

                <MenuSectionLabel>{t("Alignment")}</MenuSectionLabel>
                <TableMenuItem label={t("Default alignment")} icon={<AlignJustify />} onClick={() => alignActiveColumn("none")} />
                <TableMenuItem label={t("Align left")} icon={<AlignLeft />} onClick={() => alignActiveColumn("left")} />
                <TableMenuItem label={t("Align center")} icon={<AlignCenter />} onClick={() => alignActiveColumn("center")} />
                <TableMenuItem label={t("Align right")} icon={<AlignRight />} onClick={() => alignActiveColumn("right")} />
                <TableMenuItem label={t("Sort ascending")} icon={<ArrowDownAZ />} onClick={sortColumnAscending} disabled={viewMode !== "wysiwyg" && Boolean(activeTable && activeTable.table.rows.length < 2)} />
                <TableMenuItem label={t("Sort descending")} icon={<ArrowDownZA />} onClick={sortColumnDescending} disabled={viewMode !== "wysiwyg" && Boolean(activeTable && activeTable.table.rows.length < 2)} />

                <MenuSectionLabel>{t("Danger zone")}</MenuSectionLabel>
                <TableMenuItem label={t("Delete row")} icon={<ScissorsLineDashed />} onClick={removeRow} disabled={viewMode !== "wysiwyg" && Boolean(activeTable && activeTable.position.row < 2)} danger />
                <TableMenuItem label={t("Delete column")} icon={<Trash2 />} onClick={removeColumn} disabled={viewMode !== "wysiwyg" && Boolean(activeTable && activeTable.table.headers.length <= 1)} danger />
                <TableMenuItem label={t("Delete table")} icon={<Trash2 />} onClick={removeTable} danger />
              </>
            )}
          </ToolbarActionMenu>
        </div>

        <div className="toolbar clipboard-toolbar">
          <ToolbarActionMenu label={t("Copy")} icon={<ClipboardCopy />} align="right">
            <TableMenuItem label={t("Copy Markdown")} icon={<Copy />} onClick={copyMarkdown} />
            <TableMenuItem label={t("Copy Text")} icon={<TextCursorInput />} onClick={copyPlainText} />
            <TableMenuItem label={t("Copy Rich Text")} icon={<ClipboardCopy />} onClick={() => void copyRichText()} />
            {(selectedTableCells || (viewMode === "wysiwyg" && richTableActive)) && (
              <>
                <MenuSectionLabel>{t("Table")}</MenuSectionLabel>
                <TableMenuItem label={t("Copy MD Table")} icon={<FileCode2 />} onClick={copySelectionAsMarkdownTable} />
                <TableMenuItem label={t("Copy TSV")} icon={<FileText />} onClick={copySelectionAsTsv} />
                <TableMenuItem label={t("Copy CSV")} icon={<Table2 />} onClick={copySelectionAsCsv} />
              </>
            )}
            {(viewMode === "wysiwyg" ? richTableActive : Boolean(activeTable)) && (
              <TableMenuItem label={t("Copy Table")} icon={<Table2 />} onClick={copyCurrentTable} />
            )}
            {activeTable && viewMode !== "wysiwyg" && (
              <>
                <TableMenuItem label={t("Copy Header")} icon={<Heading2 />} onClick={copyCurrentTableHeader} />
                <TableMenuItem label={t("Copy Body")} icon={<Rows3 />} onClick={copyCurrentTableBody} disabled={activeTable.table.rows.length === 0} />
                <TableMenuItem label={t("Copy Row")} icon={<ArrowRight />} onClick={copyActiveTableRow} disabled={activeTable.position.row === 1} />
                <TableMenuItem label={t("Copy Column")} icon={<ArrowDown />} onClick={copyActiveTableColumn} />
              </>
            )}
            <MenuSectionLabel>{t("Clipboard")}</MenuSectionLabel>
            <ToolbarMenuToggle label={t("Smart copy")} icon={<ClipboardCopy />} checked={smartCopy} onToggle={() => setSmartCopy(!smartCopy)} />
          </ToolbarActionMenu>
        </div>
        </div>

        <div className="view-tabs">
          <button
            className="icon-only command-launcher"
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            aria-label={t("Command palette")}
            title={t("Command palette")}
          >
            <Command />
          </button>
          <div className="view-menu-wrap" ref={viewMenuRef}>
            <button
              ref={viewMenuTriggerRef}
              className={viewMenuOpen ? "icon-only active view-mode-button" : "icon-only view-mode-button"}
              type="button"
              onClick={() => setViewMenuOpen((open) => !open)}
              onKeyDown={handleViewMenuTriggerKeyDown}
              aria-label={t("Choose view")}
              aria-haspopup="menu"
              aria-expanded={viewMenuOpen}
              title={t("Choose view")}
            >
              <ViewModeIcon mode={viewMode} />
              <ChevronDown size={14} />
            </button>
            {viewMenuOpen && (
              <div className="view-menu" role="menu" aria-label={t("Choose view")} onKeyDown={handleViewMenuKeyDown}>
                <ViewMenuItem mode="focus" activeMode={viewMode} t={t} onSelect={setViewMode} />
                <ViewMenuItem mode="split" activeMode={viewMode} t={t} onSelect={setViewMode} />
                <ViewMenuItem mode="preview" activeMode={viewMode} t={t} onSelect={setViewMode} />
                <ViewMenuItem mode="wysiwyg" activeMode={viewMode} t={t} onSelect={setViewMode} />
              </div>
            )}
          </div>
          <button
            className={sidebarVisible ? "icon-only active" : "icon-only"}
            onClick={toggleSidebar}
            aria-label={t(sidebarVisible ? "Hide sidebar" : "Show sidebar")}
            aria-pressed={sidebarVisible}
            title={t(sidebarVisible ? "Hide sidebar" : "Show sidebar")}
          >
            <PanelLeft />
          </button>
          <button className="icon-only" onClick={() => setSettingsOpen(true)} aria-label={t("Settings")} title={t("Settings")}>
            <Settings2 />
          </button>
          <button
            className="icon-only"
            onClick={toggleTheme}
            aria-label={t(theme === "light" ? "Use dark theme" : "Use light theme")}
            title={t(theme === "light" ? "Use dark theme" : "Use light theme")}
          >
            {theme === "light" ? <Moon /> : <Sun />}
          </button>
        </div>
      </header>

      <nav className="tabstrip" aria-label={t("Open documents")}>
        <button
          className="tab-scroll-control"
          type="button"
          aria-label={t("Scroll tabs left")}
          title={t("Scroll tabs left")}
          onClick={() => scrollTabList(-1)}
        >
          <ArrowLeft size={15} />
        </button>
        <div className="tab-list" ref={tabListRef} role="tablist">
          {tabs.map((tab) => {
            const tabDirty = isDocumentDirty(tab.document);
            const active = tab.id === activeTab.id;
            const tabDisplayName = displayMarkdownDocumentName(tab.document);
            const tabNeedsReview = externalChangeTabIds.has(tab.id);
            const dropPosition = tabDropTarget?.tabId === tab.id ? tabDropTarget.position : null;
            const tabTitle = [
              tab.document.filePath ?? tabDisplayName,
              tabDirty ? "Unsaved changes" : "",
              tabNeedsReview ? "Disk needs review" : ""
            ].filter(Boolean).join(" - ");
            const className = [
              "document-tab",
              active ? "active" : "",
              tabNeedsReview ? "needs-review" : "",
              draggedTabId === tab.id ? "dragging" : "",
              dropPosition ? `drop-${dropPosition}` : ""
            ].filter(Boolean).join(" ");

            return (
              <div
                key={tab.id}
                className={className}
                role="tab"
                aria-selected={active}
                aria-grabbed={draggedTabId === tab.id ? true : undefined}
                data-tab-id={tab.id}
                draggable={tabs.length > 1}
                title={tabTitle}
                onDragStart={(event) => handleTabDragStart(event, tab.id)}
                onDragOver={(event) => handleTabDragOver(event, tab.id)}
                onDrop={(event) => handleTabDrop(event, tab.id)}
                onDragEnd={handleTabDragEnd}
              >
                <button className="tab-select" type="button" aria-label={tabTitle} onClick={() => switchDocumentTab(tab.id)}>
                  <FileText size={14} />
                  <span>{tabDisplayName}</span>
                  {tabNeedsReview && <AlertTriangle className="tab-review-icon" size={13} aria-label={t("Disk needs review")} />}
                  {tabDirty && <i aria-label={t("Unsaved changes")} />}
                </button>
                <button
                  className="tab-close"
                  type="button"
                  aria-label={t("Close {name}", { name: tabDisplayName })}
                  title={t("Close {name}", { name: tabDisplayName })}
                  onClick={(event) => {
                    event.stopPropagation();
                    void closeDocumentTab(tab.id);
                  }}
                >
                  <X size={13} />
                </button>
              </div>
            );
          })}
        </div>
        <div className="tab-list-menu" ref={tabListMenuRef}>
          <button
            className={tabListOpen ? "tab-list-trigger active" : "tab-list-trigger"}
            type="button"
            aria-label={t("Open tab list")}
            aria-haspopup="menu"
            aria-expanded={tabListOpen}
            title={t("Open tab list")}
            onClick={() => setTabListOpen((current) => !current)}
          >
            <ListFilter size={15} />
          </button>
          {tabListOpen && (
            <div className="tab-list-popover" role="menu" aria-label={t("Open documents")}>
              {tabs.map((tab) => {
                const tabDisplayName = displayMarkdownDocumentName(tab.document);
                const active = tab.id === activeTab.id;
                const dirty = isDocumentDirty(tab.document);
                return (
                  <div
                    key={tab.id}
                    className={active ? "tab-list-option-row active" : "tab-list-option-row"}
                    role="none"
                  >
                    <button
                      className="tab-list-option"
                      type="button"
                      role="menuitem"
                      title={tab.document.filePath ?? tabDisplayName}
                      onClick={() => {
                        setTabListOpen(false);
                        switchDocumentTab(tab.id);
                      }}
                    >
                      <FileText size={14} />
                      <span>{tabDisplayName}</span>
                      {dirty && <i aria-label={t("Unsaved changes")} />}
                    </button>
                    <button
                      className="tab-list-option-close"
                      type="button"
                      role="menuitem"
                      aria-label={t("Close {name}", { name: tabDisplayName })}
                      title={t("Close {name}", { name: tabDisplayName })}
                      onClick={() => void closeDocumentTab(tab.id)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <button
          className="tab-scroll-control"
          type="button"
          aria-label={t("Scroll tabs right")}
          title={t("Scroll tabs right")}
          onClick={() => scrollTabList(1)}
        >
          <ArrowRight size={15} />
        </button>
        <button
          className="tab-new"
          type="button"
          aria-label={t(desktopLocalFilesAvailable ? "New File" : "New Draft Tab")}
          title={t(desktopLocalFilesAvailable ? "New File" : "New Draft Tab")}
          onClick={newPrimaryDocument}
        >
          <Plus size={15} />
        </button>
      </nav>

      <main className="workspace" ref={workspaceRef}>
        <button
          className="sidebar-scrim"
          type="button"
          aria-label={t("Close sidebar")}
          onClick={() => setSidebarVisible(false)}
        />
        <aside className="outline-pane">
          <nav className="sidebar-nav" aria-label={t("Sidebar")}>
            <button
              className={sidebarPage === "outline" ? "active" : ""}
              type="button"
              onClick={() => setSidebarPage("outline")}
              title={t("Outline")}
              aria-label={t("Outline")}
              aria-pressed={sidebarPage === "outline"}
            >
              <PanelLeft size={17} />
            </button>
            <button
              className={sidebarPage === "files" ? "active" : ""}
              type="button"
              onClick={() => setSidebarPage("files")}
              title={t("Files")}
              aria-label={t("Files")}
              aria-pressed={sidebarPage === "files"}
            >
              <FolderOpen size={17} />
            </button>
            <button
              className={sidebarPage === "recovery" ? "active" : ""}
              type="button"
              onClick={() => setSidebarPage("recovery")}
              title={t("Version history")}
              aria-label={t("Version history")}
              aria-pressed={sidebarPage === "recovery"}
            >
              <History size={17} />
            </button>
          </nav>
          <div className="sidebar-panel">
          {sidebarPage === "files" && (
            <>
              <div className="pane-kicker"><FolderOpen size={16} /> {t("Files")}</div>
          {(workspace || workspaceLoading) && (
            <section className="workspace-section">
              <div className="section-label icon-label">
                <FolderOpen size={12} />
                <span>{workspace?.rootName ?? t("Folder")}</span>
                <button className="section-action" type="button" onClick={refreshWorkspace} disabled={!workspace || workspaceLoading} title={t("Refresh folder")}>
                  <RotateCcw size={12} />
                </button>
                <button className="section-action" type="button" onClick={closeWorkspace} disabled={!workspace} title={t("Close folder")}>
                  <Trash2 size={12} />
                </button>
              </div>
              {workspaceLoading && <div className="backup-empty">{t("Scanning folder")}</div>}
              {workspace && (
                <>
                  <label className="workspace-filter">
                    <Search size={13} />
                    <input
                      ref={workspaceSearchRef}
                      value={workspaceQuery}
                      onChange={(event) => setWorkspaceQuery(event.target.value)}
                      placeholder={t("Filter files")}
                    />
                  </label>
                  <div className="workspace-sort" role="group" aria-label={t("Folder file sort")}>
                    <button
                      className={workspaceSortMode === "path" ? "active" : ""}
                      type="button"
                      onClick={() => setWorkspaceSortMode("path")}
                    >
                      {t("Path")}
                    </button>
                    <button
                      className={workspaceSortMode === "modified" ? "active" : ""}
                      type="button"
                      onClick={() => setWorkspaceSortMode("modified")}
                    >
                      {t("Recent")}
                    </button>
                  </div>
                  <div className="workspace-meta">
                    {workspaceQuery.trim()
                      ? t("{visible} of {total} files", { visible: workspaceFileView.totalCount, total: workspace.files.length })
                      : t(workspace.truncated ? "{count} Markdown files shown" : "{count} Markdown files", { count: workspace.files.length })}
                    {" - "}
                    {t(workspaceSortMode === "modified" ? "recent first" : "path order")}
                  </div>
                  <div className="workspace-file-list">
                    {workspace.files.length === 0 ? (
                      <div className="backup-empty">{t("No Markdown files found")}</div>
                    ) : workspaceFileView.totalCount === 0 ? (
                      <div className="backup-empty">{t("No matching files")}</div>
                    ) : workspaceFileView.files.map((file) => (
                      <button
                        key={file.path}
                        className={sameLocalPath(documentState.filePath, file.path) ? "workspace-item active" : "workspace-item"}
                        type="button"
                        style={{ paddingLeft: 8 + Math.min(file.depth, 5) * 12 }}
                        onClick={() => openWorkspaceFile(file)}
                        title={file.relativePath}
                      >
                        <FileText size={14} />
                        <span>
                          <strong>{file.name}</strong>
                          <small>{workspaceSortMode === "modified" ? `${formatBackupTime(file.modifiedMs)} - ${file.relativePath}` : file.relativePath}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                  {workspaceFileView.limited && (
                    <div className="workspace-meta warning">
                      {t("{visible} shown - {hidden} more matched", { visible: workspaceFileView.files.length, hidden: workspaceFileView.hiddenCount })}
                    </div>
                  )}
                  {workspace.truncated && (
                    <div className="workspace-meta warning">{t("Large folder limited to first {count} Markdown files.", { count: workspace.files.length })}</div>
                  )}
                </>
              )}
            </section>
          )}
          {recentFiles.length > 0 && (
            <section className="recent-section">
              <div className="section-label">{t("Recent")}</div>
              {recentFiles.map((file) => (
                <div key={file.path} className="recent-row">
                  <button className="recent-item" type="button" onClick={() => openRecentDocument(file.path)} title={file.path}>
                    <FileText size={14} />
                    <span>
                      <strong>{file.name}</strong>
                      <small>{formatBackupTime(file.updatedAt)} - {file.path}</small>
                    </span>
                  </button>
                  <button
                    className="recent-delete"
                    type="button"
                    onClick={() => removeRecentDocument(file.path)}
                    title={t("Forget {name} from recent files", { name: file.name })}
                    aria-label={t("Forget {name} from recent files", { name: file.name })}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </section>
          )}
          {!workspace && !workspaceLoading && recentFiles.length === 0 && (
            <div className="sidebar-empty">
              <FolderOpen size={18} />
              <span>{t("No files open")}</span>
              <button type="button" onClick={() => void openWorkspace()} disabled={!desktopRuntime}>{t("Open Folder")}</button>
            </div>
          )}
            </>
          )}
          {sidebarPage === "recovery" && (
            <>
              <div className="pane-kicker"><History size={16} /> {t("Version history")}</div>
              <section className="backup-section">
                <button className="backup-item history-manager-entry" type="button" onClick={openVersionHistoryManagement}>
                  <FileText size={14} />
                  <span>
                    <strong>{t("Manage file history")}</strong>
                    <small>{t("Browse history by document")}</small>
                  </span>
                  <ChevronRight size={14} />
                </button>
                <section className="recovery-group recovery-file-history">
                  <div className="recovery-group-heading">
                    <div className="section-label recovery-section-label">{t("Current document checkpoints")}</div>
                    <p>{t("Saved and local checkpoints for the current document")}</p>
                  </div>
                  <button
                    className="backup-item"
                    type="button"
                    onClick={createLocalSnapshot}
                    disabled={!documentState.markdown.trim()}
                    title={t("Create checkpoint for the current editor content")}
                  >
                    <History size={14} />
                    <span>
                      <strong>{t("Create checkpoint")}</strong>
                      <small>{t("Manual checkpoint")}</small>
                    </span>
                  </button>
                  {backupLoading ? (
                    <div className="backup-empty">{t("Loading checkpoints")}</div>
                  ) : visibleCheckpoints.map((checkpoint) => {
                    if (checkpoint.source === "disk") {
                      const { backup } = checkpoint;
                      return (
                        <div key={`disk-${backup.path}`} className="backup-row">
                          <button className="backup-item snapshot-restore" type="button" onClick={() => restoreBackup(backup)} title={backup.path}>
                            <RotateCcw size={14} />
                            <span>
                              <strong>{formatBackupTime(checkpoint.timestamp)}</strong>
                              <small>{t(backupKindMessage(backup.kind))} - {formatBytes(backup.size)}</small>
                            </span>
                          </button>
                          <button className="backup-compare" type="button" aria-label={t("Compare with current editor")} title={t("Compare with current editor")} onClick={() => void compareBackup(backup)}>
                            <GitCompareArrows size={14} />
                          </button>
                        </div>
                      );
                    }

                    const { snapshot } = checkpoint;
                    const snapshotDisplayName = displayMarkdownDocumentName(snapshot);
                    return (
                      <div key={`local-${snapshot.id}`} className="backup-row">
                        <button className="backup-item snapshot-restore" type="button" onClick={() => restoreDraftSnapshot(snapshot)} title={snapshot.filePath ?? snapshotDisplayName}>
                          <RotateCcw size={14} />
                          <span>
                            <strong>{formatBackupTime(checkpoint.timestamp)}</strong>
                            <small>{t(draftSnapshotCheckpointMessage(snapshot))} - {formatBytes(snapshot.size)}</small>
                          </span>
                        </button>
                        <button className="backup-compare" type="button" aria-label={t("Compare with current editor")} title={t("Compare with current editor")} onClick={() => compareDraftSnapshot(snapshot)}>
                          <GitCompareArrows size={14} />
                        </button>
                        <button className="backup-delete" type="button" aria-label={t("Delete {name} checkpoint", { name: snapshotDisplayName })} title={t("Delete checkpoint")} onClick={() => void deleteDraftSnapshot(snapshot)}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    );
                  })}
                  {!backupLoading && currentDocumentCheckpoints.length === 0 && (
                    <div className="backup-empty">{t("No checkpoints yet")}</div>
                  )}
                  {currentDocumentCheckpoints.length > 6 && (
                    <button className={`backup-more${showAllBackups ? " expanded" : ""}`} type="button" aria-expanded={showAllBackups} onClick={() => setShowAllBackups((current) => !current)}>
                      <ChevronDown size={14} />
                      <span>{showAllBackups ? t("Show recent versions") : t("Show {count} older versions", { count: hiddenCheckpointCount })}</span>
                    </button>
                  )}
                </section>
              </section>
            </>
          )}
          {sidebarPage === "outline" && (
            <>
              <div className="pane-kicker"><PanelLeft size={16} /> {t("Outline")}</div>
          <nav className="outline-list">
            {headings.map((heading, headingIndex) => {
              const headingKey = outlineHeadingKey(heading);
              const active = headingKey === activeOutlineKey;

              return (
                <button
                  key={`${heading.id}-${heading.line}`}
                  className={active ? "outline-item active" : "outline-item"}
                  style={{ paddingLeft: 10 + (heading.level - 1) * 14 }}
                  aria-current={active ? "location" : undefined}
                  onClick={() => jumpToOutlineHeading(heading, headingIndex)}
                >
                  {heading.text}
                </button>
              );
            })}
          </nav>
            </>
          )}
          </div>
        </aside>

        <section className="editor-pane" ref={editorPaneRef}>
          <div className="pane-header">
            <div>
              <div className="file-title">{documentDisplayName}</div>
              {documentState.filePath ? (
                <div className="file-path-actions">
                  <button
                    className="file-path file-path-button"
                    type="button"
                    onClick={copyDocumentPath}
                    title={t("Copy file path")}
                    aria-label={t("Copy file path")}
                  >
                    <span>{documentState.filePath}</span>
                    <ClipboardCopy size={12} />
                  </button>
                  <button
                    className="file-path-icon-button"
                    type="button"
                    onClick={revealDocumentInFolder}
                    title={t("Reveal in folder")}
                    aria-label={t("Reveal in folder")}
                  >
                    <FolderOpen size={12} />
                  </button>
                </div>
              ) : (
                <div className="file-path">{t("Draft stored in memory")}</div>
              )}
            </div>
            <div className="file-badges">
              {externalChange && (
                <button
                  className="conflict-pill"
                  type="button"
                  title={t("The file changed on disk or could not be verified. Compare the disk version with the editor before deciding whether to reload or save.")}
                  onClick={() => void compareDiskVersionWithEditor()}
                >
                  <AlertTriangle size={13} />
                  {t("Review disk")}
                </button>
              )}
              <div
                className={headerSaveSafetyClassName}
                title={headerSaveSafetyTitle}
              >
                <ShieldCheck size={13} />
                {translateUiText(locale, headerSaveSafetyLabel)}
              </div>
              <div className={headerEditStatusClassName}>{translateUiText(locale, headerEditStatusLabel)}</div>
            </div>
          </div>
          {viewMode === "wysiwyg" ? (
            <Suspense fallback={<div className="editor-loading" role="status">{t("Loading visual editor")}</div>}>
              <RichMarkdownEditor
                key={`${activeTab.id}:${documentState.filePath ?? "draft"}`}
                ref={richEditorRef}
                documentFilePath={documentState.filePath}
                markdown={documentState.markdown}
                t={t}
                smartCopy={smartCopy}
                onChange={(markdown, source) => updateRichMarkdown(activeTab.id, markdown, source)}
                onHistoryAction={(action) => applyRichHistoryAction(activeTab.id, action)}
                onTableContextChange={setRichTableActive}
                onTableSelectionChange={setRichTableSelection}
                onSelectionChange={(range) => rememberRichSelection(activeTab.id, range)}
                onActiveHeadingIndexChange={rememberRichActiveHeadingIndex}
                onOpenLink={handleRichLinkOpen}
                onToast={showToast}
                scrollProgress={richScrollProgressRef.current.get(activeTab.id) ?? activeTab.richScrollProgress ?? 0}
                onScrollProgress={(progress) => rememberRichScrollProgress(activeTab.id, progress)}
                selection={richSelectionsRef.current.get(activeTab.id) ?? activeTab.richSelection}
                selectionText={sourceToRichSelectionTextRef.current.get(activeTab.id)}
                searchMatches={findOpen ? findMatches : undefined}
                activeSearchRange={findOpen && activeFindIndex >= 0 ? findMatches[activeFindIndex] : null}
              />
            </Suspense>
          ) : (
            <MarkdownEditor
              key={activeTab.id}
              editorSessionKey={activeTab.id}
              editorStateSnapshot={editorStateSnapshotsRef.current.get(activeTab.id) ?? activeTab.editorStateSnapshot}
              markdown={documentState.markdown}
              placeholderText={t("Start writing Markdown...")}
              onChange={setMarkdown}
              onSelectionChange={setSelection}
              onEditorViewChange={rememberEditorView}
              onEditorStateSnapshotChange={rememberEditorStateSnapshot}
              onScrollProgress={handleEditorScrollProgress}
              initialScrollProgress={sourceScrollProgressRef.current.get(activeTab.id)
                ?? richScrollProgressRef.current.get(activeTab.id)
                ?? activeTab.richScrollProgress}
              initialSelectionText={richToSourceSelectionTextRef.current.get(activeTab.id)}
              onInitialSelectionTextResolved={() => richToSourceSelectionTextRef.current.delete(activeTab.id)}
              searchMatches={findOpen ? findMatches : []}
              activeSearchRange={findOpen && activeFindIndex >= 0 ? findMatches[activeFindIndex] : null}
              smartCopy={smartCopy}
              onInsertTableRequest={openInsertTableDialog}
              onToast={showToast}
            />
          )}
          {viewMode === "wysiwyg" && richTableActive ? (
            <div className="table-floatbar" role="toolbar" aria-label={t("Visual table quick actions")} onMouseDown={preserveRichEditorSelectionOnToolbarMouseDown}>
              {richTableSelection && (
                <span
                  className="table-selection-count"
                  title={richTableSelectionStatusLabel(richTableSelection, t)}
                >
                  {t(richTableSelection.cellCount === 1 ? "1 cell selected" : "{count} cells selected", { count: richTableSelection.cellCount })}
                </span>
              )}
              <IconButton label={t("Select cell")} icon={<TextSelect />} onClick={selectTableCell} />
              <IconButton label={t("Select table")} icon={<SquareMousePointer />} onClick={selectActiveTable} />
              <IconButton label={t("Copy cell content")} icon={<ClipboardCopy />} onClick={() => void copyActiveTableCell()} />
              <IconButton label={t("Copy table")} icon={<Copy />} onClick={copyCurrentTable} />
              <TableActionMenu label={t("Visual table actions")}>
                <MenuSectionLabel>{t("Selection")}</MenuSectionLabel>
                <TableMenuItem label={t("Select row")} icon={<Rows3 />} onClick={selectTableRow} />
                <TableMenuItem label={t("Select column")} icon={<Columns3 />} onClick={selectTableColumn} />
                <MenuSectionLabel>{t("Rows")}</MenuSectionLabel>
                <TableMenuItem label={t("Add row above")} icon={<ArrowUp />} onClick={addRowBefore} />
                <TableMenuItem label={t("Add row below")} icon={<ArrowDown />} onClick={addRow} />
                <TableMenuItem label={t("Duplicate row")} icon={<CopyPlus />} onClick={duplicateRow} />
                <TableMenuItem label={t("Move row up")} icon={<ArrowUp />} onClick={moveRowUp} />
                <TableMenuItem label={t("Move row down")} icon={<ArrowDown />} onClick={moveRowDown} />
                <MenuSectionLabel>{t("Columns")}</MenuSectionLabel>
                <TableMenuItem label={t("Add column left")} icon={<ArrowLeft />} onClick={addColumnBefore} />
                <TableMenuItem label={t("Add column right")} icon={<ArrowRight />} onClick={addColumn} />
                <TableMenuItem label={t("Duplicate column")} icon={<CopyPlus />} onClick={duplicateColumn} />
                <TableMenuItem label={t("Move column left")} icon={<ArrowLeft />} onClick={moveColumnLeft} />
                <TableMenuItem label={t("Move column right")} icon={<ArrowRight />} onClick={moveColumnRight} />
                <MenuSectionLabel>{t("Alignment")}</MenuSectionLabel>
                <TableMenuItem label={t("Default alignment")} icon={<AlignJustify />} onClick={() => alignActiveColumn("none")} />
                <TableMenuItem label={t("Align left")} icon={<AlignLeft />} onClick={() => alignActiveColumn("left")} />
                <TableMenuItem label={t("Align center")} icon={<AlignCenter />} onClick={() => alignActiveColumn("center")} />
                <TableMenuItem label={t("Align right")} icon={<AlignRight />} onClick={() => alignActiveColumn("right")} />
                <TableMenuItem label={t("Sort ascending")} icon={<ArrowDownAZ />} onClick={sortColumnAscending} />
                <TableMenuItem label={t("Sort descending")} icon={<ArrowDownZA />} onClick={sortColumnDescending} />
                <MenuSectionLabel>{t("Danger zone")}</MenuSectionLabel>
                <TableMenuItem label={t("Delete row")} icon={<ScissorsLineDashed />} onClick={removeRow} danger />
                <TableMenuItem label={t("Delete column")} icon={<Trash2 />} onClick={removeColumn} danger />
                <TableMenuItem label={t("Delete table")} icon={<Trash2 />} onClick={removeTable} danger />
              </TableActionMenu>
            </div>
          ) : activeTable && (
            <div className="table-floatbar" role="toolbar" aria-label={t("Table quick actions")} onMouseDown={preserveRichEditorSelectionOnToolbarMouseDown}>
              <IconButton label={t("Select cell")} icon={<TextSelect />} onClick={selectTableCell} />
              <IconButton label={t("Select table")} icon={<SquareMousePointer />} onClick={selectActiveTable} />
              <IconButton label={t("Copy cell content")} icon={<ClipboardCopy />} onClick={() => void copyActiveTableCell()} />
              <IconButton label={t("Copy table")} icon={<Copy />} onClick={copyCurrentTable} />
              <TableActionMenu label={t("Table actions")}>
                <TableMenuItem label={t("Align table")} icon={<AlignJustify />} onClick={normalizeTable} />
                <MenuSectionLabel>{t("Selection")}</MenuSectionLabel>
                <TableMenuItem label={t("Select row")} icon={<Rows3 />} onClick={selectTableRow} disabled={activeTable.position.row === 1} />
                <TableMenuItem label={t("Select column")} icon={<Columns3 />} onClick={selectTableColumn} />
                <MenuSectionLabel>{t("Rows")}</MenuSectionLabel>
                <TableMenuItem label={t("Add row above")} icon={<ArrowUp />} onClick={addRowBefore} />
                <TableMenuItem label={t("Add row below")} icon={<ArrowDown />} onClick={addRow} />
                <TableMenuItem label={t("Duplicate row")} icon={<CopyPlus />} onClick={duplicateRow} disabled={activeTable.position.row < 2} />
                <TableMenuItem label={t("Move row up")} icon={<ArrowUp />} onClick={moveRowUp} disabled={activeTable.position.row <= 2} />
                <TableMenuItem label={t("Move row down")} icon={<ArrowDown />} onClick={moveRowDown} disabled={activeTable.position.row < 2 || activeTable.position.row >= activeTable.table.rows.length + 1} />
                <MenuSectionLabel>{t("Columns")}</MenuSectionLabel>
                <TableMenuItem label={t("Add column left")} icon={<ArrowLeft />} onClick={addColumnBefore} />
                <TableMenuItem label={t("Add column right")} icon={<ArrowRight />} onClick={addColumn} />
                <TableMenuItem label={t("Duplicate column")} icon={<CopyPlus />} onClick={duplicateColumn} />
                <TableMenuItem label={t("Move column left")} icon={<ArrowLeft />} onClick={moveColumnLeft} disabled={activeTable.position.col <= 0} />
                <TableMenuItem label={t("Move column right")} icon={<ArrowRight />} onClick={moveColumnRight} disabled={activeTable.position.col >= activeTable.table.headers.length - 1} />
                <TableMenuItem label={t("Sort ascending")} icon={<ArrowDownAZ />} onClick={sortColumnAscending} disabled={activeTable.table.rows.length < 2} />
                <TableMenuItem label={t("Sort descending")} icon={<ArrowDownZA />} onClick={sortColumnDescending} disabled={activeTable.table.rows.length < 2} />
                <MenuSectionLabel>{t("Danger zone")}</MenuSectionLabel>
                <TableMenuItem label={t("Delete row")} icon={<ScissorsLineDashed />} onClick={removeRow} disabled={activeTable.position.row < 2} danger />
                <TableMenuItem label={t("Delete column")} icon={<Trash2 />} onClick={removeColumn} disabled={activeTable.table.headers.length <= 1} danger />
                <TableMenuItem label={t("Delete table")} icon={<Trash2 />} onClick={removeTable} danger />
              </TableActionMenu>
            </div>
          )}
        </section>

        <div
          className="pane-resizer editor-preview-resizer"
          role="separator"
          aria-label={t("Resize editor and preview panes")}
          aria-orientation="vertical"
          tabIndex={0}
          onPointerDown={(event) => startPaneResize(event, "editor-preview")}
          onKeyDown={(event) => handlePaneResizeKeyDown(event, "editor-preview")}
        />

        <section className="preview-pane" ref={previewPaneRef}>
          <div className="pane-header compact">
            <div>{t("Preview")}</div>
            <div className="pane-header-actions">
              {!autoPreviewEnabled && (
                <button className="icon-only" type="button" title={t("Update preview")} aria-label={t("Update preview")} onClick={updateManualPreview}>
                  <RotateCcw />
                </button>
              )}
              <span>{translateUiText(locale, previewStatus)}</span>
            </div>
          </div>
          {previewPaused ? (
            <div className="preview paused-preview">
              <button className="tool-button" type="button" onClick={updateManualPreview}>
                <RotateCcw />
                <span>{t("Update Preview")}</span>
              </button>
            </div>
          ) : (
            <article
              ref={previewRef}
              className={previewPending ? "preview markdown-body pending" : "preview markdown-body"}
              tabIndex={0}
              onChange={handlePreviewChange}
              onClick={handlePreviewClick}
              onCopy={handlePreviewCopy}
              onKeyDown={handlePreviewKeyDown}
              onScroll={handlePreviewScroll}
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          )}
        </section>

        <div
          className="pane-resizer table-resizer"
          role="separator"
          aria-label={t("Resize table inspector pane")}
          aria-orientation="vertical"
          tabIndex={0}
          onPointerDown={(event) => startPaneResize(event, "table")}
          onKeyDown={(event) => handlePaneResizeKeyDown(event, "table")}
        />

        <aside className="table-pane" ref={tableInspectorRef}>
          <div className="pane-kicker"><Table2 size={16} /> {t("Table Inspector")}</div>
          {!activeTable ? (
            <div className="empty-panel">{t("Move the cursor into a Markdown table.")}</div>
          ) : (
            <>
              <div className="table-meta">
                <strong>{activeTable.table.rows.length + 1} x {activeTable.table.headers.length}</strong>
                <span>{t("line {line}", { line: activeTable.startLine + 1 })}</span>
              </div>
              <div className="alignment-strip">
                {activeTable.table.headers.map((header, col) => (
                  <div className={activeTable.position.col === col ? "alignment-column active" : "alignment-column"} key={col}>
                    <div className="alignment-name" title={header || t("Column {column}", { column: col + 1 })}>{header || t("Column {column}", { column: col + 1 })}</div>
                    <div className="column-structure-buttons" role="group" aria-label={t("{column} structure", { column: header || t("Column {column}", { column: col + 1 }) })}>
                      <InspectorIconButton label={t("Insert column before")} icon={<Plus />} onClick={() => insertTableColumnBefore(col)} />
                      <InspectorIconButton label={t("Insert column after")} icon={<Plus />} onClick={() => insertTableColumnAfter(col)} />
                      <InspectorIconButton label={t("Duplicate column")} icon={<CopyPlus />} onClick={() => duplicateTableColumnAt(col)} />
                      <InspectorIconButton label={t("Move column left")} icon={<ArrowLeft />} disabled={col === 0} onClick={() => moveTableColumnAt(col, -1)} />
                      <InspectorIconButton label={t("Move column right")} icon={<ArrowRight />} disabled={col >= activeTable.table.headers.length - 1} onClick={() => moveTableColumnAt(col, 1)} />
                      <InspectorIconButton label={t("Delete column")} icon={<Trash2 />} disabled={activeTable.table.headers.length <= 1} onClick={() => deleteTableColumnAt(col)} />
                    </div>
                    <div className="table-sort-buttons" role="group" aria-label={t("{column} sort", { column: header || t("Column {column}", { column: col + 1 }) })}>
                      <button
                        className="alignment-button"
                        type="button"
                        title={t("Select column")}
                        aria-label={t("Select column")}
                        onClick={() => selectTableColumnByIndex(col)}
                      >
                        <TextSelect />
                      </button>
                      <button
                        className="alignment-button"
                        type="button"
                        title={t("Select column body")}
                        aria-label={t("Select column body")}
                        disabled={activeTable.table.rows.length === 0}
                        onClick={() => selectTableColumnBodyByIndex(col)}
                      >
                        <Rows3 />
                      </button>
                      <button
                        className="alignment-button"
                        type="button"
                        title={t("Sort ascending")}
                        aria-label={t("Sort ascending")}
                        disabled={activeTable.table.rows.length < 2}
                        onClick={() => sortTableColumn(col, "ascending")}
                      >
                        <ArrowDownAZ />
                      </button>
                      <button
                        className="alignment-button"
                        type="button"
                        title={t("Sort descending")}
                        aria-label={t("Sort descending")}
                        disabled={activeTable.table.rows.length < 2}
                        onClick={() => sortTableColumn(col, "descending")}
                      >
                        <ArrowDownZA />
                      </button>
                      <button
                        className="alignment-button"
                        type="button"
                        title={t("Copy Column")}
                        aria-label={t("Copy Column")}
                        onClick={() => void copyTableColumn(col)}
                      >
                        <ClipboardCopy />
                      </button>
                      <button
                        className="alignment-button"
                        type="button"
                        title={t("Copy Column Body")}
                        aria-label={t("Copy Column Body")}
                        disabled={activeTable.table.rows.length === 0}
                        onClick={() => void copyTableColumnBody(col)}
                      >
                        <Rows3 />
                      </button>
                    </div>
                    <div className="alignment-buttons" role="group" aria-label={t("{column} alignment", { column: header || t("Column {column}", { column: col + 1 }) })}>
                      {(["none", "left", "center", "right"] as TableAlignment[]).map((alignment) => (
                        <AlignmentButton
                          key={alignment}
                          alignment={alignment}
                          active={(activeTable.table.aligns[col] ?? "none") === alignment}
                          label={t(alignmentButtonLabel(alignment))}
                          onClick={() => alignTableColumn(col, alignment)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="table-grid">
                <table>
                  <thead>
                    <tr>
                      <th className="table-row-actions-header">{t("Rows")}</th>
                      {activeTable.table.headers.map((cell, col) => (
                        <th
                          key={col}
                          className={[
                            activeTable.position.col === col ? "active-column" : "",
                            activeTable.position.row === 0 && activeTable.position.col === col ? "active-cell" : ""
                          ].filter(Boolean).join(" ") || undefined}
                        >
                          <input
                            data-table-cell-row="-1"
                            data-table-cell-col={col}
                            value={cell}
                            onFocus={() => selectTableInspectorCellInSource(-1, col)}
                            onChange={(event) => editTableCell(-1, col, event.target.value)}
                            onPaste={(event) => handleTableInspectorCellPaste(event, -1, col)}
                            onKeyDown={(event) => handleTableInspectorCellKeyDown(event, -1, col)}
                          />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeTable.table.rows.map((row, rowIndex) => {
                      const rowPosition = rowIndex + 2;
                      const activeRow = activeTable.position.row === rowPosition;
                      return (
                        <tr key={rowIndex} className={activeRow ? "active-row" : undefined}>
                          <td className="table-row-actions">
                            <div className="row-action-buttons" role="group" aria-label={t("Row {row} actions", { row: rowIndex + 1 })}>
                              <InspectorIconButton label={t("Select row")} icon={<TextSelect />} onClick={() => selectTableRowByIndex(rowIndex)} />
                              <InspectorIconButton label={t("Copy Row")} icon={<ClipboardCopy />} onClick={() => void copyTableRowByIndex(rowIndex)} />
                              <InspectorIconButton label={t("Insert row above")} icon={<Plus />} onClick={() => insertTableRowBefore(rowIndex)} />
                              <InspectorIconButton label={t("Insert row below")} icon={<Plus />} onClick={() => insertTableRowAfter(rowIndex)} />
                              <InspectorIconButton label={t("Duplicate row")} icon={<CopyPlus />} onClick={() => duplicateTableRowAt(rowIndex)} />
                              <InspectorIconButton label={t("Move row up")} icon={<ArrowUp />} disabled={rowIndex === 0} onClick={() => moveTableRowAt(rowIndex, -1)} />
                              <InspectorIconButton label={t("Move row down")} icon={<ArrowDown />} disabled={rowIndex >= activeTable.table.rows.length - 1} onClick={() => moveTableRowAt(rowIndex, 1)} />
                              <InspectorIconButton label={t("Delete row")} icon={<Trash2 />} onClick={() => deleteTableRowAt(rowIndex)} />
                            </div>
                          </td>
                          {activeTable.table.headers.map((_header, col) => (
                            <td
                              key={col}
                              className={[
                                activeTable.position.col === col ? "active-column" : "",
                                activeRow && activeTable.position.col === col ? "active-cell" : ""
                              ].filter(Boolean).join(" ") || undefined}
                            >
                              <input
                                data-table-cell-row={rowIndex}
                                data-table-cell-col={col}
                                value={row[col] ?? ""}
                                onFocus={() => selectTableInspectorCellInSource(rowIndex, col)}
                                onChange={(event) => editTableCell(rowIndex, col, event.target.value)}
                                onPaste={(event) => handleTableInspectorCellPaste(event, rowIndex, col)}
                                onKeyDown={(event) => handleTableInspectorCellKeyDown(event, rowIndex, col)}
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </aside>
      </main>

      <footer className="statusbar">
        <span>{translateUiText(locale, `${documentMetrics.lineCount} lines`)}</span>
        <span>{translateUiText(locale, `${documentMetrics.charCount} chars`)}</span>
        <span>{translateUiText(locale, cursorPosition ? `Ln ${cursorPosition.line}, Col ${cursorPosition.column}` : "Visual editor")}</span>
        <span>{translateUiText(locale, selectionStatus)}</span>
        <span>{translateUiText(locale, diskStatusLabel(documentState, externalChange))}</span>
        <span>{translateUiText(locale, saveSafetyStatusLabel(documentState))}</span>
        <span>{t(markdownRender.error ? "Preview error" : previewPaused ? "Preview paused" : manualPreviewStale ? "Preview stale" : previewPending ? "Preview updating" : "Preview ready")}</span>
        <span>{translateUiText(locale, sessionEditStatusLabel)}</span>
      </footer>

      {externalDiskReview && externalDiskReview.tabId === activeTab.id && !confirmation && !backupComparison && (
        <div className="confirm-overlay" role="presentation">
          <section
            className="confirm-dialog danger"
            role="dialog"
            aria-modal="true"
            aria-labelledby="external-disk-review-title"
            aria-describedby="external-disk-review-message"
          >
            <div className="confirm-icon" aria-hidden="true">
              <AlertTriangle />
            </div>
            <div className="confirm-copy">
              <h2 id="external-disk-review-title">{t("File changed on disk")}</h2>
              <p id="external-disk-review-message">
                {t("The disk version differs from the editor. Reloading replaces the editor content with the disk version after creating a safety checkpoint for any unsaved content.")}
              </p>
            </div>
            <div className="confirm-actions">
              <button
                className="confirm-button secondary"
                type="button"
                autoFocus
                onClick={() => {
                  setExternalDiskReview(null);
                  focusEditorSoon();
                }}
              >
                {t("Keep editing")}
              </button>
              <button
                className="confirm-button secondary"
                type="button"
                onClick={() => {
                  const review = externalDiskReview;
                  setExternalDiskReview(null);
                  compareExternalDiskReview(review);
                }}
              >
                {t("Compare versions")}
              </button>
              <button
                className="confirm-button danger"
                type="button"
                onClick={() => {
                  const review = externalDiskReview;
                  setExternalDiskReview(null);
                  void reloadExternalDiskReview(review);
                }}
              >
                {t("Reload from disk")}
              </button>
            </div>
          </section>
        </div>
      )}

      {confirmation && (
        <div className="confirm-overlay" role="presentation">
          <section
            className={confirmation.tone === "danger" ? "confirm-dialog danger" : "confirm-dialog"}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`confirm-title-${confirmation.id}`}
            aria-describedby={`confirm-message-${confirmation.id}`}
          >
            <div className="confirm-icon" aria-hidden="true">
              <AlertTriangle />
            </div>
            <div className="confirm-copy">
              <h2 id={`confirm-title-${confirmation.id}`}>{translateUiText(locale, confirmation.title)}</h2>
              <p id={`confirm-message-${confirmation.id}`}>{translateUiText(locale, confirmation.message)}</p>
            </div>
            <div className="confirm-actions">
              <button className="confirm-button secondary" type="button" autoFocus onClick={() => settleConfirmation(false)}>
                {translateUiText(locale, confirmation.cancelLabel)}
              </button>
              {confirmation.alternateLabel && (
                <button className="confirm-button secondary" type="button" onClick={runConfirmationAlternate}>
                  {translateUiText(locale, confirmation.alternateLabel)}
                </button>
              )}
              <button
                className={confirmation.tone === "danger" ? "confirm-button danger" : "confirm-button primary"}
                type="button"
                onClick={() => settleConfirmation(true)}
              >
                {translateUiText(locale, confirmation.confirmLabel)}
              </button>
            </div>
          </section>
        </div>
      )}

      <div className={toast ? "toast show" : "toast"}>{toast}</div>
      <FindReplacePanel
        open={findOpen}
        query={findQuery}
        replacement={replaceValue}
        replaceVisible={replaceVisible}
        caseSensitive={findCaseSensitive}
        wholeWord={findWholeWord}
        matchCount={findMatches.length}
        activeIndex={activeFindIndex}
        t={t}
        onQueryChange={handleFindQueryChange}
        onReplacementChange={setReplaceValue}
        onReplaceVisibleChange={setReplaceVisible}
        onCaseSensitiveChange={handleFindCaseSensitiveChange}
        onWholeWordChange={handleFindWholeWordChange}
        onNext={() => goToFindMatch("next")}
        onPrevious={() => goToFindMatch("previous")}
        onReplace={replaceCurrentFindMatch}
        onReplaceAll={replaceAllFindMatches}
        onClose={closeFindPanel}
      />
      <CommandPalette
        open={commandPaletteOpen}
        commands={commands}
        locale={locale}
        placeholder={t(workspace || recentFiles.length > 0 ? "Run command or open file..." : "Run command...")}
        onClose={() => setCommandPaletteOpen(false)}
      />
      <InsertTableDialog
        open={tableSizeDialogOpen}
        value={tableSizeDraft}
        t={t}
        onChange={(value) => setTableSizeDraft(normalizeTableSizeDraft(value))}
        onClose={() => setTableSizeDialogOpen(false)}
        onInsert={insertSizedTable}
      />
      <LinkDialog
        open={Boolean(linkDialogState)}
        initialHref={linkDialogState?.href ?? ""}
        canUnlink={linkDialogState?.canUnlink ?? false}
        t={t}
        onClose={() => setLinkDialogState(null)}
        onApply={applyRichLink}
        onUnlink={removeRichLink}
      />
      <BackupCompareDialog
        open={backupComparison !== null}
        fileName={backupComparison?.currentName ?? ""}
        backupMarkdown={backupComparison?.versionMarkdown ?? ""}
        currentMarkdown={backupComparison?.currentMarkdown ?? ""}
        backupLabel={backupComparison?.versionLabel}
        currentLabel={backupComparison?.currentLabel ?? backupComparison?.currentName}
        versionTitle={backupComparison?.versionTitle}
        currentTitle={backupComparison?.currentTitle}
        actionLabel={backupComparison?.actionLabel}
        actionIcon={backupComparison?.actionIcon}
        showAction={backupComparison?.showAction}
        restoreDisabled={backupComparison?.restoreDisabled}
        t={t}
        onClose={() => setBackupComparison(null)}
        onRestore={() => {
          const comparison = backupComparison;
          if (!comparison) return;
          setBackupComparison(null);
          comparison.restore();
        }}
      />
      <FileHistoryManagerDialog
        open={historyManagerOpen}
        documents={historyDocuments}
        loading={backupHistoriesLoading || historySourceStatesLoading}
        t={t}
        onClose={() => setHistoryManagerOpen(false)}
        onLoadDiskVersions={loadManagedFileHistoryVersions}
        onOpenDiskVersion={openManagedDiskVersionAsDraft}
        onOpenSnapshot={openManagedSnapshotAsDraft}
        onCompareVersions={compareManagedHistoryVersions}
        onDeleteDocument={deleteManagedFileHistory}
        onDeleteDocuments={deleteManagedFileHistories}
        onDeleteDiskVersion={deleteManagedDiskVersion}
        onDeleteSnapshot={deleteDraftSnapshot}
        onDeleteVersions={deleteManagedVersions}
      />
      <SettingsDialog
        open={settingsOpen}
        viewMode={viewMode}
        theme={theme}
        language={language}
        sidebarVisible={sidebarVisible}
        autoSave={autoSave}
        autoSaveAvailable={desktopRuntime}
        fileAssociationsAvailable={desktopRuntime}
        smartCopy={smartCopy}
        softSyntax={softSyntax}
        editorFontSize={editorFontSize}
        editorLineWidth={editorLineWidth}
        editorDensity={editorDensity}
        tableHeightMode={tableHeightMode}
        tableMaxHeightVh={tableMaxHeightVh}
        backupPreferences={backupPreferences}
        backupDirectoryAvailable={desktopRuntime}
        buildInfo={buildInfo}
        applicationUpdate={applicationUpdate}
        t={t}
        onClose={() => setSettingsOpen(false)}
        onViewModeChange={setViewMode}
        onThemeChange={setThemeState}
        onLanguageChange={setLanguageState}
        onSidebarVisibleChange={setSidebarVisible}
        onAutoSaveChange={setAutoSave}
        onManageFileAssociation={manageFileAssociations}
        onSmartCopyChange={setSmartCopy}
        onSoftSyntaxChange={setSoftSyntax}
        onEditorFontSizeChange={setEditorFontSize}
        onEditorLineWidthChange={setEditorLineWidth}
        onEditorDensityChange={setEditorDensity}
        onTableHeightModeChange={setTableHeightMode}
        onTableMaxHeightVhChange={setTableMaxHeightVh}
        onChooseBackupDirectory={() => void chooseBackupDirectory()}
        onResetBackupDirectory={resetBackupDirectory}
        onBackupPreferencesChange={(value) => setBackupPreferencesState(normalizeBackupPreferences(value))}
        onCheckForUpdates={() => void checkApplicationUpdates(true)}
        onInstallUpdate={(version) => void installApplicationUpdate(version)}
        onOpenReleasePage={() => void openApplicationReleasePage()}
      />
    </div>
  );
}

function backupPreferencesWithDirectory(current: BackupPreferences, directory: string | null): BackupPreferences {
  const previousDirectories = Array.from(new Set([
    current.directory,
    ...current.previousDirectories
  ].filter((candidate): candidate is string => Boolean(candidate) && candidate !== directory))).slice(0, 8);

  return {
    ...current,
    directory,
    previousDirectories
  };
}

function textCommandLabel(command: MarkdownTextCommand): string {
  switch (command) {
    case "bold":
      return "Bold";
    case "italic":
      return "Italic";
    case "code":
      return "Inline code";
    case "link":
      return "Link";
  }
}

function blockCommandLabel(command: MarkdownBlockCommand): string {
  switch (command) {
    case "heading-1":
      return "Heading 1";
    case "heading-2":
      return "Heading 2";
    case "heading-3":
      return "Heading 3";
    case "bullet-list":
      return "Bullet list";
    case "ordered-list":
      return "Ordered list";
    case "task-list":
      return "Task list";
    case "blockquote":
      return "Blockquote";
    case "code-block":
      return "Code block";
  }
}

function tableCommandLabel(command: TableDocumentCommand): string {
  switch (command) {
    case "insert":
      return "Table inserted";
    case "normalize":
      return "Table aligned";
    case "add-row":
      return "Row added";
    case "add-row-before":
      return "Row added";
    case "add-column":
      return "Column added";
    case "add-column-before":
      return "Column added";
    case "delete-row":
      return "Row deleted";
    case "delete-column":
      return "Column deleted";
    case "delete-table":
      return "Table deleted";
    case "duplicate-row":
      return "Row duplicated";
    case "duplicate-column":
      return "Column duplicated";
    case "move-row-up":
      return "Row moved up";
    case "move-row-down":
      return "Row moved down";
    case "move-column-left":
      return "Column moved left";
    case "move-column-right":
      return "Column moved right";
    case "sort-column-asc":
      return "Column sorted ascending";
    case "sort-column-desc":
      return "Column sorted descending";
    case "align-column-default":
      return "Column alignment cleared";
    case "align-column-left":
      return "Column aligned left";
    case "align-column-center":
      return "Column aligned center";
    case "align-column-right":
      return "Column aligned right";
  }
}

function tableCommandUnavailableLabel(command: TableDocumentCommand): string {
  switch (command) {
    case "insert":
      return "Table could not be inserted";
    case "move-row-up":
      return "Row is already at the top";
    case "move-row-down":
      return "Row is already at the bottom";
    case "duplicate-row":
    case "delete-row":
      return "Move the cursor into a table row";
    case "delete-column":
      return "Table needs at least two columns";
    case "delete-table":
      return "No table at cursor";
    case "move-column-left":
      return "Column is already at the left edge";
    case "move-column-right":
      return "Column is already at the right edge";
    case "sort-column-asc":
    case "sort-column-desc":
      return "Need at least two rows to sort";
    default:
      return "No table at cursor";
  }
}

function tableSelectionLabel(command: TableSelectionCommand): string {
  switch (command) {
    case "select-cell":
      return "Table cell selected";
    case "select-row":
      return "Table row selected";
    case "select-table":
      return "Table selected";
  }
}

function tableSelectionUnavailableLabel(command: TableSelectionCommand): string {
  switch (command) {
    case "select-row":
      return "Move the cursor into a table row";
    default:
      return "No table at cursor";
  }
}

function columnAlignmentLabel(alignment: TableAlignment): string {
  switch (alignment) {
    case "none":
      return "Column alignment cleared";
    case "left":
      return "Column aligned left";
    case "center":
      return "Column aligned center";
    case "right":
      return "Column aligned right";
  }
}

function toSelectionState(range: TextRange, ranges: TextRange[] = [range]): EditorSelectionState {
  return {
    from: range.from,
    to: range.to,
    ranges: ranges.map((selection) => ({ from: selection.from, to: selection.to }))
  };
}

function selectionStatusLabel(summary: SelectionSummary): string {
  if (summary.charCount <= 0) return "No selection";
  if (summary.tableLabel) return summary.tableLabel;
  if (summary.rangeCount <= 1) return `${summary.charCount} selected`;
  return `${summary.charCount} selected in ${summary.rangeCount} ranges`;
}

function richTableSelectionStatusLabel(summary: RichTableSelectionSummary, t: Translator): string {
  switch (summary.kind) {
    case "cell":
      return t("Table cell selected");
    case "row":
      return t("{count} table rows selected ({cells} cells)", { count: summary.rowCount, cells: summary.cellCount });
    case "column":
      return t("{count} table columns selected ({cells} cells)", { count: summary.columnCount, cells: summary.cellCount });
    case "table":
      return t("Entire table selected ({cells} cells)", { cells: summary.cellCount });
    case "range":
      return t("{rows} x {columns} table range ({cells} cells)", {
        rows: summary.rowCount,
        columns: summary.columnCount,
        cells: summary.cellCount
      });
  }
}

function formatBackupTime(modifiedMs: number): string {
  const date = new Date(modifiedMs);
  return new Intl.DateTimeFormat(undefined, {
    ...(date.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }),
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function backupKindMessage(kind: MarkdownBackup["kind"]): string {
  if (kind === "rolling") return "Automatic version (updating)";
  if (kind === "automatic") return "Automatic version";
  if (kind === "safety") return "Safety checkpoint";
  if (kind === "manual") return "Manual checkpoint";
  return "Legacy backup";
}

function draftSnapshotCheckpointMessage(snapshot: DraftSnapshot): string {
  if (snapshot.reason === "manual") return "Manual checkpoint";
  if (snapshot.reason === "close") return "Before closing";
  if (snapshot.reason === "reload") return "Before reloading";
  if (snapshot.reason === "restore") return "Before restoring";
  if (snapshot.reason === "recovery-discard") return "Recovery content kept";
  if (snapshot.reason === "save-conflict") return "Before resolving save conflict";
  if (snapshot.reason === "save-as-overwrite") return "Before overwriting target";
  if (snapshot.reason === "window-close") return "Before closing";
  if (snapshot.reason === "legacy-idle") return "Legacy automatic checkpoint";
  if (snapshot.reason === "legacy-preserved") return "Legacy checkpoint";
  return snapshot.kind === "manual" ? "Manual checkpoint" : "Safety checkpoint";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(kilobytes < 10 ? 1 : 0)} KB`;
  const megabytes = kilobytes / 1024;
  return `${megabytes.toFixed(megabytes < 10 ? 1 : 0)} MB`;
}

function createInitialDocument(): MarkdownDocument {
  const savedDraft = loadDraftDocument();
  if (savedDraft && !isLegacySamplePlaceholder(savedDraft)) return savedDraft;

  return createDefaultDocument();
}

function createInitialTabSession(): DocumentTabSession {
  const savedTabsRecord = loadDocumentTabsRecord();
  if (savedTabsRecord?.tabs.length) {
    const restoredTabs = savedTabsRecord.tabs.filter((tab) => !isLegacySamplePlaceholder(tab.document));
    if (!restoredTabs.length) {
      const initialTab = createDocumentTab(createInitialDocument());
      return { tabs: [initialTab], activeTabId: initialTab.id };
    }

    return {
      tabs: restoredTabs,
      activeTabId: restoredTabs.some((tab) => tab.id === savedTabsRecord.activeTabId)
        ? savedTabsRecord.activeTabId
        : restoredTabs[0].id
    };
  }

  const initialTab = createDocumentTab(createInitialDocument());
  return {
    tabs: [initialTab],
    activeTabId: initialTab.id
  };
}

function isLegacySamplePlaceholder(document: MarkdownDocument): boolean {
  if (document.markdown !== LEGACY_SAMPLE_MARKDOWN) return false;
  return replaceableDraftTabId(
    [{ id: "legacy-sample", document }],
    "legacy-sample",
    [LEGACY_SAMPLE_MARKDOWN]
  ) !== null;
}

function createDefaultDocument(markdown = "", fileName = "Untitled.md"): MarkdownDocument {
  return {
    fileName,
    filePath: null,
    markdown,
    lastSavedMarkdown: markdown,
    lineEnding: "lf",
    lastBackupPath: null,
    fileStats: null
  };
}

function createDocumentTab(document: MarkdownDocument, createdAt = Date.now()): DocumentTab {
  return {
    id: createTabId(),
    document,
    createdAt
  };
}

function createTabId(): string {
  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function resolveDocumentStateUpdate(current: MarkdownDocument, update: SetStateAction<MarkdownDocument>): MarkdownDocument {
  return typeof update === "function" ? (update as (value: MarkdownDocument) => MarkdownDocument)(current) : update;
}

function resolveDocumentTabsStateUpdate(current: DocumentTab[], update: SetStateAction<DocumentTab[]>): DocumentTab[] {
  return typeof update === "function" ? (update as (value: DocumentTab[]) => DocumentTab[])(current) : update;
}

function sameDocumentTabOrder(left: readonly DocumentTab[], right: readonly DocumentTab[]): boolean {
  return left.length === right.length && left.every((tab, index) => tab.id === right[index]?.id);
}

type ViewModeIconProps = {
  mode: ViewMode;
};

function ViewModeIcon({ mode }: ViewModeIconProps) {
  switch (mode) {
    case "focus":
      return <PanelTop />;
    case "split":
      return <Columns2 />;
    case "preview":
      return <Eye />;
    case "wysiwyg":
      return <PenLine />;
  }
}

type ViewMenuItemProps = {
  mode: ViewMode;
  activeMode: ViewMode;
  t: Translator;
  onSelect: (mode: ViewMode) => void;
};

function ViewMenuItem({ mode, activeMode, t, onSelect }: ViewMenuItemProps) {
  const labels: Record<ViewMode, string> = {
    focus: "Focus",
    split: "Split",
    preview: "Preview",
    wysiwyg: "Visual"
  };
  const active = mode === activeMode;

  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={active}
      onClick={() => onSelect(mode)}
    >
      <ViewModeIcon mode={mode} />
      <span>{t(labels[mode])}</span>
    </button>
  );
}

function tabDropPositionForClientX(element: HTMLElement, clientX: number): DocumentTabDropPosition {
  const rect = element.getBoundingClientRect();
  return clientX < rect.left + rect.width / 2 ? "before" : "after";
}

function sameMarkdownDocument(left: MarkdownDocument, right: MarkdownDocument): boolean {
  return (
    left.fileName === right.fileName &&
    left.filePath === right.filePath &&
    left.markdown === right.markdown &&
    left.lastSavedMarkdown === right.lastSavedMarkdown &&
    left.lineEnding === right.lineEnding &&
    (left.lastBackupPath ?? null) === (right.lastBackupPath ?? null) &&
    (left.fileStats?.modifiedMs ?? null) === (right.fileStats?.modifiedMs ?? null) &&
    (left.fileStats?.size ?? null) === (right.fileStats?.size ?? null)
  );
}

function activeDocumentFromSession(session: DocumentTabSession): MarkdownDocument | null {
  return session.tabs.find((tab) => tab.id === session.activeTabId)?.document ?? session.tabs[0]?.document ?? null;
}

function sameDocumentTabSession(
  leftTabs: DocumentTab[],
  leftActiveTabId: string,
  rightTabs: DocumentTab[],
  rightActiveTabId: string
): boolean {
  if (leftActiveTabId !== rightActiveTabId || leftTabs.length !== rightTabs.length) return false;

  return leftTabs.every((leftTab, index) => {
    const rightTab = rightTabs[index];
    return (
      Boolean(rightTab)
      && leftTab.id === rightTab.id
      && leftTab.createdAt === rightTab.createdAt
      && sameMarkdownDocument(leftTab.document, rightTab.document)
    );
  });
}

function workspaceFileCommands(
  files: WorkspaceFile[],
  openFile: (file: WorkspaceFile) => void | Promise<void>
): CommandItem[] {
  return files.map((file) => ({
    id: `workspace-file:${file.path}`,
    title: file.name,
    group: "Folder",
    detail: file.relativePath,
    searchText: file.relativePath,
    hiddenWhenQueryEmpty: true,
    run: () => openFile(file)
  }));
}

function documentTabCommands(
  tabs: DocumentTab[],
  activeTabId: string,
  switchTab: (tabId: string) => void
): CommandItem[] {
  return tabs.map((tab, index) => {
    const displayName = displayMarkdownDocumentName(tab.document);
    return {
      id: `document-tab:${tab.id}`,
      title: `Switch to ${displayName}`,
      group: "Tabs",
      detail: documentTabCommandDetail(tab),
      searchText: `tab ${index + 1} ${displayName} ${tab.document.fileName} ${tab.document.filePath ?? ""}`,
      shortcut: documentTabCommandShortcut(index, tabs.length),
      disabled: tab.id === activeTabId,
      hiddenWhenQueryEmpty: true,
      run: () => switchTab(tab.id)
    };
  });
}

function documentTabCommandShortcut(index: number, tabCount: number): string | undefined {
  if (index < 8) return `Ctrl+Alt+${index + 1}`;
  if (index === tabCount - 1) return "Ctrl+Alt+9";
  return undefined;
}

function documentTabCommandDetail(tab: DocumentTab): string {
  const state = isDocumentDirty(tab.document) ? "Unsaved" : "Saved";
  return tab.document.filePath ? `${state} - ${tab.document.filePath}` : `${state} - local draft`;
}

function allTableRowPositions(tableBlock: TableBlock): number[] {
  return [0, ...tableBlock.table.rows.map((_row, index) => index + 2)];
}

function tableBodyRowPositions(tableBlock: TableBlock): number[] {
  return tableBlock.table.rows.map((_row, index) => index + 2);
}

function tableSourceRowForPastedOffset(startRow: number, rowOffset: number): number {
  if (startRow === 0) return rowOffset === 0 ? 0 : rowOffset + 1;
  if (startRow === 1) return rowOffset + 2;
  return startRow + rowOffset;
}

function clipboardTableSourceLabel(source: ClipboardTableSource): string {
  switch (source) {
    case "html":
      return "HTML table";
    case "markdown":
      return "Markdown table";
    case "tsv":
      return "TSV";
    case "csv":
      return "CSV";
    case "space":
      return "space-aligned table";
    case "lines":
      return "lines";
  }
}

type IconButtonProps = {
  label: string;
  icon: ReactNode;
  className?: string;
  disabled?: boolean;
  onClick: () => void;
};

function IconButton({ label, icon, className, disabled, onClick }: IconButtonProps) {
  return (
    <button className={["tool-button", className].filter(Boolean).join(" ")} type="button" title={label} aria-label={label} disabled={disabled} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

type ToolbarActionMenuProps = {
  label: string;
  icon: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
  wide?: boolean;
};

function ToolbarActionMenu({ label, icon, children, align = "left", wide = false }: ToolbarActionMenuProps) {
  const className = [
    "toolbar-action-menu-wrap",
    align === "right" ? "align-right" : "",
    wide ? "wide" : ""
  ].filter(Boolean).join(" ");

  return (
    <details
      className={className}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.removeAttribute("open");
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.currentTarget.removeAttribute("open");
        event.currentTarget.querySelector<HTMLElement>("summary")?.focus();
      }}
    >
      <summary className="tool-button toolbar-menu-trigger" title={label} aria-label={label} aria-haspopup="menu">
        {icon}
        <span className="toolbar-menu-label">{label}</span>
        <ChevronDown className="toolbar-menu-chevron" />
      </summary>
      <div className="toolbar-action-menu" role="menu" aria-label={label}>
        {children}
      </div>
    </details>
  );
}

function MenuSectionLabel({ children }: { children: ReactNode }) {
  return <div className="toolbar-menu-section-label" role="presentation">{children}</div>;
}

type ToolbarMenuToggleProps = Omit<IconButtonProps, "onClick"> & {
  checked: boolean;
  onToggle: () => void;
};

function ToolbarMenuToggle({ label, icon, checked, disabled, onToggle }: ToolbarMenuToggleProps) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={(event) => {
        event.currentTarget.closest("details")?.removeAttribute("open");
        onToggle();
      }}
    >
      {icon}
      <span>{label}</span>
      <Check className={checked ? "menu-check visible" : "menu-check"} />
    </button>
  );
}

type TableActionMenuProps = {
  label: string;
  children: ReactNode;
};

function TableActionMenu({ label, children }: TableActionMenuProps) {
  return (
    <details
      className="table-action-menu-wrap"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.removeAttribute("open");
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.currentTarget.removeAttribute("open");
        event.currentTarget.querySelector<HTMLElement>("summary")?.focus();
      }}
    >
      <summary className="tool-button" title={label} aria-label={label} aria-haspopup="menu">
        <Ellipsis />
        <span>{label}</span>
      </summary>
      <div className="table-action-menu" role="menu" aria-label={label}>
        {children}
      </div>
    </details>
  );
}

type TableMenuItemProps = IconButtonProps & {
  danger?: boolean;
};

function TableMenuItem({ label, icon, disabled, onClick, danger = false }: TableMenuItemProps) {
  return (
    <button
      className={danger ? "danger" : undefined}
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={(event) => {
        event.currentTarget.closest("details")?.removeAttribute("open");
        onClick();
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function InspectorIconButton({ label, icon, disabled, onClick }: IconButtonProps) {
  return (
    <button className="tiny-action-button" type="button" title={label} aria-label={label} disabled={disabled} onClick={onClick}>
      {icon}
    </button>
  );
}

type CopyRichToolButtonProps = {
  onCopy: () => void | Promise<void>;
  label: string;
};

function CopyRichToolButton({ onCopy, label }: CopyRichToolButtonProps) {
  function run(event: ReactMouseEvent<HTMLButtonElement> | ReactKeyboardEvent<HTMLButtonElement>) {
    event.preventDefault();
    void onCopy();
  }

  return (
    <button
      className="tool-button"
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={run}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") run(event);
      }}
    >
      <ClipboardCopy />
      <span>{label}</span>
    </button>
  );
}

type AlignmentButtonProps = {
  alignment: TableAlignment;
  active: boolean;
  label?: string;
  onClick: () => void;
};

function AlignmentButton({ alignment, active, label = alignmentButtonLabel(alignment), onClick }: AlignmentButtonProps) {
  return (
    <button
      className={active ? "alignment-button active" : "alignment-button"}
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {alignmentIcon(alignment)}
    </button>
  );
}

function alignmentButtonLabel(alignment: TableAlignment): string {
  switch (alignment) {
    case "none":
      return "Default alignment";
    case "left":
      return "Align left";
    case "center":
      return "Align center";
    case "right":
      return "Align right";
  }
}

function alignmentIcon(alignment: TableAlignment): ReactNode {
  switch (alignment) {
    case "none":
      return <AlignJustify />;
    case "left":
      return <AlignLeft />;
    case "center":
      return <AlignCenter />;
    case "right":
      return <AlignRight />;
  }
}
