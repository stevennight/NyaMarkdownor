import { useEffect, useId, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorView, lineNumbers } from "@codemirror/view";
import { MergeView, unifiedMergeView } from "@codemirror/merge";
import { ArrowRight, Columns2, FileText, GitCompareArrows, PanelTop, RotateCcw, X } from "lucide-react";
import type { Translator } from "../lib/i18n";
import "./BackupCompareDialog.css";

export type BackupCompareDialogProps = {
  open: boolean;
  fileName: string;
  backupMarkdown: string;
  currentMarkdown: string;
  backupLabel?: string;
  currentLabel?: string;
  versionTitle?: string;
  currentTitle?: string;
  actionLabel?: string;
  actionIcon?: "restore" | "open";
  restoreDisabled?: boolean;
  t: Translator;
  onClose: () => void;
  onRestore: () => void;
};

type ComparisonLayout = "unified" | "split";

export function BackupCompareDialog({
  open,
  fileName,
  backupMarkdown,
  currentMarkdown,
  backupLabel,
  currentLabel,
  versionTitle,
  currentTitle,
  actionLabel,
  actionIcon = "restore",
  restoreDisabled = false,
  t,
  onClose,
  onRestore
}: BackupCompareDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement | null>(null);
  const diffHostRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);
  const [layout, setLayout] = useState<ComparisonLayout>("split");

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (open) setLayout("split");
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
      ) ?? []).filter((element) => element.offsetWidth > 0 && element.offsetHeight > 0);
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      window.cancelAnimationFrame(focusFrame);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);

  useEffect(() => {
    const host = diffHostRef.current;
    if (!open || !host) return undefined;

    const readOnlyExtensions = [
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      lineNumbers(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      markdown({ base: markdownLanguage }),
      EditorView.lineWrapping,
      EditorView.theme({
        "&": {
          height: "100%",
          background: "var(--editor-bg)",
          color: "var(--text)"
        },
        ".cm-scroller": {
          fontFamily: "var(--mono)",
          fontSize: "13px",
          lineHeight: "1.58",
          overflow: "auto"
        },
        ".cm-content": {
          minHeight: "100%",
          padding: "14px 20px 64px"
        },
        ".cm-gutters": {
          background: "var(--surface-raised)",
          color: "var(--subtle)",
          borderRight: "1px solid var(--line)"
        },
        ".cm-focused": {
          outline: "none"
        }
      })
    ];

    if (layout === "unified") {
      const view = new EditorView({
        parent: host,
        doc: currentMarkdown,
        extensions: [
          ...readOnlyExtensions,
          unifiedMergeView({
            original: backupMarkdown,
            highlightChanges: true,
            gutter: true,
            syntaxHighlightDeletions: true,
            allowInlineDiffs: true,
            mergeControls: false,
            collapseUnchanged: {
              margin: 3,
              minSize: 8
            }
          })
        ]
      });
      return () => view.destroy();
    }

    const view = new MergeView({
      parent: host,
      a: { doc: backupMarkdown, extensions: readOnlyExtensions },
      b: { doc: currentMarkdown, extensions: readOnlyExtensions },
      highlightChanges: true,
      gutter: true,
      collapseUnchanged: {
        margin: 3,
        minSize: 8
      }
    });

    return () => view.destroy();
  }, [backupMarkdown, currentMarkdown, layout, open]);

  if (!open) return null;

  return (
    <div className="backup-compare-overlay" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="backup-compare-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="backup-compare-header">
          <div className="backup-compare-heading">
            <GitCompareArrows aria-hidden="true" />
            <div>
              <h2 id={titleId}>{t("Compare version")}</h2>
              <p title={fileName}>{fileName}</p>
            </div>
          </div>
          <div className="backup-compare-header-actions">
            <div className="backup-compare-layout-switch" role="group" aria-label={t("Comparison layout")}>
              <button
                className={layout === "unified" ? "active" : ""}
                type="button"
                aria-label={t("Unified comparison")}
                aria-pressed={layout === "unified"}
                title={t("Unified comparison")}
                onClick={() => setLayout("unified")}
              >
                <PanelTop />
              </button>
              <button
                className={layout === "split" ? "active" : ""}
                type="button"
                aria-label={t("Side-by-side comparison")}
                aria-pressed={layout === "split"}
                title={t("Side-by-side comparison")}
                onClick={() => setLayout("split")}
              >
                <Columns2 />
              </button>
            </div>
            <button
              ref={closeButtonRef}
              className="backup-compare-icon-button"
              type="button"
              aria-label={t("Close comparison")}
              title={t("Close comparison")}
              onClick={onClose}
            >
              <X />
            </button>
          </div>
        </header>

        <div className="backup-compare-legend" aria-label={t("Comparison direction")}>
          <div className="backup-compare-version backup-compare-version-old">
            <span aria-hidden="true">-</span>
            <div>
              <strong>{t(versionTitle ?? "Older version")}</strong>
              {backupLabel && <small>{backupLabel}</small>}
            </div>
          </div>
          <div className="backup-compare-direction" aria-hidden="true">
            <ArrowRight />
          </div>
          <div className="backup-compare-version backup-compare-version-current">
            <span aria-hidden="true">+</span>
            <div>
              <strong>{t(currentTitle ?? "Current editor")}</strong>
              {currentLabel && <small>{currentLabel}</small>}
            </div>
          </div>
        </div>

        <div className="backup-compare-diff" ref={diffHostRef} aria-label={t("Version differences")} />

        <footer className="backup-compare-actions">
          <button className="backup-compare-button secondary" type="button" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button
            className="backup-compare-button restore"
            type="button"
            disabled={restoreDisabled}
            onClick={onRestore}
          >
            {actionIcon === "open" ? <FileText aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
            <span>{t(actionLabel ?? "Restore this version")}</span>
          </button>
        </footer>
      </section>
    </div>
  );
}
