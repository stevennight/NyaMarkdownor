import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ChevronRight,
  FileClock,
  FileText,
  FolderX,
  History,
  LoaderCircle,
  Trash2,
  X
} from "lucide-react";
import type { DraftSnapshot } from "../lib/draftSnapshots";
import {
  mergeFileHistoryVersions,
  partitionFileHistoryDocuments,
  type FileHistoryDocument
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
  onDeleteDocument: (document: FileHistoryDocument) => Promise<boolean>;
  onDeleteDiskVersion: (document: FileHistoryDocument, backup: MarkdownBackup) => Promise<boolean>;
  onDeleteSnapshot: (snapshot: DraftSnapshot) => Promise<boolean>;
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
  onDeleteDocument,
  onDeleteDiskVersion,
  onDeleteSnapshot
}: FileHistoryManagerDialogProps) {
  const [category, setCategory] = useState<HistoryCategory>("documents");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [diskVersions, setDiskVersions] = useState<MarkdownBackup[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState(false);
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

  useEffect(() => {
    if (!open) {
      setSelectedKey(null);
      setDiskVersions([]);
      setVersionsLoading(false);
      setVersionsError(false);
    }
  }, [open]);

  useEffect(() => {
    if (!selectedKey || selectedDocument) return;
    setSelectedKey(null);
    setDiskVersions([]);
  }, [selectedDocument, selectedKey]);

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (selectedKey) {
        setSelectedKey(null);
        setDiskVersions([]);
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
                  <button className="file-history-back" type="button" onClick={() => setSelectedKey(null)}>
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

                <div className="file-history-version-summary">
                  {t("{count} versions", { count: versions.length })}
                </div>
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
                            title={formatHistoryTime(version.timestamp)}
                            detail={`${t(backupKindMessage(backup.kind))} - ${formatBytes(backup.size)}`}
                            openLabel={t("Open version as draft")}
                            deleteLabel={t("Delete this version")}
                            onOpen={() => void onOpenDiskVersion(selectedDocument, backup)}
                            onDelete={() => void deleteDiskVersion(selectedDocument, backup)}
                          />
                        );
                      }

                      const snapshot = version.snapshot;
                      return (
                        <HistoryVersionRow
                          key={`local:${snapshot.id}`}
                          title={formatHistoryTime(version.timestamp)}
                          detail={`${t(snapshotReasonMessage(snapshot))} - ${formatBytes(snapshot.size)}`}
                          openLabel={t("Open version as draft")}
                          deleteLabel={t("Delete this version")}
                          onOpen={() => onOpenSnapshot(snapshot)}
                          onDelete={() => void onDeleteSnapshot(snapshot)}
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
                {loading ? (
                  <HistoryEmpty icon={<LoaderCircle className="spin" />} label={t("Loading file history")} />
                ) : visibleDocuments.length === 0 ? (
                  <HistoryEmpty
                    icon={category === "documents" ? <FileText /> : <FolderX />}
                    label={category === "documents" ? t("No document history") : t("No orphaned file history")}
                  />
                ) : (
                  visibleDocuments.map((document) => (
                    <div className="file-history-document-row" key={document.key}>
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
  title: string;
  detail: string;
  openLabel: string;
  deleteLabel: string;
  onOpen: () => void;
  onDelete: () => void;
};

function HistoryVersionRow({ title, detail, openLabel, deleteLabel, onOpen, onDelete }: HistoryVersionRowProps) {
  return (
    <div className="file-history-version-row">
      <button className="file-history-version-open" type="button" title={openLabel} onClick={onOpen}>
        <History size={16} />
        <span>
          <strong>{title}</strong>
          <small>{detail}</small>
        </span>
      </button>
      <button className="file-history-delete-button" type="button" aria-label={deleteLabel} title={deleteLabel} onClick={onDelete}>
        <Trash2 size={15} />
      </button>
    </div>
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
