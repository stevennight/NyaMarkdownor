import { EditorState, TextSelection } from "@tiptap/pm/state";
import { CellSelection, TableMap } from "@tiptap/pm/tables";
import { describe, expect, it } from "vitest";
import { richTableStructureTransaction, type RichTableStructureCommand } from "./richTableStructure";
import { tableState } from "./richTableSelection.testHelpers";

describe("rich table structure transactions", () => {
  it("duplicates body rows and keeps the new row selected", () => {
    const next = applyCommand(selectCell(tableState(), 1, 0), "duplicate-row");

    expect(tableRows(next)).toEqual([["A", "B"], ["C", "D"], ["C", "D"]]);
    expect(selectedCell(next)).toEqual({ row: 2, column: 0 });
  });

  it("duplicates columns across every row", () => {
    const next = applyCommand(selectCell(tableState(), 1, 1), "duplicate-column");

    expect(tableRows(next)).toEqual([["A", "B", "B"], ["C", "D", "D"]]);
    expect(selectedCell(next)).toEqual({ row: 1, column: 2 });
  });

  it("moves body rows without crossing the header", () => {
    const state = tableState({ rows: [["H1", "H2"], ["A1", "A2"], ["B1", "B2"], ["C1", "C2"]] });
    const movedUp = applyCommand(selectCell(state, 2, 0), "move-row-up");
    const movedDown = applyCommand(selectCell(movedUp, 1, 0), "move-row-down");

    expect(tableRows(movedUp)).toEqual([["H1", "H2"], ["B1", "B2"], ["A1", "A2"], ["C1", "C2"]]);
    expect(tableRows(movedDown)).toEqual([["H1", "H2"], ["A1", "A2"], ["B1", "B2"], ["C1", "C2"]]);
    expect(richTableStructureTransaction(selectCell(state, 1, 0), "move-row-up")).toBeNull();
  });

  it("moves columns in both directions", () => {
    const movedLeft = applyCommand(selectCell(tableState(), 1, 1), "move-column-left");
    const movedRight = applyCommand(selectCell(movedLeft, 1, 0), "move-column-right");

    expect(tableRows(movedLeft)).toEqual([["B", "A"], ["D", "C"]]);
    expect(tableRows(movedRight)).toEqual([["A", "B"], ["C", "D"]]);
    expect(richTableStructureTransaction(selectCell(movedLeft, 1, 0), "move-column-left")).toBeNull();
  });

  it("keeps column alignment attributes while duplicating and moving columns", () => {
    const state = tableState({ firstColumnAlignment: "left", secondColumnAlignment: "right" });
    const duplicated = applyCommand(selectCell(state, 1, 1), "duplicate-column");
    const moved = applyCommand(selectCell(state, 1, 1), "move-column-left");

    expect(tableAlignments(duplicated)).toEqual([["left", "right", "right"], ["left", "right", "right"]]);
    expect(tableAlignments(moved)).toEqual([["right", "left"], ["right", "left"]]);
  });

  it("does not duplicate the header row or move the final body row down", () => {
    const state = tableState();

    expect(richTableStructureTransaction(selectCell(state, 0, 0), "duplicate-row")).toBeNull();
    expect(richTableStructureTransaction(selectCell(state, 1, 0), "move-row-down")).toBeNull();
    expect(richTableStructureTransaction(selectCell(state, 1, 1), "move-column-right")).toBeNull();
  });
});

function applyCommand(state: EditorState, command: RichTableStructureCommand): EditorState {
  const transaction = richTableStructureTransaction(state, command);
  if (!transaction) throw new Error(`Command was not available: ${command}`);
  return state.apply(transaction);
}

function selectCell(state: EditorState, row: number, column: number): EditorState {
  const table = state.doc.firstChild;
  if (!table) throw new Error("Missing table");
  const map = TableMap.get(table);
  const cellPosition = 1 + map.map[row * map.width + column];
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, cellPosition + 2)));
}

function tableRows(state: EditorState): string[][] {
  const table = state.doc.firstChild;
  if (!table) return [];
  return Array.from({ length: table.childCount }, (_, rowIndex) => {
    const row = table.child(rowIndex);
    return Array.from({ length: row.childCount }, (_, columnIndex) => row.child(columnIndex).textContent);
  });
}

function tableAlignments(state: EditorState): Array<Array<string | null>> {
  const table = state.doc.firstChild;
  if (!table) return [];
  return Array.from({ length: table.childCount }, (_, rowIndex) => {
    const row = table.child(rowIndex);
    return Array.from({ length: row.childCount }, (_, columnIndex) => row.child(columnIndex).attrs.align ?? null);
  });
}

function selectedCell(state: EditorState): { row: number; column: number } | null {
  const table = state.doc.firstChild;
  if (!table || !(state.selection instanceof CellSelection)) return null;
  const map = TableMap.get(table);
  const relativePosition = state.selection.$anchorCell.pos - 1;
  const rect = map.findCell(relativePosition);
  return { row: rect.top, column: rect.left };
}
