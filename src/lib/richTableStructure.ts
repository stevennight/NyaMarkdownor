import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { CellSelection, TableMap, cellAround } from "@tiptap/pm/tables";

export type RichTableStructureCommand =
  | "duplicate-row"
  | "duplicate-column"
  | "move-row-up"
  | "move-row-down"
  | "move-column-left"
  | "move-column-right";

export function richTableStructureTransaction(
  state: EditorState,
  command: RichTableStructureCommand
): Transaction | null {
  const selection = state.selection;
  const $cell = selection instanceof CellSelection ? selection.$anchorCell : cellAround(selection.$from);
  if (!$cell) return null;

  const table = $cell.node(-1);
  const tableStart = $cell.start(-1);
  const map = TableMap.get(table);
  if (!isSimpleRectangularTable(table, map)) return null;

  const cellRect = map.findCell($cell.pos - tableStart);
  let targetRow = cellRect.top;
  let targetColumn = cellRect.left;
  let rows = Array.from({ length: table.childCount }, (_, index) => table.child(index));

  switch (command) {
    case "duplicate-row":
      if (targetRow === 0) return null;
      rows.splice(targetRow + 1, 0, rows[targetRow]);
      targetRow += 1;
      break;
    case "move-row-up":
      if (targetRow <= 1) return null;
      [rows[targetRow - 1], rows[targetRow]] = [rows[targetRow], rows[targetRow - 1]];
      targetRow -= 1;
      break;
    case "move-row-down":
      if (targetRow === 0 || targetRow >= rows.length - 1) return null;
      [rows[targetRow], rows[targetRow + 1]] = [rows[targetRow + 1], rows[targetRow]];
      targetRow += 1;
      break;
    case "duplicate-column":
      rows = rows.map((row) => {
        const cells = row.content.content.slice();
        cells.splice(targetColumn + 1, 0, cells[targetColumn]);
        return row.copy(Fragment.fromArray(cells));
      });
      targetColumn += 1;
      break;
    case "move-column-left":
      if (targetColumn === 0) return null;
      rows = rows.map((row) => swapRowCells(row, targetColumn, targetColumn - 1));
      targetColumn -= 1;
      break;
    case "move-column-right":
      if (targetColumn >= map.width - 1) return null;
      rows = rows.map((row) => swapRowCells(row, targetColumn, targetColumn + 1));
      targetColumn += 1;
      break;
  }

  const nextTable = table.copy(Fragment.fromArray(rows));
  const transaction = state.tr.replaceWith(tableStart - 1, tableStart - 1 + table.nodeSize, nextTable);
  const nextMap = TableMap.get(nextTable);
  const cellPosition = nextMap.map[targetRow * nextMap.width + targetColumn];
  if (cellPosition === undefined) return null;

  return transaction.setSelection(new CellSelection(transaction.doc.resolve(tableStart + cellPosition)));
}

function isSimpleRectangularTable(table: ProseMirrorNode, map: TableMap): boolean {
  return Array.from({ length: table.childCount }, (_, rowIndex) => table.child(rowIndex)).every((row) => (
    row.childCount === map.width
    && Array.from({ length: row.childCount }, (_, cellIndex) => row.child(cellIndex)).every((cell) => (
      (cell.attrs.colspan ?? 1) === 1 && (cell.attrs.rowspan ?? 1) === 1
    ))
  ));
}

function swapRowCells(row: ProseMirrorNode, left: number, right: number): ProseMirrorNode {
  const cells = row.content.content.slice();
  [cells[left], cells[right]] = [cells[right], cells[left]];
  return row.copy(Fragment.fromArray(cells));
}
