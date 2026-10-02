import { describe, expect, it } from "vitest";
import type { TableBlock } from "../types";
import { richTableCursor, sourceTableCursor, tableActionAvailability } from "./tableActionAvailability";

function sourceTable(row: number, col: number, bodyRows = 3, columns = 2): TableBlock {
  return {
    startLine: 0,
    endLine: bodyRows + 1,
    startOffset: 0,
    endOffset: 0,
    table: {
      headers: Array.from({ length: columns }, (_, index) => `H${index}`),
      aligns: Array.from({ length: columns }, () => "none" as const),
      rows: Array.from({ length: bodyRows }, () => Array.from({ length: columns }, () => "x"))
    },
    position: { row, col }
  };
}

describe("table action availability", () => {
  it("maps source and visual cursors to the same body-row model", () => {
    expect(sourceTableCursor(sourceTable(0, 1))).toMatchObject({ headerRow: true, bodyIndex: -1, column: 1 });
    expect(sourceTableCursor(sourceTable(1, 0))).toMatchObject({ headerRow: true });
    expect(sourceTableCursor(sourceTable(3, 0))).toMatchObject({ headerRow: false, bodyIndex: 1, bodyCount: 3 });
    expect(richTableCursor({ row: 2, column: 0, rowCount: 4, columnCount: 2 }))
      .toEqual(sourceTableCursor(sourceTable(3, 0)));
  });

  it("keeps the header row from being deleted, duplicated or moved", () => {
    const header = tableActionAvailability(sourceTableCursor(sourceTable(0, 0)));
    expect(header).toMatchObject({ deleteRow: false, duplicateRow: false, moveRowUp: false, moveRowDown: false });
  });

  it("limits moves at the edges of the body and the columns", () => {
    const first = tableActionAvailability(richTableCursor({ row: 1, column: 0, rowCount: 4, columnCount: 3 }));
    expect(first).toMatchObject({ moveRowUp: false, moveRowDown: true, moveColumnLeft: false, moveColumnRight: true });

    const last = tableActionAvailability(richTableCursor({ row: 3, column: 2, rowCount: 4, columnCount: 3 }));
    expect(last).toMatchObject({ moveRowUp: true, moveRowDown: false, moveColumnLeft: true, moveColumnRight: false });
  });

  it("needs two body rows to sort and two columns to delete one", () => {
    const single = tableActionAvailability(richTableCursor({ row: 1, column: 0, rowCount: 2, columnCount: 1 }));
    expect(single).toMatchObject({ sort: false, deleteColumn: false });
  });

  it("disables everything outside a table", () => {
    expect(Object.values(tableActionAvailability(null)).every((available) => !available)).toBe(true);
  });
});
