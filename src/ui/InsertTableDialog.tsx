import { useEffect, useRef } from "react";
import { Table2, X } from "lucide-react";
import type { Translator } from "../lib/i18n";

export type TableSizeDraft = {
  columns: number;
  bodyRows: number;
};

type InsertTableDialogProps = {
  open: boolean;
  value: TableSizeDraft;
  t: Translator;
  onChange: (value: TableSizeDraft) => void;
  onClose: () => void;
  onInsert: (value: TableSizeDraft) => void;
};

export function InsertTableDialog({ open, value, t, onChange, onClose, onInsert }: InsertTableDialogProps) {
  const columnsInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.setTimeout(() => columnsInputRef.current?.select(), 0);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const draft = clampTableSizeDraft(value);

  return (
    <div className="table-size-overlay" role="presentation" onMouseDown={onClose}>
      <section className="table-size-dialog" role="dialog" aria-modal="true" aria-label={t("Insert table")} onMouseDown={(event) => event.stopPropagation()}>
        <header className="table-size-header">
          <div className="table-size-title">
            <Table2 />
            <span>{t("Insert Table")}</span>
          </div>
          <button className="icon-only" type="button" aria-label={t("Close insert table")} title={t("Close insert table")} onClick={onClose}>
            <X />
          </button>
        </header>

        <form
          className="table-size-body"
          onSubmit={(event) => {
            event.preventDefault();
            onInsert(draft);
          }}
        >
          <label className="table-size-row">
            <span>{t("Columns")}</span>
            <input
              ref={columnsInputRef}
              type="number"
              min={1}
              max={12}
              step={1}
              value={draft.columns}
              onChange={(event) => onChange({ ...draft, columns: Number(event.target.value) })}
            />
          </label>
          <label className="table-size-row">
            <span>{t("Body rows")}</span>
            <input
              type="number"
              min={0}
              max={30}
              step={1}
              value={draft.bodyRows}
              onChange={(event) => onChange({ ...draft, bodyRows: Number(event.target.value) })}
            />
          </label>

          <div className="table-size-preview" style={{ gridTemplateColumns: `repeat(${Math.min(draft.columns, 6)}, 1fr)` }} aria-hidden="true">
            {previewCells(draft).map((cell) => (
              <i key={cell.index} className={cell.header ? "header" : undefined} />
            ))}
          </div>

          <div className="table-size-actions">
            <button className="confirm-button secondary" type="button" onClick={onClose}>
              {t("Cancel")}
            </button>
            <button className="confirm-button primary" type="submit">
              {t("Insert")}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function clampTableSizeDraft(value: TableSizeDraft): TableSizeDraft {
  return {
    columns: clampNumber(value.columns, 1, 12),
    bodyRows: clampNumber(value.bodyRows, 0, 30)
  };
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function previewCells(value: TableSizeDraft): Array<{ index: number; header: boolean }> {
  const columns = Math.min(value.columns, 6);
  const rows = Math.min(value.bodyRows + 2, 6);
  return Array.from({ length: columns * rows }, (_value, index) => ({
    index,
    header: index < columns
  }));
}
