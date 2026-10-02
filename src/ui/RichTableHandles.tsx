import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/core";
import { Plus } from "lucide-react";
import { CellSelection, TableMap } from "@tiptap/pm/tables";
import type { Translator } from "../lib/i18n";
import type { RichTablePosition } from "../lib/richTableGrid";

type Span = { start: number; size: number };

type TableLayout = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  columns: Array<Span | null>;
  rows: Span[];
};

type Selected = { rows: Set<number>; columns: Set<number> };

type RichTableHandlesProps = {
  editor: Editor;
  host: HTMLElement;
  position: RichTablePosition;
  t: Translator;
  onSelectLine: (kind: "row" | "column", index: number) => void;
  onAppendLine: (kind: "row" | "column") => void;
};

/**
 * Grips beside the table under the cursor: a bar above each column and left of
 * each row selects it (and opens the table bar for it); the "+" buttons append
 * a row or column. They sit in the scroll host, outside the editable document.
 */
export function RichTableHandles({ editor, host, position, t, onSelectLine, onAppendLine }: RichTableHandlesProps) {
  const [layout, setLayout] = useState<TableLayout | null>(null);
  const [selected, setSelected] = useState<Selected>({ rows: new Set(), columns: new Set() });

  useEffect(() => {
    let frame: number | null = null;
    const measure = () => {
      frame = null;
      setLayout(measureTable(editor, host, position.tablePos));
      setSelected(selectedLines(editor, position.tablePos));
    };
    const schedule = () => {
      if (frame === null) frame = window.requestAnimationFrame(measure);
    };

    measure();
    const tableElement = tableDom(editor, position.tablePos);
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    if (tableElement) resizeObserver?.observe(tableElement);
    editor.on("transaction", schedule);
    // Capture also catches horizontal scrolling inside wide table wrappers.
    host.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      editor.off("transaction", schedule);
      host.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
    };
  }, [editor, host, position.tablePos, position.rowCount, position.columnCount]);

  if (!layout) return null;

  const width = layout.right - layout.left;
  const height = layout.bottom - layout.top;
  return (
    <div className="rich-table-handles">
      {layout.columns.map((column, index) => column && (
        <button
          key={`column-${index}`}
          className={[
            "rich-table-grip column",
            index === position.column ? "current" : "",
            selected.columns.has(index) ? "selected" : ""
          ].filter(Boolean).join(" ")}
          type="button"
          tabIndex={-1}
          title={t("Select column")}
          aria-label={t("Select column {column}", { column: index + 1 })}
          style={{ left: column.start + 2, top: layout.top - 13, width: Math.max(8, column.size - 4) }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onSelectLine("column", index)}
        />
      ))}
      {layout.rows.map((row, index) => (
        <button
          key={`row-${index}`}
          className={[
            "rich-table-grip row",
            index === position.row ? "current" : "",
            selected.rows.has(index) ? "selected" : ""
          ].filter(Boolean).join(" ")}
          type="button"
          tabIndex={-1}
          title={t("Select row")}
          aria-label={t("Select row {row}", { row: index + 1 })}
          style={{ left: layout.left - 13, top: row.start + 2, height: Math.max(8, row.size - 4) }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onSelectLine("row", index)}
        />
      ))}
      <button
        className="rich-table-append column"
        type="button"
        tabIndex={-1}
        title={t("Add column at end")}
        aria-label={t("Add column at end")}
        style={{ left: layout.right + 4, top: layout.top, height }}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onAppendLine("column")}
      >
        <Plus />
      </button>
      <button
        className="rich-table-append row"
        type="button"
        tabIndex={-1}
        title={t("Add row at end")}
        aria-label={t("Add row at end")}
        style={{ left: layout.left, top: layout.bottom + 4, width }}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onAppendLine("row")}
      >
        <Plus />
      </button>
    </div>
  );
}

function tableDom(editor: Editor, tablePos: number): HTMLTableElement | null {
  const node = editor.view.nodeDOM(tablePos);
  if (node instanceof HTMLTableElement) return node;
  return node instanceof HTMLElement ? node.querySelector("table") : null;
}

function measureTable(editor: Editor, host: HTMLElement, tablePos: number): TableLayout | null {
  if (editor.isDestroyed) return null;
  const table = tableDom(editor, tablePos);
  if (!table || !host.contains(table)) return null;

  const hostRect = host.getBoundingClientRect();
  const x = (value: number) => value - hostRect.left + host.scrollLeft;
  const y = (value: number) => value - hostRect.top + host.scrollTop;

  // Wide tables scroll inside their wrapper; only show grips for visible columns.
  const tableRect = table.getBoundingClientRect();
  const clip = (table.parentElement ?? table).getBoundingClientRect();
  const visibleLeft = Math.max(tableRect.left, clip.left);
  const visibleRight = Math.min(tableRect.right, clip.right);

  const firstRow = table.rows[0];
  const columns = firstRow
    ? Array.from(firstRow.cells, (cell) => {
      const rect = cell.getBoundingClientRect();
      const left = Math.max(rect.left, visibleLeft);
      const right = Math.min(rect.right, visibleRight);
      return right - left < 12 ? null : { start: x(left), size: right - left };
    })
    : [];
  const rows = Array.from(table.rows, (row) => {
    const rect = row.getBoundingClientRect();
    return { start: y(rect.top), size: rect.height };
  });

  return {
    top: y(tableRect.top),
    left: x(visibleLeft),
    right: x(visibleRight),
    bottom: y(tableRect.bottom),
    columns,
    rows
  };
}

function selectedLines(editor: Editor, tablePos: number): Selected {
  const result: Selected = { rows: new Set(), columns: new Set() };
  const selection = editor.state.selection;
  if (!(selection instanceof CellSelection) || selection.$anchorCell.before(-1) !== tablePos) return result;

  const tableStart = selection.$anchorCell.start(-1);
  const map = TableMap.get(selection.$anchorCell.node(-1));
  const rect = map.rectBetween(selection.$anchorCell.pos - tableStart, selection.$headCell.pos - tableStart);
  if (selection.isRowSelection()) for (let row = rect.top; row < rect.bottom; row += 1) result.rows.add(row);
  if (selection.isColSelection()) for (let column = rect.left; column < rect.right; column += 1) result.columns.add(column);
  return result;
}
