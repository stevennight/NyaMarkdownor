import { CellSelection, tableNodes } from "@tiptap/pm/tables";
import { EditorState } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import { nextRichTableSelectAllSelection, richTableSelectionFor, richTableSelectionSummary, shouldPreserveRichTableContextSelection } from "./richTableSelection";
import { tableState } from "./richTableSelection.testHelpers";

function selectedCellCount(selection: CellSelection): number {
  let count = 0;
  selection.forEachCell(() => { count += 1; });
  return count;
}

describe("rich table selection", () => {
  it("selects the current cell, row, column, and full table as structural cells", () => {
    const state = tableState();

    const cell = richTableSelectionFor(state, "select-cell");
    const row = richTableSelectionFor(state, "select-row");
    const column = richTableSelectionFor(state, "select-column");
    const table = richTableSelectionFor(state, "select-table");

    expect(cell).toBeInstanceOf(CellSelection);
    expect(selectedCellCount(cell!)).toBe(1);
    expect(selectedCellCount(row!)).toBe(2);
    expect(selectedCellCount(column!)).toBe(2);
    expect(selectedCellCount(table!)).toBe(4);
  });

  it("does not manufacture a table selection outside a table", () => {
    const state = tableState();
    const outsideState = state.reconfigure({ plugins: [] });
    const doc = outsideState.schema.nodes.doc.create(null, [outsideState.schema.nodes.paragraph.create(null, outsideState.schema.text("Draft"))]);
    const cleanState = outsideState.apply(outsideState.tr.replaceWith(0, outsideState.doc.content.size, doc.content));

    expect(richTableSelectionFor(cleanState, "select-cell")).toBeNull();
  });

  it("summarizes structural selections for direct UI feedback", () => {
    const state = tableState();

    expect(summaryFor(state, "select-cell")).toEqual({ kind: "cell", rowCount: 1, columnCount: 1, cellCount: 1 });
    expect(summaryFor(state, "select-row")).toEqual({ kind: "row", rowCount: 1, columnCount: 2, cellCount: 2 });
    expect(summaryFor(state, "select-column")).toEqual({ kind: "column", rowCount: 2, columnCount: 1, cellCount: 2 });
    expect(summaryFor(state, "select-table")).toEqual({ kind: "table", rowCount: 2, columnCount: 2, cellCount: 4 });
  });

  it("reports a mouse-style rectangular range independently from table size", () => {
    const state = tableState({
      rows: [
        ["A", "B", "C"],
        ["D", "E", "F"],
        ["G", "H", "I"]
      ]
    });
    const positions: number[] = [];
    state.doc.descendants((node, position) => {
      if (node.type.spec.tableRole === "cell") positions.push(position);
    });
    const selection = new CellSelection(state.doc.resolve(positions[0]), state.doc.resolve(positions[4]));
    const selectedState = EditorState.create({ doc: state.doc, selection });

    expect(richTableSelectionSummary(selectedState)).toEqual({
      kind: "range",
      rowCount: 2,
      columnCount: 2,
      cellCount: 4
    });
  });

  it("expands Ctrl+A through cell text, cell, table, then the document", () => {
    let state = tableState();

    const cellText = nextRichTableSelectAllSelection(state);
    expect(cellText).not.toBeInstanceOf(CellSelection);
    expect(state.doc.textBetween(cellText!.from, cellText!.to)).toBe("A");

    state = EditorState.create({ doc: state.doc, selection: cellText! });
    const cell = nextRichTableSelectAllSelection(state);
    expect(cell).toBeInstanceOf(CellSelection);
    expect(selectedCellCount(cell as CellSelection)).toBe(1);

    state = EditorState.create({ doc: state.doc, selection: cell! });
    const table = nextRichTableSelectAllSelection(state);
    expect(table).toBeInstanceOf(CellSelection);
    expect(selectedCellCount(table as CellSelection)).toBe(4);

    state = EditorState.create({ doc: state.doc, selection: table! });
    expect(nextRichTableSelectAllSelection(state)).toBeNull();
  });

  it("preserves a structural selection when right-clicking one of its selected cells", () => {
    const state = tableState();
    const positions = tableCellPositions(state);
    const cellSelection = richTableSelectionFor(state, "select-cell")!;
    const selectedCellState = EditorState.create({ doc: state.doc, selection: cellSelection });

    expect(shouldPreserveRichTableContextSelection(selectedCellState, positions[0] + 2)).toBe(true);
    expect(shouldPreserveRichTableContextSelection(selectedCellState, positions[1])).toBe(false);
    expect(shouldPreserveRichTableContextSelection(selectedCellState, positions[1] + 2)).toBe(false);

    const tableSelection = richTableSelectionFor(selectedCellState, "select-table")!;
    const selectedTableState = EditorState.create({ doc: state.doc, selection: tableSelection });
    expect(shouldPreserveRichTableContextSelection(selectedTableState, positions[3] + 2)).toBe(true);
  });

  it("preserves selected cell text only when right-clicking inside the text selection", () => {
    const state = tableState();
    const positions = tableCellPositions(state);
    const textSelection = nextRichTableSelectAllSelection(state)!;
    const selectedTextState = EditorState.create({ doc: state.doc, selection: textSelection });

    expect(shouldPreserveRichTableContextSelection(selectedTextState, textSelection.from)).toBe(true);
    expect(shouldPreserveRichTableContextSelection(selectedTextState, textSelection.to)).toBe(true);
    expect(shouldPreserveRichTableContextSelection(selectedTextState, positions[1] + 2)).toBe(false);
  });
});

function summaryFor(state: EditorState, command: Parameters<typeof richTableSelectionFor>[1]) {
  const selection = richTableSelectionFor(state, command)!;
  return richTableSelectionSummary(EditorState.create({ doc: state.doc, selection }));
}

function tableCellPositions(state: EditorState): number[] {
  const positions: number[] = [];
  state.doc.descendants((node, position) => {
    if (node.type.spec.tableRole === "cell") positions.push(position);
  });
  return positions;
}
