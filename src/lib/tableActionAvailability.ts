import type { TableBlock } from "../types";

/** Where the cursor sits in a table, the same way for source and visual editing. */
export type TableCursor = {
  /** True on the header row, and on the delimiter row of a source table. */
  headerRow: boolean;
  /** Index among body rows; -1 on the header. */
  bodyIndex: number;
  bodyCount: number;
  column: number;
  columnCount: number;
};

export type TableActionAvailability = {
  selectRow: boolean;
  duplicateRow: boolean;
  moveRowUp: boolean;
  moveRowDown: boolean;
  deleteRow: boolean;
  moveColumnLeft: boolean;
  moveColumnRight: boolean;
  deleteColumn: boolean;
  sort: boolean;
};

export function sourceTableCursor(table: TableBlock): TableCursor {
  // Source rows: 0 is the header, 1 the delimiter row, then the body.
  const headerRow = table.position.row < 2;
  return {
    headerRow,
    bodyIndex: headerRow ? -1 : table.position.row - 2,
    bodyCount: table.table.rows.length,
    column: table.position.col,
    columnCount: table.table.headers.length
  };
}

export function richTableCursor(position: { row: number; column: number; rowCount: number; columnCount: number }): TableCursor {
  const headerRow = position.row === 0;
  return {
    headerRow,
    bodyIndex: headerRow ? -1 : position.row - 1,
    bodyCount: Math.max(0, position.rowCount - 1),
    column: position.column,
    columnCount: position.columnCount
  };
}

const NOTHING_AVAILABLE: TableActionAvailability = {
  selectRow: false,
  duplicateRow: false,
  moveRowUp: false,
  moveRowDown: false,
  deleteRow: false,
  moveColumnLeft: false,
  moveColumnRight: false,
  deleteColumn: false,
  sort: false
};

/** One rule set for the table menu, the context menu and the floating table bar. */
export function tableActionAvailability(cursor: TableCursor | null): TableActionAvailability {
  if (!cursor) return NOTHING_AVAILABLE;

  const bodyRow = !cursor.headerRow;
  return {
    selectRow: true,
    duplicateRow: bodyRow,
    moveRowUp: bodyRow && cursor.bodyIndex > 0,
    moveRowDown: bodyRow && cursor.bodyIndex < cursor.bodyCount - 1,
    deleteRow: bodyRow,
    moveColumnLeft: cursor.column > 0,
    moveColumnRight: cursor.column < cursor.columnCount - 1,
    deleteColumn: cursor.columnCount > 1,
    sort: cursor.bodyCount > 1
  };
}
