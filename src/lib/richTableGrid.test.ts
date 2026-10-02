import { TextSelection } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import { describe, expect, it } from "vitest";
import { moveCursorToRichTableCell, richTableCellCursor, richTableLineSelection, richTablePosition } from "./richTableGrid";
import { tableState } from "./richTableSelection.testHelpers";

const rows = [["H1", "H2"], ["A1", "A2"], ["B1", "B2"]];

function cellText(selection: { $from: { parent: { textContent: string } } }): string {
  return selection.$from.parent.textContent;
}

describe("rich table grid", () => {
  it("reports the table position of the cursor", () => {
    const state = tableState({ rows });
    expect(richTablePosition(state)).toMatchObject({ tablePos: 0, row: 0, column: 0, rowCount: 3, columnCount: 2 });
  });

  it("selects whole rows and columns by index", () => {
    const state = tableState({ rows });
    const row = richTableLineSelection(state, 0, "row", 2);
    const column = richTableLineSelection(state, 0, "column", 1);

    expect(row).toBeInstanceOf(CellSelection);
    expect(row?.isRowSelection()).toBe(true);
    expect(column?.isColSelection()).toBe(true);
    const next = state.apply(state.tr.setSelection(row!));
    expect(richTablePosition(next)).toMatchObject({ row: 2 });
    expect(richTableLineSelection(state, 0, "row", 9)).toBeNull();
  });

  it("places the cursor at the end of a cell", () => {
    const state = tableState({ rows });
    const cursor = richTableCellCursor(state, 0, 1, 1);
    expect(cursor).toBeInstanceOf(TextSelection);
    expect(cellText(cursor!)).toBe("A2");

    const moved = state.apply(moveCursorToRichTableCell(state.tr, 0, 2, 0));
    expect(cellText(moved.selection)).toBe("B1");
  });
});
