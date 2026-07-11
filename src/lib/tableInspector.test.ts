import { describe, expect, it } from "vitest";
import {
  appendedTableInspectorRowTarget,
  focusableTableSourcePosition,
  inspectorRowIndexForTableSourceRow,
  insertSerializedTableCellBreak,
  isTableInspectorCellBreakKey,
  isTableInspectorComposingKeyEvent,
  nextTableInspectorCellPosition,
  sortedInspectorRowIndexForSourceRow,
  tableInspectorNavigationDirectionFromKey,
  tableSourcePositionForInspectorCell
} from "./tableInspector";

describe("table inspector helpers", () => {
  it("maps inspector header and body indexes to source table positions", () => {
    expect(tableSourcePositionForInspectorCell(-1, 2)).toEqual({ row: 0, col: 2 });
    expect(tableSourcePositionForInspectorCell(0, 1)).toEqual({ row: 2, col: 1 });
    expect(tableSourcePositionForInspectorCell(4, 3)).toEqual({ row: 6, col: 3 });
  });

  it("keeps column positions non-negative", () => {
    expect(tableSourcePositionForInspectorCell(0, -2)).toEqual({ row: 2, col: 0 });
  });

  it("maps table source rows back to focusable inspector rows", () => {
    expect(inspectorRowIndexForTableSourceRow(0)).toBe(-1);
    expect(inspectorRowIndexForTableSourceRow(1)).toBeNull();
    expect(inspectorRowIndexForTableSourceRow(2)).toBe(0);
    expect(inspectorRowIndexForTableSourceRow(6)).toBe(4);
  });

  it("maps delimiter-row actions to the nearest focusable source cell", () => {
    expect(focusableTableSourcePosition({ row: 1, col: 2 })).toEqual({ row: 0, col: 2 });
    expect(focusableTableSourcePosition({ row: -4, col: -2 })).toEqual({ row: 0, col: 0 });
    expect(focusableTableSourcePosition({ row: 4, col: 3 })).toEqual({ row: 4, col: 3 });
  });

  it("keeps an inspector row attached to the same body row after sorting", () => {
    expect(sortedInspectorRowIndexForSourceRow(0, [2, 0, 1])).toBe(-1);
    expect(sortedInspectorRowIndexForSourceRow(2, [2, 0, 1])).toBe(1);
    expect(sortedInspectorRowIndexForSourceRow(3, [2, 0, 1])).toBe(2);
    expect(sortedInspectorRowIndexForSourceRow(4, [2, 0, 1])).toBe(0);
  });

  it("does not focus inspector inputs for non-cell or missing sorted rows", () => {
    expect(sortedInspectorRowIndexForSourceRow(1, [0, 1])).toBeNull();
    expect(sortedInspectorRowIndexForSourceRow(5, [0, 1])).toBeNull();
  });

  it("moves horizontally through header and body cells", () => {
    expect(nextTableInspectorCellPosition({ rowIndex: -1, colIndex: 0 }, "next", 2, 3)).toEqual({ rowIndex: -1, colIndex: 1 });
    expect(nextTableInspectorCellPosition({ rowIndex: -1, colIndex: 2 }, "next", 2, 3)).toEqual({ rowIndex: 0, colIndex: 0 });
    expect(nextTableInspectorCellPosition({ rowIndex: 0, colIndex: 0 }, "previous", 2, 3)).toEqual({ rowIndex: -1, colIndex: 2 });
    expect(nextTableInspectorCellPosition({ rowIndex: 1, colIndex: 2 }, "next", 2, 3)).toBeNull();
  });

  it("moves vertically between matching columns", () => {
    expect(nextTableInspectorCellPosition({ rowIndex: -1, colIndex: 1 }, "down", 2, 3)).toEqual({ rowIndex: 0, colIndex: 1 });
    expect(nextTableInspectorCellPosition({ rowIndex: 0, colIndex: 1 }, "up", 2, 3)).toEqual({ rowIndex: -1, colIndex: 1 });
    expect(nextTableInspectorCellPosition({ rowIndex: 1, colIndex: 1 }, "down", 2, 3)).toBeNull();
    expect(nextTableInspectorCellPosition({ rowIndex: -1, colIndex: 1 }, "up", 2, 3)).toBeNull();
  });

  it("supports header-only tables", () => {
    expect(nextTableInspectorCellPosition({ rowIndex: -1, colIndex: 0 }, "next", 0, 2)).toEqual({ rowIndex: -1, colIndex: 1 });
    expect(nextTableInspectorCellPosition({ rowIndex: -1, colIndex: 1 }, "down", 0, 2)).toBeNull();
  });

  it("finds append-row targets from inspector edge navigation", () => {
    expect(appendedTableInspectorRowTarget({ rowIndex: 1, colIndex: 2 }, "next", 2, 3)).toEqual({ rowIndex: 2, colIndex: 0 });
    expect(appendedTableInspectorRowTarget({ rowIndex: 1, colIndex: 1 }, "down", 2, 3)).toEqual({ rowIndex: 2, colIndex: 1 });
    expect(appendedTableInspectorRowTarget({ rowIndex: -1, colIndex: 1 }, "next", 0, 2)).toEqual({ rowIndex: 0, colIndex: 0 });
    expect(appendedTableInspectorRowTarget({ rowIndex: -1, colIndex: 0 }, "down", 0, 2)).toEqual({ rowIndex: 0, colIndex: 0 });
  });

  it("does not append rows when navigation can stay inside the table", () => {
    expect(appendedTableInspectorRowTarget({ rowIndex: 0, colIndex: 2 }, "next", 2, 3)).toBeNull();
    expect(appendedTableInspectorRowTarget({ rowIndex: 0, colIndex: 1 }, "down", 2, 3)).toBeNull();
    expect(appendedTableInspectorRowTarget({ rowIndex: 1, colIndex: 0 }, "previous", 2, 3)).toBeNull();
    expect(appendedTableInspectorRowTarget({ rowIndex: 1, colIndex: 0 }, "up", 2, 3)).toBeNull();
  });

  it("maps inspector navigation keys without stealing modified editing shortcuts", () => {
    expect(tableInspectorNavigationDirectionFromKey({ key: "Tab" })).toBe("next");
    expect(tableInspectorNavigationDirectionFromKey({ key: "Tab", shiftKey: true })).toBe("previous");
    expect(tableInspectorNavigationDirectionFromKey({ key: "Enter" })).toBe("down");
    expect(tableInspectorNavigationDirectionFromKey({ key: "Enter", shiftKey: true })).toBeNull();
    expect(tableInspectorNavigationDirectionFromKey({ key: "ArrowUp" })).toBe("up");
    expect(tableInspectorNavigationDirectionFromKey({ key: "ArrowDown" })).toBe("down");
    expect(tableInspectorNavigationDirectionFromKey({ key: "ArrowDown", shiftKey: true })).toBeNull();
    expect(tableInspectorNavigationDirectionFromKey({ key: "Enter", ctrlKey: true })).toBeNull();
    expect(tableInspectorNavigationDirectionFromKey({ key: "Enter", altKey: true })).toBeNull();
  });

  it("maps inspector cell break keys separately from navigation", () => {
    expect(isTableInspectorCellBreakKey({ key: "Enter", shiftKey: true })).toBe(true);
    expect(isTableInspectorCellBreakKey({ key: "Enter", altKey: true })).toBe(true);
    expect(isTableInspectorCellBreakKey({ key: "Enter", shiftKey: true, altKey: true })).toBe(true);
    expect(isTableInspectorCellBreakKey({ key: "Enter" })).toBe(false);
    expect(isTableInspectorCellBreakKey({ key: "Enter", ctrlKey: true, shiftKey: true })).toBe(false);
    expect(isTableInspectorCellBreakKey({ key: "Enter", metaKey: true, altKey: true })).toBe(false);
    expect(isTableInspectorCellBreakKey({ key: "Enter", shiftKey: true, isComposing: true })).toBe(false);
  });

  it("does not navigate table inspector cells while IME composition is active", () => {
    expect(isTableInspectorComposingKeyEvent({ key: "Enter", isComposing: true })).toBe(true);
    expect(isTableInspectorComposingKeyEvent({ key: "Process" })).toBe(true);
    expect(isTableInspectorComposingKeyEvent({ key: "Enter", keyCode: 229 })).toBe(true);
    expect(tableInspectorNavigationDirectionFromKey({ key: "Enter", isComposing: true })).toBeNull();
    expect(tableInspectorNavigationDirectionFromKey({ key: "ArrowDown", keyCode: 229 })).toBeNull();
    expect(tableInspectorNavigationDirectionFromKey({ key: "Tab", isComposing: true })).toBeNull();
  });

  it("inserts serialized cell breaks at an inspector input selection", () => {
    expect(insertSerializedTableCellBreak("AlphaBeta", 5, 5)).toEqual({
      value: "Alpha<br>Beta",
      caret: 9
    });
    expect(insertSerializedTableCellBreak("AlphaBeta", 0, 5)).toEqual({
      value: "<br>Beta",
      caret: 4
    });
    expect(insertSerializedTableCellBreak("Alpha", null, null)).toEqual({
      value: "Alpha<br>",
      caret: 9
    });
  });
});
