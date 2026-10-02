import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection, type EditorState, type Selection, type Transaction } from "@tiptap/pm/state";
import { CellSelection, TableMap, cellAround } from "@tiptap/pm/tables";

export type RichTablePosition = {
  /** Document position of the table node. */
  tablePos: number;
  row: number;
  column: number;
  rowCount: number;
  columnCount: number;
};

/** The table and cell the selection is in, or null outside a table. */
export function richTablePosition(state: EditorState): RichTablePosition | null {
  const selection = state.selection;
  const $cell = selection instanceof CellSelection ? selection.$headCell : cellAround(selection.$from);
  if (!$cell) return null;

  const table = $cell.node(-1);
  const tableStart = $cell.start(-1);
  const map = TableMap.get(table);
  const rect = map.findCell($cell.pos - tableStart);
  return {
    tablePos: tableStart - 1,
    row: rect.top,
    column: rect.left,
    rowCount: map.height,
    columnCount: map.width
  };
}

function tableAt(doc: ProseMirrorNode, tablePos: number): { table: ProseMirrorNode; map: TableMap; tableStart: number } | null {
  const table = doc.nodeAt(tablePos);
  if (!table || table.type.spec.tableRole !== "table") return null;
  return { table, map: TableMap.get(table), tableStart: tablePos + 1 };
}

function cellPosition(doc: ProseMirrorNode, tablePos: number, row: number, column: number): number | null {
  const found = tableAt(doc, tablePos);
  if (!found || row < 0 || column < 0 || row >= found.map.height || column >= found.map.width) return null;
  return found.tableStart + found.map.map[row * found.map.width + column];
}

/** Selects a whole row or column of the table at `tablePos`. */
export function richTableLineSelection(
  state: EditorState,
  tablePos: number,
  kind: "row" | "column",
  index: number
): CellSelection | null {
  const position = kind === "row" ? cellPosition(state.doc, tablePos, index, 0) : cellPosition(state.doc, tablePos, 0, index);
  if (position === null) return null;
  const $cell = state.doc.resolve(position);
  return kind === "row" ? CellSelection.rowSelection($cell) : CellSelection.colSelection($cell);
}

/** A cursor at the end of the text of a cell. */
export function richTableCellCursor(state: EditorState, tablePos: number, row: number, column: number): Selection | null {
  const position = cellPosition(state.doc, tablePos, row, column);
  if (position === null) return null;
  const cell = state.doc.nodeAt(position);
  if (!cell) return null;
  return TextSelection.near(state.doc.resolve(position + cell.nodeSize - 1), -1);
}

/** Puts the cursor in `row`/`column` after a structural change, when the cell exists. */
export function moveCursorToRichTableCell(transaction: Transaction, tablePos: number, row: number, column: number): Transaction {
  const position = cellPosition(transaction.doc, tablePos, row, column);
  if (position === null) return transaction;
  const cell = transaction.doc.nodeAt(position);
  if (!cell) return transaction;
  return transaction.setSelection(TextSelection.near(transaction.doc.resolve(position + cell.nodeSize - 1), -1));
}
