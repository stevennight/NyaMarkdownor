import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ChevronRight,
  FileClock,
  FileText,
  FolderX,
  GitCompareArrows,
  History,
  LoaderCircle,
  Trash2,
  X
} from "lucide-react";
import type { DraftSnapshot } from "../lib/draftSnapshots";
import {
  fileHistoryVersionKey,
  mergeFileHistoryVersions,
  partitionFileHistoryDocuments,
  type FileHistoryDocument,
  type FileHistoryVersion
} from "../lib/fileHistory";
import type { MarkdownBackup } from "../lib/fileIo";
import type { Translator } from "../lib/i18n";

type FileHistoryManagerDialogProps = {
  open: boolean;
  documents: FileHistoryDocument[];
  loading: boolean;
  t: Translator;
  onClose: () => void;
  onLoadDiskVersions: (document: FileHistoryDocument) => Promise<MarkdownBackup[]>;
  onOpenDiskVersion: (document: FileHistoryDocument, backup: MarkdownBackup) => void | Promise<void>;
  onOpenSnapshot: (snapshot: DraftSnapshot) => void;
  onCompareVersions: (document: FileHistoryDocument, versions: FileHistoryVersion[]) => Promise<void>;
  onDeleteDocument: (document: FileHistoryDocument) => Promise<boolean>;
  onDeleteDocuments: (documents: FileHistoryDocument[]) => Promise<string[]>;
  onDeleteDiskVersion: (document: FileHistoryDocument, backup: MarkdownBackup) => Promise<boolean>;
  onDeleteSnapshot: (snapshot: DraftSnapshot) => Promise<boolean>;
  onDeleteVersions: (
    document: FileHistoryDocument,
    versions: FileHistoryVersion[]
  ) => Promise<FileHistoryVersionDeleteResult>;
};

export type FileHistoryVersionDeleteResult = {
  deletedDiskPaths: string[];
  deletedSnapshotIds: string[];
};

type HistoryCategory = "documents" | "orphaned";

export function FileHistoryManagerDialog({
  open,
  documents,
  loading,
  t,
  onClose,
  onLoadDiskVersions,
  onOpenDiskVersion,
  onOpenSnapshot,
  onCompareVersions,
  onDeleteDocument,
  onDeleteDocuments,
  onDeleteDiskVersion,
  onDeleteSnapshot,
  onDeleteVersions
}: FileHistoryManagerDialogProps) {
  const [category, setCategory] = useState<HistoryCategory>("documents");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [diskVersions, setDiskVersions] = useState<MarkdownBackup[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState(false);
  const [selectedDocumentKeys, setSelectedDocumentKeys] = useState<Set<string>>(() => new Set());
  const [selectedVersionKeys, setSelectedVersionKeys] = useState<Set<string>>(() => new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [comparing, setComparing] = useState(false);
  const groups = useMemo(() => partitionFileHistoryDocuments(documents), [documents]);
  const selectedDocument = selectedKey
    ? documents.find((document) => document.key === selectedKey) ?? null
    : null;
  const visibleDocuments = groups[category];
  const versions = useMemo(
    () => selectedDocument
      ? mergeFileHistoryVersions(diskVersions, selectedDocument.snapshots, selectedDocument.key)
      : [],
    [diskVersions, selectedDocument]
  );
  const selectedDocuments = useMemo(
    () => visibleDocuments.filter((document) => selectedDocumentKeys.has(document.key)),
    [selectedDocumentKeys, visibleDocuments]
  );
  const selectedVersions = useMemo(
    () => versions.filter((version) => selectedVersionKeys.has(fileHistoryVersionKey(version))),
    [selectedVersionKeys, versions]
  );

  useEffect(() => {
    if (!open) {
      setSelectedKey(null);
      setDiskVersions([]);
      setVersionsLoading(false);
      setVersionsError(false);
      setSelectedDocumentKeys(new Set());
      setSelectedVersionKeys(new Set());
      setBatchDeleting(false);
      setComparing(false);
    }
  }, [open]);

  useEffect(() => {
    const available = new Set(visibleDocuments.map((document) => document.key));
    setSelectedDocumentKeys((current) => intersectSelection(current, available));
  }, [visibleDocuments]);

  useEffect(() => {
    const available = new Set(versions.map(fileHistoryVersionKey));
    setSelectedVersionKeys((current) => intersectSelection(current, available));
  }, [versions]);

  useEffect(() => {
    if (!selectedKey || selectedDocument) return;
    setSelectedKey(null);
    setDiskVersions([]);
    setSelectedVersionKeys(new Set());
  }, [selectedDocument, selectedKey]);

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (selectedKey) {
        setSelectedKey(null);
        setDiskVersions([]);
        setSelectedVersionKeys(new Set());
      } else {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open, selectedKey]);

  useEffect(() => {
    if (!open || !selectedDocument) return undefined;
    let cancelled = false;
    setVersionsLoading(true);
    setVersionsError(false);
    setDiskVersions([]);

    void onLoadDiskVersions(selectedDocument)
      .then((next) => {
        if (!cancelled) setDiskVersions(next);
      })
      .catch((error) => {
        console.warn(error);
        if (!cancelled) setVersionsError(true);
      })
      .finally(() => {
        if (!cancelled) setVersionsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, selectedDocument?.key]);

  if (!open) return null;

  function selectCategory(nextCategory: HistoryCategory) {
    setCategory(nextCategory);
    setSelectedKey(null);
    setDiskVersions([]);
    setSelectedDocumentKeys(new Set());
    setSelectedVersionKeys(new Set());
  }

  async function deleteDocument(document: FileHistoryDocument) {
    if (await onDeleteDocument(document)) {
      if (selectedKey === document.key) setSelectedKey(null);
      setDiskVersions([]);
    }
  }

  async function deleteDiskVersion(document: FileHistoryDocument, backup: MarkdownBackup) {
    if (!await onDeleteDiskVersion(document, backup)) return;
    setDiskVersions((current) => current.filter((candidate) => candidate.path !== backup.path));
  }

  async function deleteSnapshot(snapshot: DraftSnapshot) {
    if (!await onDeleteSnapshot(snapshot)) return;
    setSelectedVersionKeys((current) => withoutSelectionKey(current, `local:${snapshot.id}`));
  }

  function toggleDocument(documentKey: string, checked: boolean) {
    setSelectedDocumentKeys((current) => toggleSelectionKey(current, documentKey, checked));
  }

  function toggleVersion(versionKey: string, checked: boolean) {
    setSelectedVersionKeys((current) => toggleSelectionKey(current, versionKey, checked));
  }

  function toggleAllDocuments(checked: boolean) {
    setSelectedDocumentKeys(checked
      ? new Set(visibleDocuments.map((document) => document.key))
      : new Set());
  }

  function toggleAllVersions(checked: boolean) {
    setSelectedVersionKeys(checked
      ? new Set(versions.map(fileHistoryVersionKey))
      : new Set());
  }

  async function deleteSelectedDocuments() {
    if (batchDeleting || selectedDocuments.length === 0) return;
    setBatchDeleting(true);
    try {
      const deletedKeys = new Set(await onDeleteDocuments(selectedDocuments));
      setSelectedDocumentKeys((current) => withoutSelectionKeys(current, deletedKeys));
    } finally {
      setBatchDeleting(false);
    }
  }

  async function deleteSelectedVersions() {
    if (batchDeleting || !selectedDocument || selectedVersions.length === 0) return;
    setBatchDeleting(true);
    try {
      const result = await onDeleteVersions(selectedDocument, selectedVersions);
      const deletedDiskPaths = new Set(result.deletedDiskPaths);
      const deletedKeys = new Set([
        ...result.deletedDiskPaths.map((path) => `disk:${path}`),
        ...result.deletedSnapshotIds.map((id) => `local:${id}`)
      ]);
      setDiskVersions((current) => current.filter((backup) => !deletedDiskPaths.has(backup.path)));
      setSelectedVersionKeys((current) => withoutSelectionKeys(current, deletedKeys));
    } finally {
      setBatchDeleting(false);
    }
  }

  async function compareHistoryVersions(nextVersions: FileHistoryVersion[]) {
    if (!selectedDocument || comparing || nextVersions.length < 1 || nextVersions.length > 2) return;
    setComparing(true);
    try {
      await onCompareVersions(selectedDocument, nextVersions);
    } finally {
      setComparing(false);
    }
  }

  const categoryLabel = category === "documents" ? t("Document history") : t("Orphaned file history");

  return (
    <div className="settings-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="settings-dialog file-history-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("File history management")}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="settings-header">
          <div className="file-history-heading">
            <div className="settings-title">{t("File history management")}</div>
            <div className="settings-subtitle">{selectedDocument?.fileName ?? categoryLabel}</div>
          </div>
          <button className="icon-only" type="button" aria-label={t("Close file history management")} title={t("Close file history management")} onClick={onClose}>
            <X />
          </button>
        </header>

        <div className="settings-body file-history-body">
          <nav className="settings-nav" aria-label={t("File history categories")}>
            <HistoryCategoryButton
              active={category === "documents"}
              count={groups.documents.length}
              icon={<FileClock size={17} />}
              label={t("Document history")}
              onClick={() => selectCategory("documents")}
            />
            <HistoryCategoryButton
              active={category === "orphaned"}
              count={groups.orphaned.length}
              icon={<FolderX size={17} />}
              label={t("Orphaned file history")}
              onClick={() => selectCategory("orphaned")}
            />
          </nav>

          <div className="settings-content file-history-content">
            {selectedDocument ? (
              <section className="file-history-detail" aria-label={t("Versions for {name}", { name: selectedDocument.fileName })}>
                <div className="file-history-detail-header">
                  <button
                    className="file-history-back"
                    type="button"
                    aria-label={t("Back to documents")}
                    title={t("Back to documents")}
                    onClick={() => {
                      setSelectedKey(null);
                      setSelectedVersionKeys(new Set());
                    }}
                  >
                    <ArrowLeft size={16} />
                    <span>{t("Back to documents")}</span>
                  </button>
                  <div className="file-history-document-copy">
                    <strong>{selectedDocument.fileName}</strong>
                    <span title={selectedDocument.filePath ?? undefined}>{selectedDocument.filePath ?? t("Local draft")}</span>
                  </div>
                  <button
                    className="file-history-delete-button"
                    type="button"
                    aria-label={t("Delete all history for {name}", { name: selectedDocument.fileName })}
                    title={t("Delete all document history")}
                    onClick={() => void deleteDocument(selectedDocument)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                <HistorySelectionBar
                  allSelected={versions.length > 0 && selectedVersions.length === versions.length}
                  deleting={batchDeleting}
                  disabled={versionsLoading || versions.length === 0}
                  partiallySelected={selectedVersions.length > 0 && selectedVersions.length < versions.length}
                  selectedCount={selectedVersions.length}
                  comparing={comparing}
                  compareDisabled={selectedVersions.length < 1 || selectedVersions.length > 2}
                  compareLabel={selectedVersions.length === 2 ? t("Compare versions") : t("Compare with current content")}
                  compareTitle={selectedVersions.length > 2
                    ? t("Select one or two versions to compare")
                    : selectedVersions.length === 2
                      ? t("Compare selected versions")
                      : t("Compare selected version with current content")}
                  selectAllLabel={t("Select all versions")}
                  summary={t("{count} versions", { count: versions.length })}
                  t={t}
                  onDelete={() => void deleteSelectedVersions()}
                  onCompare={() => void compareHistoryVersions(selectedVersions)}
                  onToggleAll={toggleAllVersions}
                />
                {versionsLoading ? (
                  <HistoryEmpty icon={<LoaderCircle className="spin" />} label={t("Loading versions")} />
                ) : versionsError ? (
                  <HistoryEmpty icon={<History />} label={t("Versions could not be loaded")} />
                ) : versions.length === 0 ? (
                  <HistoryEmpty icon={<History />} label={t("No versions remain")} />
                ) : (
                  <div className="file-history-version-list">
                    {versions.map((version) => {
                      if (version.source === "disk") {
                        const backup = version.backup;
                        return (
                          <HistoryVersionRow
                            key={`disk:${backup.path}`}
                            checked={selectedVersionKeys.has(fileHistoryVersionKey(version))}
                            title={formatHistoryTime(version.timestamp)}
                            detail={`${t(backupKindMessage(backup.kind))} - ${formatBytes(backup.size)}`}
                            selectLabel={t("Select version from {time}", { time: formatHistoryTime(version.timestamp) })}
                            openLabel={t("Open version as draft")}
                            deleteLabel={t("Delete this version")}
                            compareLabel={t("Compare this version with current content")}
                            compareDisabled={comparing}
                            onOpen={() => void onOpenDiskVersion(selectedDocument, backup)}
                            onDelete={() => void deleteDiskVersion(selectedDocument, backup)}
                            onCompare={() => void compareHistoryVersions([version])}
                            onToggle={(checked) => toggleVersion(fileHistoryVersionKey(version), checked)}
                          />
                        );
                      }

                      const snapshot = version.snapshot;
                      return (
                        <HistoryVersionRow
                          key={`local:${snapshot.id}`}
                          checked={selectedVersionKeys.has(fileHistoryVersionKey(version))}
                          title={formatHistoryTime(version.timestamp)}
                          detail={`${t(snapshotReasonMessage(snapshot))} - ${formatBytes(snapshot.size)}`}
                          selectLabel={t("Select version from {time}", { time: formatHistoryTime(version.timestamp) })}
                          openLabel={t("Open version as draft")}
                          deleteLabel={t("Delete this version")}
                          compareLabel={t("Compare this version with current content")}
                          compareDisabled={comparing}
                          onOpen={() => onOpenSnapshot(snapshot)}
                          onDelete={() => void deleteSnapshot(snapshot)}
                          onCompare={() => void compareHistoryVersions([version])}
                          onToggle={(checked) => toggleVersion(fileHistoryVersionKey(version), checked)}
                        />
                      );
                    })}
                  </div>
                )}
              </section>
            ) : (
              <section className="file-history-document-list" aria-label={categoryLabel}>
                <div className="file-history-list-header">
                  <div>
                    <strong>{categoryLabel}</strong>
                    <span>
                      {category === "documents"
                        ? t("Manage retained versions by document")
                        : t("History whose source file is missing")}
                    </span>
                  </div>
                  <span>{t("{count} documents", { count: visibleDocuments.length })}</span>
                </div>
                <HistorySelectionBar
                  allSelected={visibleDocuments.length > 0 && selectedDocuments.length === visibleDocuments.length}
                  deleting={batchDeleting}
                  disabled={loading || visibleDocuments.length === 0}
                  partiallySelected={selectedDocuments.length > 0 && selectedDocuments.length < visibleDocuments.length}
                  selectedCount={selectedDocuments.length}
                  selectAllLabel={t("Select all documents")}
                  summary={t("{count} documents", { count: visibleDocuments.length })}
                  t={t}
                  onDelete={() => void deleteSelectedDocuments()}
                  onToggleAll={toggleAllDocuments}
                />
                {loading ? (
                  <HistoryEmpty icon={<LoaderCircle className="spin" />} label={t("Loading file history")} />
                ) : visibleDocuments.length === 0 ? (
                  <HistoryEmpty
                    icon={category === "documents" ? <FileText /> : <FolderX />}
                    label={category === "documents" ? t("No document history") : t("No orphaned file history")}
                  />
                ) : (
                  visibleDocuments.map((document) => (
                    <div
                      className={`file-history-document-row${selectedDocumentKeys.has(document.key) ? " selected" : ""}`}
                      key={document.key}
                    >
                      <label className="file-history-row-checkbox">
                        <SelectionCheckbox
                          checked={selectedDocumentKeys.has(document.key)}
                          label={t("Select {name}", { name: document.fileName })}
                          onChange={(checked) => toggleDocument(document.key, checked)}
                        />
                      </label>
                      <button className="file-history-document-open" type="button" onClick={() => setSelectedKey(document.key)}>
                        <FileText size={17} />
                        <span className="file-history-document-copy">
                          <strong>{document.fileName}</strong>
                          <span title={document.filePath ?? undefined}>{document.filePath ?? t("Local draft")}</span>
                          <small>
                            {t("{count} versions", { count: document.versionCount })} - {formatBytes(document.totalSize)} - {formatHistoryTime(document.latestMs)}
                          </small>
                        </span>
                        <ChevronRight size={16} />
                      </button>
                      <button
                        className="file-history-delete-button"
                        type="button"
                        aria-label={t("Delete all history for {name}", { name: document.fileName })}
                        title={t("Delete all document history")}
                        onClick={() => void deleteDocument(document)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))
                )}
              </section>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

type HistoryCategoryButtonProps = {
  active: boolean;
  count: number;
  icon: ReactNode;
  label: string;
  onClick: () => void;
};

function HistoryCategoryButton({ active, count, icon, label, onClick }: HistoryCategoryButtonProps) {
  return (
    <button className={`settings-nav-item file-history-nav-item${active ? " active" : ""}`} type="button" aria-current={active ? "page" : undefined} onClick={onClick}>
      {icon}
      <span>{label}</span>
      <small>{count}</small>
    </button>
  );
}

type HistoryVersionRowProps = {
  checked: boolean;
  title: string;
  detail: string;
  selectLabel: string;
  openLabel: string;
  deleteLabel: string;
  compareLabel: string;
  compareDisabled: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onCompare: () => void;
  onToggle: (checked: boolean) => void;
};

function HistoryVersionRow({
  checked,
  title,
  detail,
  selectLabel,
  openLabel,
  deleteLabel,
  compareLabel,
  compareDisabled,
  onOpen,
  onDelete,
  onCompare,
  onToggle
}: HistoryVersionRowProps) {
  return (
    <div className={`file-history-version-row${checked ? " selected" : ""}`}>
      <label className="file-history-row-checkbox">
        <SelectionCheckbox checked={checked} label={selectLabel} onChange={onToggle} />
      </label>
      <button className="file-history-version-open" type="button" title={openLabel} onClick={onOpen}>
        <History size={16} />
        <span>
          <strong>{title}</strong>
          <small>{detail}</small>
        </span>
      </button>
      <button
        className="file-history-compare-button"
        type="button"
        aria-label={compareLabel}
        title={compareLabel}
        disabled={compareDisabled}
        onClick={onCompare}
      >
        <GitCompareArrows size={15} />
      </button>
      <button className="file-history-delete-button" type="button" aria-label={deleteLabel} title={deleteLabel} onClick={onDelete}>
        <Trash2 size={15} />
      </button>
    </div>
  );
}

type HistorySelectionBarProps = {
  allSelected: boolean;
  deleting: boolean;
  disabled: boolean;
  partiallySelected: boolean;
  selectedCount: number;
  comparing?: boolean;
  compareDisabled?: boolean;
  compareLabel?: string;
  compareTitle?: string;
  selectAllLabel: string;
  summary: string;
  t: Translator;
  onDelete: () => void;
  onCompare?: () => void;
  onToggleAll: (checked: boolean) => void;
};

function HistorySelectionBar({
  allSelected,
  deleting,
  disabled,
  partiallySelected,
  selectedCount,
  comparing = false,
  compareDisabled = true,
  compareLabel,
  compareTitle,
  selectAllLabel,
  summary,
  t,
  onDelete,
  onCompare,
  onToggleAll
}: HistorySelectionBarProps) {
  return (
    <div className="file-history-selection-bar">
      <label className="file-history-select-all">
        <SelectionCheckbox
          checked={allSelected}
          disabled={disabled || deleting}
          indeterminate={partiallySelected}
          label={selectAllLabel}
          onChange={onToggleAll}
        />
        <span>{selectedCount > 0 ? t("{count} selected", { count: selectedCount }) : summary}</span>
      </label>
      <div className="file-history-selection-actions">
        {onCompare && compareLabel && (
          <button
            className="file-history-bulk-compare"
            type="button"
            disabled={compareDisabled || deleting || comparing}
            title={compareTitle ?? compareLabel}
            onClick={onCompare}
          >
            {comparing ? <LoaderCircle className="spin" size={15} /> : <GitCompareArrows size={15} />}
            <span>{comparing ? t("Preparing comparison") : compareLabel}</span>
          </button>
        )}
        <button
          className="file-history-bulk-delete"
          type="button"
          disabled={selectedCount === 0 || deleting || comparing}
          title={t("Delete selected")}
          onClick={onDelete}
        >
          {deleting ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />}
          <span>{deleting ? t("Deleting") : t("Delete selected")}</span>
        </button>
      </div>
    </div>
  );
}

type SelectionCheckboxProps = {
  checked: boolean;
  disabled?: boolean;
  indeterminate?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
};

function SelectionCheckbox({ checked, disabled = false, indeterminate = false, label, onChange }: SelectionCheckboxProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={inputRef}
      className="file-history-checkbox"
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}

function HistoryEmpty({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="file-history-empty">
      {icon}
      <span>{label}</span>
    </div>
  );
}

function formatHistoryTime(timestamp: number): string {
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat(undefined, {
    ...(date.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }),
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(kilobytes < 10 ? 1 : 0)} KB`;
  const megabytes = kilobytes / 1024;
  return `${megabytes.toFixed(megabytes < 10 ? 1 : 0)} MB`;
}

function backupKindMessage(kind: MarkdownBackup["kind"]): string {
  if (kind === "rolling") return "Automatic version (updating)";
  if (kind === "automatic") return "Automatic version";
  if (kind === "safety") return "Safety checkpoint";
  if (kind === "manual") return "Manual checkpoint";
  return "Legacy backup";
}

function snapshotReasonMessage(snapshot: DraftSnapshot): string {
  if (snapshot.reason === "manual") return "Manual checkpoint";
  if (snapshot.reason === "close" || snapshot.reason === "window-close") return "Before closing";
  if (snapshot.reason === "reload") return "Before reloading";
  if (snapshot.reason === "restore") return "Before restoring";
  if (snapshot.reason === "recovery-discard") return "Recovery content kept";
  if (snapshot.reason === "save-conflict") return "Before resolving save conflict";
  if (snapshot.reason === "save-as-overwrite") return "Before overwriting target";
  if (snapshot.reason === "legacy-idle") return "Legacy automatic checkpoint";
  if (snapshot.reason === "legacy-preserved") return "Legacy checkpoint";
  return snapshot.kind === "manual" ? "Manual checkpoint" : "Safety checkpoint";
}

function intersectSelection(selection: Set<string>, available: Set<string>): Set<string> {
  const next = new Set([...selection].filter((key) => available.has(key)));
  return sameSelection(selection, next) ? selection : next;
}

function toggleSelectionKey(selection: Set<string>, key: string, checked: boolean): Set<string> {
  if (selection.has(key) === checked) return selection;
  const next = new Set(selection);
  if (checked) next.add(key);
  else next.delete(key);
  return next;
}

function withoutSelectionKey(selection: Set<string>, key: string): Set<string> {
  return toggleSelectionKey(selection, key, false);
}

function withoutSelectionKeys(selection: Set<string>, keys: Set<string>): Set<string> {
  if (![...keys].some((key) => selection.has(key))) return selection;
  return new Set([...selection].filter((key) => !keys.has(key)));
}

function sameSelection(left: Set<string>, right: Set<string>): boolean {
  return left.size === right.size && [...left].every((key) => right.has(key));
}
