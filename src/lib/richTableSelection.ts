import { TextSelection, type EditorState, type Selection } from "@tiptap/pm/state";
import { CellSelection, TableMap, cellAround } from "@tiptap/pm/tables";
import { positionInsideNonEmptySelection } from "./selectionRanges";

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

export function nextRichTableSelectAllSelection(state: EditorState): Selection | null {
  const selection = state.selection;
  const $cell = selection instanceof CellSelection ? selection.$anchorCell : cellAround(selection.$from);
  if (!$cell) return null;

  const tableSelection = richTableSelectionFor(state, "select-table");
  if (!tableSelection) return null;

  if (selection instanceof CellSelection) {
    return selection.eq(tableSelection) ? null : tableSelection;
  }

  const cell = state.doc.nodeAt($cell.pos);
  if (!cell) return null;

  const contentSelection = TextSelection.between(
    state.doc.resolve($cell.pos + 1),
    state.doc.resolve($cell.pos + cell.nodeSize - 1)
  );
  if (!contentSelection.empty && !selection.eq(contentSelection)) return contentSelection;

  return new CellSelection($cell);
}

export function shouldPreserveRichTableContextSelection(state: EditorState, position: number): boolean {
  const selection = state.selection;
  if (!(selection instanceof CellSelection)) {
    return positionInsideNonEmptySelection(position, [selection]);
  }

  let insideSelectedCell = false;
  selection.forEachCell((cell, cellPosition) => {
    if (position >= cellPosition && position < cellPosition + cell.nodeSize) insideSelectedCell = true;
  });
  return insideSelectedCell;
}
