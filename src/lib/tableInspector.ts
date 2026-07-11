export type TableSourcePosition = {
  row: number;
  col: number;
};

export type TableInspectorCellPosition = {
  rowIndex: number;
  colIndex: number;
};

export type TableInspectorNavigationDirection = "next" | "previous" | "up" | "down";

export type SerializedCellBreakEdit = {
  value: string;
  caret: number;
};

export type TableInspectorKeyboardEventState = {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  isComposing?: boolean;
  keyCode?: number;
};

export function tableSourcePositionForInspectorCell(rowIndex: number, colIndex: number): TableSourcePosition {
  return {
    row: rowIndex < 0 ? 0 : rowIndex + 2,
    col: Math.max(0, colIndex)
  };
}

export function focusableTableSourcePosition(position: TableSourcePosition): TableSourcePosition {
  return {
    row: position.row === 1 ? 0 : Math.max(0, position.row),
    col: Math.max(0, position.col)
  };
}

export function inspectorRowIndexForTableSourceRow(sourceRow: number): number | null {
  if (sourceRow === 0) return -1;
  if (sourceRow < 2) return null;
  return sourceRow - 2;
}

export function sortedInspectorRowIndexForSourceRow(sourceRow: number, sortedBodyOrder: readonly number[]): number | null {
  const rowIndex = inspectorRowIndexForTableSourceRow(sourceRow);
  if (rowIndex === null || rowIndex < 0) return rowIndex;

  const sortedBodyRowIndex = sortedBodyOrder.indexOf(rowIndex);

  return sortedBodyRowIndex >= 0 ? sortedBodyRowIndex : null;
}

export function isTableInspectorComposingKeyEvent(event: TableInspectorKeyboardEventState): boolean {
  return Boolean(event.isComposing || event.key === "Process" || event.keyCode === 229);
}

export function isTableInspectorCellBreakKey(event: TableInspectorKeyboardEventState): boolean {
  if (isTableInspectorComposingKeyEvent(event)) return false;
  if (event.key !== "Enter") return false;
  if (event.ctrlKey || event.metaKey) return false;
  return Boolean(event.shiftKey || event.altKey);
}

export function tableInspectorNavigationDirectionFromKey(event: TableInspectorKeyboardEventState): TableInspectorNavigationDirection | null {
  if (isTableInspectorComposingKeyEvent(event)) return null;
  if (isTableInspectorCellBreakKey(event)) return null;

  if (event.key === "Tab") {
    return event.shiftKey ? "previous" : "next";
  }

  if (event.ctrlKey || event.metaKey || event.altKey) return null;

  if (event.key === "Enter") return event.shiftKey ? null : "down";
  if (!event.shiftKey && event.key === "ArrowUp") return "up";
  if (!event.shiftKey && event.key === "ArrowDown") return "down";

  return null;
}

export function nextTableInspectorCellPosition(
  current: TableInspectorCellPosition,
  direction: TableInspectorNavigationDirection,
  bodyRowCount: number,
  columnCount: number
): TableInspectorCellPosition | null {
  if (columnCount <= 0 || bodyRowCount < 0) return null;

  const minRowIndex = -1;
  const maxRowIndex = bodyRowCount - 1;
  const rowIndex = Math.max(minRowIndex, Math.min(current.rowIndex, maxRowIndex));
  const colIndex = Math.max(0, Math.min(current.colIndex, columnCount - 1));

  if (direction === "up") {
    return rowIndex > minRowIndex ? { rowIndex: rowIndex - 1, colIndex } : null;
  }

  if (direction === "down") {
    return rowIndex < maxRowIndex ? { rowIndex: rowIndex + 1, colIndex } : null;
  }

  const linearIndex = (rowIndex + 1) * columnCount + colIndex;
  const totalCells = (bodyRowCount + 1) * columnCount;
  const nextIndex = direction === "next" ? linearIndex + 1 : linearIndex - 1;

  if (nextIndex < 0 || nextIndex >= totalCells) return null;

  return {
    rowIndex: Math.floor(nextIndex / columnCount) - 1,
    colIndex: nextIndex % columnCount
  };
}

export function appendedTableInspectorRowTarget(
  current: TableInspectorCellPosition,
  direction: TableInspectorNavigationDirection,
  bodyRowCount: number,
  columnCount: number
): TableInspectorCellPosition | null {
  if (columnCount <= 0 || bodyRowCount < 0 || direction === "previous" || direction === "up") return null;

  const maxRowIndex = bodyRowCount - 1;
  const rowIndex = Math.max(-1, Math.min(current.rowIndex, maxRowIndex));
  const colIndex = Math.max(0, Math.min(current.colIndex, columnCount - 1));

  if (direction === "down" && rowIndex === maxRowIndex) {
    return { rowIndex: bodyRowCount, colIndex };
  }

  if (direction === "next" && rowIndex === maxRowIndex && colIndex === columnCount - 1) {
    return { rowIndex: bodyRowCount, colIndex: 0 };
  }

  return null;
}

export function insertSerializedTableCellBreak(value: string, selectionStart: number | null, selectionEnd: number | null): SerializedCellBreakEdit {
  const from = clampTextOffset(selectionStart ?? value.length, value.length);
  const to = clampTextOffset(selectionEnd ?? from, value.length);
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  const marker = "<br>";

  return {
    value: `${value.slice(0, start)}${marker}${value.slice(end)}`,
    caret: start + marker.length
  };
}

function clampTextOffset(offset: number, length: number): number {
  return Math.max(0, Math.min(offset, length));
}
