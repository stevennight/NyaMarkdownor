import { Fragment } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { CellSelection, TableMap, cellAround } from "@tiptap/pm/tables";
import { getSortedTableRowOrder, type TableSortDirection } from "./tables";

export function richTableSortTransaction(state: EditorState, direction: TableSortDirection): Transaction | null {
  const selection = state.selection;
  const $cell = selection instanceof CellSelection ? selection.$anchorCell : cellAround(selection.$from);
  if (!$cell) return null;

  const table = $cell.node(-1);
  const tableStart = $cell.start(-1);
  const map = TableMap.get(table);
  const column = map.colCount($cell.pos - tableStart);
  const rows = Array.from({ length: table.childCount }, (_, index) => table.child(index));
  const bodyRows = rows.slice(1);
  if (bodyRows.length < 2) return null;

  const order = getSortedTableRowOrder({
    headers: richTableRowText(rows[0]),
    aligns: [],
    rows: bodyRows.map(richTableRowText)
  }, column, direction);
  if (order.every((rowIndex, index) => rowIndex === index)) return null;

  const nextTable = table.copy(Fragment.fromArray([rows[0], ...order.map((index) => bodyRows[index])]));
  const transaction = state.tr.replaceWith(tableStart - 1, tableStart - 1 + table.nodeSize, nextTable);
  const nextMap = TableMap.get(nextTable);
  const nextCellPosition = tableStart + nextMap.map[nextMap.width + column];
  return transaction.setSelection(new CellSelection(transaction.doc.resolve(nextCellPosition)));
}

function richTableRowText(row: { childCount: number; child: (index: number) => { textContent: string } }): string[] {
  return Array.from({ length: row.childCount }, (_, index) => row.child(index).textContent);
}
