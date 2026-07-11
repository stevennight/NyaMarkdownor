import type { EditorState } from "@tiptap/pm/state";
import { CellSelection, TableMap, cellAround } from "@tiptap/pm/tables";

export type RichTableSelectionCommand = "select-cell" | "select-row" | "select-column" | "select-table";

export type RichTableSelectionSummary = {
  kind: "cell" | "range" | "row" | "column" | "table";
  rowCount: number;
  columnCount: number;
  cellCount: number;
};

export function richTableSelectionFor(state: EditorState, command: RichTableSelectionCommand): CellSelection | null {
  const selection = state.selection;
  const $cell = selection instanceof CellSelection ? selection.$anchorCell : cellAround(selection.$from);
  if (!$cell) return null;

  switch (command) {
    case "select-cell":
      return new CellSelection($cell);
    case "select-row":
      return CellSelection.rowSelection($cell);
    case "select-column":
      return CellSelection.colSelection($cell);
    case "select-table": {
      const table = $cell.node(-1);
      const tableStart = $cell.start(-1);
      const map = TableMap.get(table);
      return new CellSelection(
        state.doc.resolve(tableStart + map.map[0]),
        state.doc.resolve(tableStart + map.map[map.map.length - 1])
      );
    }
  }
}

export function richTableSelectionSummary(state: EditorState): RichTableSelectionSummary | null {
  const selection = state.selection;
  if (!(selection instanceof CellSelection)) return null;

  const table = selection.$anchorCell.node(-1);
  const tableStart = selection.$anchorCell.start(-1);
  const map = TableMap.get(table);
  const rect = map.rectBetween(selection.$anchorCell.pos - tableStart, selection.$headCell.pos - tableStart);
  let cellCount = 0;
  selection.forEachCell(() => { cellCount += 1; });
  const rowCount = rect.bottom - rect.top;
  const columnCount = rect.right - rect.left;
  const coversEveryRow = rect.top === 0 && rect.bottom === map.height;
  const coversEveryColumn = rect.left === 0 && rect.right === map.width;

  const kind = cellCount === 1
    ? "cell"
    : coversEveryRow && coversEveryColumn
      ? "table"
      : coversEveryColumn
        ? "row"
        : coversEveryRow
          ? "column"
          : "range";
  return { kind, rowCount, columnCount, cellCount };
}
