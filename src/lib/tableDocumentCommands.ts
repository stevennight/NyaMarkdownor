import type { TableBlock } from "../types";
import { applyTextChange, type TextEdit, type TextRange } from "./editorCommands";
import {
  buildMarkdownTable,
  deleteColumn,
  deleteRow,
  duplicateColumn,
  duplicateRow,
  fillTableCells,
  findTableAtOffset,
  getSortedTableRowOrder,
  insertColumn,
  insertRow,
  isLikelyCsvTableText,
  moveColumn,
  moveRow,
  parseMarkdownTable,
  parseCsvRows,
  parseTsvRows,
  setColumnAlignment,
  sortTableRows,
  updateTableCell
} from "./tables";
import { clipboardTableRowsFromData } from "./clipboardTableRows";
import { offsetAtLine } from "./text";
import { tableCellBoundaryRange, tableCellContentRange } from "./tableSourceRanges";
import { clampSelectionRangesToTableBlock, tableBlockForSelectionRanges } from "./tableSelectionRanges";

export type TableDocumentCommand =
  | "insert"
  | "normalize"
  | "add-row"
  | "add-row-before"
  | "add-column"
  | "add-column-before"
  | "delete-row"
  | "delete-column"
  | "duplicate-row"
  | "duplicate-column"
  | "delete-table"
  | "move-row-up"
  | "move-row-down"
  | "move-column-left"
  | "move-column-right"
  | "sort-column-asc"
  | "sort-column-desc"
  | "align-column-default"
  | "align-column-left"
  | "align-column-center"
  | "align-column-right";

export type TableSelectionDirection = "next" | "previous";
export type TableSelectionCommand = "select-cell" | "select-row" | "select-table";

export type InsertTableOptions = {
  columns?: number;
  bodyRows?: number;
};

export type TableRangeSelection = {
  ranges: TextRange[];
  mainIndex: number;
};

export function applyTableDocumentCommand(markdown: string, selection: TextRange, command: TableDocumentCommand): TextEdit | null {
  if (command === "insert") {
    return insertTableAtSelection(markdown, selection);
  }

  const tableBlock = findTableAtOffset(markdown, selection.from);
  if (!tableBlock) return null;

  switch (command) {
    case "normalize":
      return replaceTable(markdown, tableBlock, buildMarkdownTable(tableBlock.table));
    case "add-row": {
      const insertAt = tableBlock.position.row >= 2 ? tableBlock.position.row - 1 : tableBlock.table.rows.length;
      return replaceTable(markdown, tableBlock, buildMarkdownTable(insertRow(tableBlock.table, insertAt)), {
        row: insertAt + 2,
        col: tableBlock.position.col
      });
    }
    case "add-row-before": {
      const insertAt = tableBlock.position.row >= 2 ? tableBlock.position.row - 2 : 0;
      return replaceTable(markdown, tableBlock, buildMarkdownTable(insertRow(tableBlock.table, insertAt)), {
        row: insertAt + 2,
        col: tableBlock.position.col
      });
    }
    case "add-column": {
      const insertAt = tableBlock.position.col + 1;
      return replaceTable(markdown, tableBlock, buildMarkdownTable(insertColumn(tableBlock.table, insertAt)), {
        row: tableBlock.position.row,
        col: insertAt
      });
    }
    case "add-column-before": {
      const insertAt = tableBlock.position.col;
      return replaceTable(markdown, tableBlock, buildMarkdownTable(insertColumn(tableBlock.table, insertAt)), {
        row: tableBlock.position.row,
        col: insertAt
      });
    }
    case "delete-row":
      if (tableBlock.position.row < 2) return null;
      return replaceTable(markdown, tableBlock, buildMarkdownTable(deleteRow(tableBlock.table, tableBlock.position.row - 2)), {
        row: tableBlock.position.row,
        col: tableBlock.position.col
      });
    case "delete-column": {
      const nextTable = deleteColumn(tableBlock.table, tableBlock.position.col);
      return replaceTable(markdown, tableBlock, buildMarkdownTable(nextTable), {
        row: tableBlock.position.row,
        col: Math.min(tableBlock.position.col, nextTable.headers.length - 1)
      });
    }
    case "duplicate-row": {
      if (tableBlock.position.row < 2) return null;
      const rowIndex = tableBlock.position.row - 2;
      return replaceTable(markdown, tableBlock, buildMarkdownTable(duplicateRow(tableBlock.table, rowIndex)), {
        row: tableBlock.position.row + 1,
        col: tableBlock.position.col
      });
    }
    case "duplicate-column":
      return replaceTable(markdown, tableBlock, buildMarkdownTable(duplicateColumn(tableBlock.table, tableBlock.position.col)), {
        row: tableBlock.position.row,
        col: tableBlock.position.col + 1
      });
    case "delete-table":
      return deleteTable(markdown, tableBlock);
    case "move-row-up":
    case "move-row-down": {
      if (tableBlock.position.row < 2) return null;
      const direction = command === "move-row-up" ? -1 : 1;
      const rowIndex = tableBlock.position.row - 2;
      const nextRowIndex = rowIndex + direction;
      if (nextRowIndex < 0 || nextRowIndex >= tableBlock.table.rows.length) return null;

      return replaceTable(markdown, tableBlock, buildMarkdownTable(moveRow(tableBlock.table, rowIndex, direction)), {
        row: nextRowIndex + 2,
        col: tableBlock.position.col
      });
    }
    case "move-column-left":
    case "move-column-right": {
      const direction = command === "move-column-left" ? -1 : 1;
      const nextCol = tableBlock.position.col + direction;
      if (nextCol < 0 || nextCol >= tableBlock.table.headers.length) return null;

      return replaceTable(markdown, tableBlock, buildMarkdownTable(moveColumn(tableBlock.table, tableBlock.position.col, direction)), {
        row: tableBlock.position.row,
        col: nextCol
      });
    }
    case "sort-column-asc":
    case "sort-column-desc": {
      if (tableBlock.table.rows.length < 2) return null;

      const direction = command === "sort-column-asc" ? "ascending" : "descending";
      const order = getSortedTableRowOrder(tableBlock.table, tableBlock.position.col, direction);
      const currentDataRow = tableBlock.position.row >= 2 ? tableBlock.position.row - 2 : -1;
      const nextRow = currentDataRow >= 0 ? order.indexOf(currentDataRow) + 2 : tableBlock.position.row;

      return replaceTable(markdown, tableBlock, buildMarkdownTable(sortTableRows(tableBlock.table, tableBlock.position.col, direction)), {
        row: nextRow,
        col: tableBlock.position.col
      });
    }
    case "align-column-default":
      return replaceTable(markdown, tableBlock, buildMarkdownTable(setColumnAlignment(tableBlock.table, tableBlock.position.col, "none")));
    case "align-column-left":
      return replaceTable(markdown, tableBlock, buildMarkdownTable(setColumnAlignment(tableBlock.table, tableBlock.position.col, "left")));
    case "align-column-center":
      return replaceTable(markdown, tableBlock, buildMarkdownTable(setColumnAlignment(tableBlock.table, tableBlock.position.col, "center")));
    case "align-column-right":
      return replaceTable(markdown, tableBlock, buildMarkdownTable(setColumnAlignment(tableBlock.table, tableBlock.position.col, "right")));
  }
}

export function applyTableCellNavigation(markdown: string, selection: TextRange, direction: TableSelectionDirection): TextEdit | null {
  const target = selectAdjacentTableCell(markdown, selection.from, direction);
  if (target) {
    return {
      markdown,
      selection: target
    };
  }

  if (direction === "previous") return null;

  const tableBlock = findTableAtOffset(markdown, selection.from);
  if (!tableBlock || tableBlock.position.row === 1) return null;

  const colCount = tableBlock.table.headers.length;
  const rowCount = tableBlock.table.rows.length + 2;
  const isLastDataCell = tableBlock.position.row === rowCount - 1 && tableBlock.position.col >= colCount - 1;
  const isLastHeaderCellWithNoRows = tableBlock.table.rows.length === 0 && tableBlock.position.row === 0 && tableBlock.position.col >= colCount - 1;

  if (!isLastDataCell && !isLastHeaderCellWithNoRows) return null;

  return replaceTable(
    markdown,
    tableBlock,
    buildMarkdownTable(insertRow(tableBlock.table, tableBlock.table.rows.length)),
    {
      row: tableBlock.table.rows.length + 2,
      col: 0
    }
  );
}

export function applyTableCellLineBreak(markdown: string, selection: TextRange): TextEdit | null {
  const from = Math.max(0, Math.min(selection.from, selection.to, markdown.length));
  const to = Math.max(0, Math.min(Math.max(selection.from, selection.to), markdown.length));
  const tableBlock = findTableAtOffset(markdown, from) ?? findTableAtOffset(markdown, Math.max(0, to - 1));
  if (!tableBlock || tableBlock.position.row === 1) return null;

  const lineStart = offsetAtLine(markdown, tableBlock.startLine + tableBlock.position.row);
  const lineEnd = markdown.indexOf("\n", lineStart);
  const line = markdown.slice(lineStart, lineEnd === -1 ? markdown.length : lineEnd);
  const cellRange = tableCellContentRange(line, lineStart, tableBlock.position.col);
  if (!cellRange || from < cellRange.from || to > cellRange.to) return null;

  const marker = "<br>";
  const change = { from, to, insert: marker };
  const next = applyTextChange(markdown, change);
  const cursor = from + marker.length;

  return {
    markdown: next,
    change,
    selection: {
      from: cursor,
      to: cursor
    }
  };
}

export function applyTableTsvPaste(markdown: string, selection: TextRange, text: string): TextEdit | null {
  return applyTableRowsPaste(markdown, selection, parseTsvRows(text));
}

export function applyTableCsvPaste(markdown: string, selection: TextRange, text: string): TextEdit | null {
  const rows = parseCsvRows(text);
  return isLikelyCsvTableText(text, rows) ? applyTableRowsPaste(markdown, selection, rows) : null;
}

export function applyTableRowsPaste(markdown: string, selection: TextRange, cells: string[][]): TextEdit | null {
  const tableBlock = findTableAtOffset(markdown, selection.from);
  if (!tableBlock) return null;

  if (!cells.length) return null;

  const nextTable = fillTableCells(tableBlock.table, tableBlock.position.row, tableBlock.position.col, cells);
  const lastRow = targetTableRowForPaste(tableBlock.position.row, cells.length - 1);
  const lastCol = tableBlock.position.col + Math.max(0, cells[cells.length - 1].length - 1);

  return replaceTable(markdown, tableBlock, buildMarkdownTable(nextTable), {
    row: lastRow,
    col: lastCol
  });
}

export function applySelectedTableCellsPaste(markdown: string, selections: readonly TextRange[], cells: string[][]): TextEdit | null {
  if (!cells.length) return null;

  const selectedCells = getSelectedTableCells(markdown, selections);
  if (!selectedCells || !selectedCells.cells.length) return null;

  const expandingPaste = getExpandingSelectedCellsPaste(selectedCells.cells, cells);
  if (expandingPaste) {
    const nextTable = fillTableCells(
      selectedCells.tableBlock.table,
      expandingPaste.start.row,
      expandingPaste.start.col,
      cells
    );

    return replaceTable(markdown, selectedCells.tableBlock, buildMarkdownTable(nextTable), expandingPaste.end);
  }

  const assignments = mapPastedCellsToSelection(selectedCells.cells, cells);
  if (!assignments.length) return null;

  const nextTable = assignments.reduce(
    (table, assignment) => updateTableCell(
      table,
      assignment.row === 0 ? -1 : assignment.row - 2,
      assignment.col,
      assignment.value
    ),
    selectedCells.tableBlock.table
  );
  const lastAssignment = assignments[assignments.length - 1];

  return replaceTable(markdown, selectedCells.tableBlock, buildMarkdownTable(nextTable), {
    row: lastAssignment.row,
    col: lastAssignment.col
  });
}

export function applySelectedTableCellsClear(markdown: string, selections: readonly TextRange[]): TextEdit | null {
  const selectedCells = getSelectedTableCells(markdown, selections);
  if (!selectedCells || !selectedCells.cells.length) return null;

  const nextTable = selectedCells.cells.reduce(
    (table, cell) => updateTableCell(
      table,
      cell.row === 0 ? -1 : cell.row - 2,
      cell.col,
      ""
    ),
    selectedCells.tableBlock.table
  );
  const lastCell = selectedCells.cells[selectedCells.cells.length - 1];

  return replaceTable(markdown, selectedCells.tableBlock, buildMarkdownTable(nextTable), {
    row: lastCell.row,
    col: lastCell.col
  });
}

export function applyTableSelectionCommand(markdown: string, selection: TextRange, command: TableSelectionCommand): TextRange | null {
  const tableBlock = findTableAtOffset(markdown, selection.from);
  if (!tableBlock) return null;

  switch (command) {
    case "select-cell": {
      const tableMarkdown = markdown.slice(tableBlock.startOffset, tableBlock.endOffset).replace(/\n$/, "");
      return selectTableCellInMarkdownTable(tableMarkdown, tableBlock.startOffset, tableBlock.position.row, tableBlock.position.col);
    }
    case "select-row":
      return selectTableRow(markdown, tableBlock);
    case "select-table":
      return {
        from: tableBlock.startOffset,
        to: markdown[tableBlock.endOffset - 1] === "\n" ? tableBlock.endOffset - 1 : tableBlock.endOffset
      };
  }
}

export function applyTableColumnSelection(markdown: string, selection: TextRange, colIndex?: number): TableRangeSelection | null {
  const tableBlock = findTableAtOffset(markdown, selection.from);
  if (!tableBlock) return null;

  const tableMarkdown = markdown.slice(tableBlock.startOffset, tableBlock.endOffset).replace(/\n$/, "");
  const lines = tableMarkdown.split("\n");
  const col = Math.max(0, Math.min(colIndex ?? tableBlock.position.col, tableBlock.table.headers.length - 1));
  const ranges: TextRange[] = [];
  let mainIndex = 0;
  let lineOffset = tableBlock.startOffset;

  lines.forEach((line, rowIndex) => {
    const lineStart = lineOffset;
    lineOffset += line.length + 1;

    if (rowIndex === 1) return;

    const range = tableCellBoundaryRange(line, lineStart, col);
    if (!range) return;

    if (rowIndex === tableBlock.position.row) mainIndex = ranges.length;
    ranges.push(range);
  });

  return ranges.length ? { ranges, mainIndex } : null;
}

export function applyTableColumnBodySelection(markdown: string, selection: TextRange, colIndex?: number): TableRangeSelection | null {
  const tableBlock = findTableAtOffset(markdown, selection.from);
  if (!tableBlock || tableBlock.table.rows.length === 0) return null;

  const tableMarkdown = markdown.slice(tableBlock.startOffset, tableBlock.endOffset).replace(/\n$/, "");
  const lines = tableMarkdown.split("\n");
  const col = Math.max(0, Math.min(colIndex ?? tableBlock.position.col, tableBlock.table.headers.length - 1));
  const ranges: TextRange[] = [];
  let mainIndex = 0;
  let lineOffset = tableBlock.startOffset;

  lines.forEach((line, rowIndex) => {
    const lineStart = lineOffset;
    lineOffset += line.length + 1;

    if (rowIndex < 2) return;

    const range = tableCellBoundaryRange(line, lineStart, col);
    if (!range) return;

    if (rowIndex === tableBlock.position.row) mainIndex = ranges.length;
    ranges.push(range);
  });

  return ranges.length ? { ranges, mainIndex } : null;
}

export function applyTableRowSelection(markdown: string, selection: TextRange, rowPosition?: number): TableRangeSelection | null {
  const tableBlock = findTableAtOffset(markdown, selection.from);
  if (!tableBlock) return null;

  const tableMarkdown = markdown.slice(tableBlock.startOffset, tableBlock.endOffset).replace(/\n$/, "");
  const lines = tableMarkdown.split("\n");
  const row = Math.max(0, Math.min(rowPosition ?? tableBlock.position.row, lines.length - 1));
  if (row === 1) return null;

  const lineStart = offsetAtLine(markdown, tableBlock.startLine + row);
  const lineEnd = markdown.indexOf("\n", lineStart);
  const line = markdown.slice(lineStart, lineEnd === -1 ? markdown.length : lineEnd);
  const ranges: TextRange[] = [];

  for (let col = 0; col < tableBlock.table.headers.length; col += 1) {
    const range = tableCellBoundaryRange(line, lineStart, col);
    if (range) ranges.push(range);
  }

  if (!ranges.length) return null;

  return {
    ranges,
    mainIndex: Math.max(0, Math.min(tableBlock.position.col, ranges.length - 1))
  };
}

export function applyTableContentSelection(markdown: string, selection: TextRange): TableRangeSelection | null {
  const tableBlock = findTableAtOffset(markdown, selection.from);
  if (!tableBlock) return null;

  const tableMarkdown = markdown.slice(tableBlock.startOffset, tableBlock.endOffset).replace(/\n$/, "");
  const lines = tableMarkdown.split("\n");
  const ranges: TextRange[] = [];
  let mainIndex = 0;
  let lineOffset = tableBlock.startOffset;

  lines.forEach((line, rowIndex) => {
    const lineStart = lineOffset;
    lineOffset += line.length + 1;

    if (rowIndex === 1) return;

    for (let col = 0; col < tableBlock.table.headers.length; col += 1) {
      const range = tableCellBoundaryRange(line, lineStart, col);
      if (!range) continue;

      if (rowIndex === tableBlock.position.row && col === tableBlock.position.col) {
        mainIndex = ranges.length;
      }
      ranges.push(range);
    }
  });

  return ranges.length ? { ranges, mainIndex } : null;
}

export function applyTableBodySelection(markdown: string, selection: TextRange): TableRangeSelection | null {
  const tableBlock = findTableAtOffset(markdown, selection.from);
  if (!tableBlock || tableBlock.table.rows.length === 0) return null;

  const tableMarkdown = markdown.slice(tableBlock.startOffset, tableBlock.endOffset).replace(/\n$/, "");
  const lines = tableMarkdown.split("\n");
  const ranges: TextRange[] = [];
  let mainIndex = 0;
  let lineOffset = tableBlock.startOffset;

  lines.forEach((line, rowIndex) => {
    const lineStart = lineOffset;
    lineOffset += line.length + 1;

    if (rowIndex < 2) return;

    for (let col = 0; col < tableBlock.table.headers.length; col += 1) {
      const range = tableCellBoundaryRange(line, lineStart, col);
      if (!range) continue;

      if (rowIndex === tableBlock.position.row && col === tableBlock.position.col) {
        mainIndex = ranges.length;
      }
      ranges.push(range);
    }
  });

  return ranges.length ? { ranges, mainIndex } : null;
}

type SelectedTableCells = {
  tableBlock: TableBlock;
  cells: Array<{ row: number; col: number }>;
};

type TablePasteAssignment = {
  row: number;
  col: number;
  value: string;
};

type ExpandingTablePaste = {
  start: { row: number; col: number };
  end: { row: number; col: number };
};

function getSelectedTableCells(markdown: string, selections: readonly TextRange[]): SelectedTableCells | null {
  const normalizedSelections = selections
    .map((selection) => ({
      from: Math.max(0, Math.min(selection.from, selection.to, markdown.length)),
      to: Math.max(0, Math.min(Math.max(selection.from, selection.to), markdown.length))
    }))
    .filter((selection) => selection.to > selection.from)
    .sort((left, right) => left.from - right.from || left.to - right.to);
  if (!normalizedSelections.length) return null;

  const tableBlock = tableBlockForSelectionRanges(markdown, normalizedSelections);
  if (!tableBlock) return null;

  const tableSelections = clampSelectionRangesToTableBlock(normalizedSelections, tableBlock);
  if (!tableSelections.length) return null;

  const tableMarkdown = markdown.slice(tableBlock.startOffset, tableBlock.endOffset).replace(/\n$/, "");
  const lines = tableMarkdown.split("\n");
  const selectedCells: Array<{ row: number; col: number }> = [];
  let lineOffset = tableBlock.startOffset;

  lines.forEach((line, rowIndex) => {
    const lineStart = lineOffset;
    const lineEnd = lineStart + line.length;
    lineOffset = lineEnd + 1;

    if (rowIndex === 1 || !tableSelections.some((selection) => rangesOverlap(selection, { from: lineStart, to: lineEnd }))) return;

    for (let col = 0; col < tableBlock.table.headers.length; col += 1) {
      const cellRange = tableCellContentRange(line, lineStart, col);
      if (cellRange && tableSelections.some((selection) => rangeCovers(selection, cellRange))) {
        selectedCells.push({ row: rowIndex, col });
      }
    }
  });

  return {
    tableBlock,
    cells: selectedCells.sort((left, right) => left.row - right.row || left.col - right.col)
  };
}

function getExpandingSelectedCellsPaste(selectedCells: Array<{ row: number; col: number }>, pastedCells: string[][]): ExpandingTablePaste | null {
  const pasteRowCount = pastedCells.length;
  const pasteColCount = pastedCells.reduce((max, row) => Math.max(max, row.length), 0);
  if (pasteRowCount <= 0 || pasteColCount <= 0) return null;
  if (pasteRowCount === 1 && pasteColCount === 1) return null;

  const rows = uniqueSorted(selectedCells.map((cell) => cell.row));
  const cols = uniqueSorted(selectedCells.map((cell) => cell.col));
  const selectedCellKeys = new Set(selectedCells.map((cell) => cellKey(cell.row, cell.col)));
  const isRectangle = selectedCells.length === rows.length * cols.length
    && rows.every((row) => cols.every((col) => selectedCellKeys.has(cellKey(row, col))));

  if (!isRectangle) return null;
  if (pasteRowCount <= rows.length && pasteColCount <= cols.length) return null;

  const start = selectedCells[0];
  const lastPastedRow = Math.max(0, pastedCells.length - 1);

  return {
    start,
    end: {
      row: targetTableRowForPaste(start.row, lastPastedRow),
      col: start.col + Math.max(0, pasteColCount - 1)
    }
  };
}

function mapPastedCellsToSelection(selectedCells: Array<{ row: number; col: number }>, pastedCells: string[][]): TablePasteAssignment[] {
  const rows = uniqueSorted(selectedCells.map((cell) => cell.row));
  const cols = uniqueSorted(selectedCells.map((cell) => cell.col));
  const selectedCellKeys = new Set(selectedCells.map((cell) => cellKey(cell.row, cell.col)));
  const pasteColCount = pastedCells.reduce((max, row) => Math.max(max, row.length), 0);
  const assignments: TablePasteAssignment[] = [];

  if (pastedCells.length === 1 && pasteColCount === 1) {
    return selectedCells.map((cell) => ({
      ...cell,
      value: pastedCells[0][0] ?? ""
    }));
  }

  if (selectedCells.length === 1) return [];

  const isRectangle = selectedCells.length === rows.length * cols.length
    && rows.every((row) => cols.every((col) => selectedCellKeys.has(cellKey(row, col))));

  if (isRectangle && pastedCells.length === rows.length && pasteColCount === cols.length) {
    rows.forEach((row, rowOffset) => {
      cols.forEach((col, colOffset) => {
        assignments.push({
          row,
          col,
          value: pastedCells[rowOffset]?.[colOffset] ?? ""
        });
      });
    });
    return assignments;
  }

  if (cols.length === 1 && pasteColCount === 1) {
    rows.slice(0, pastedCells.length).forEach((row, rowOffset) => {
      if (!selectedCellKeys.has(cellKey(row, cols[0]))) return;
      assignments.push({
        row,
        col: cols[0],
        value: pastedCells[rowOffset]?.[0] ?? ""
      });
    });
    return assignments;
  }

  if (rows.length === 1 && pastedCells.length === 1) {
    cols.slice(0, pasteColCount).forEach((col, colOffset) => {
      if (!selectedCellKeys.has(cellKey(rows[0], col))) return;
      assignments.push({
        row: rows[0],
        col,
        value: pastedCells[0]?.[colOffset] ?? ""
      });
    });
    return assignments;
  }

  const flatValues = pastedCells.flat();
  return selectedCells.slice(0, flatValues.length).map((cell, index) => ({
    ...cell,
    value: flatValues[index] ?? ""
  }));
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

function rangesOverlap(left: TextRange, right: TextRange): boolean {
  return left.from < right.to && left.to > right.from;
}

function rangeCovers(left: TextRange, right: TextRange): boolean {
  return left.from <= right.from && left.to >= right.to;
}

export function selectAdjacentTableCell(markdown: string, offset: number, direction: TableSelectionDirection): TextRange | null {
  const tableBlock = findTableAtOffset(markdown, offset);
  if (!tableBlock) return null;

  const rowCount = tableBlock.table.rows.length + 2;
  const colCount = tableBlock.table.headers.length;
  let row = tableBlock.position.row;
  let col = tableBlock.position.col;

  if (row === 1) row = direction === "next" ? 2 : 0;
  else if (direction === "next") {
    col += 1;
    if (col >= colCount) {
      col = 0;
      row += 1;
    }
  } else {
    col -= 1;
    if (col < 0) {
      col = colCount - 1;
      row -= 1;
    }
  }

  if (row === 1) row = direction === "next" ? 2 : 0;
  if (row < 0 || row >= rowCount) return null;

  const lineStart = offsetAtLine(markdown, tableBlock.startLine + row);
  const lineEnd = markdown.indexOf("\n", lineStart);
  const line = markdown.slice(lineStart, lineEnd === -1 ? markdown.length : lineEnd);
  return tableCellContentRange(line, lineStart, col);
}

export function selectTableCellInMarkdownTable(tableMarkdown: string, tableStartOffset: number, row: number, col: number): TextRange | null {
  const lines = tableMarkdown.split("\n");
  if (!lines.length) return null;

  let rowIndex = Math.max(0, Math.min(row, lines.length - 1));
  if (rowIndex === 1) rowIndex = lines.length > 2 ? 2 : 0;
  const parsed = parseMarkdownTable(lines);
  const colCount = parsed?.headers.length ?? 0;
  const colIndex = colCount > 0 ? Math.min(Math.max(0, col), colCount - 1) : Math.max(0, col);

  let lineOffset = tableStartOffset;
  for (let index = 0; index < rowIndex; index += 1) {
    lineOffset += lines[index].length + 1;
  }

  return tableCellContentRange(lines[rowIndex], lineOffset, colIndex);
}

export function selectTableRowInMarkdownTable(tableMarkdown: string, tableStartOffset: number, row: number): TextRange | null {
  const lines = tableMarkdown.split("\n");
  if (!lines.length) return null;

  const rowIndex = Math.max(0, Math.min(row, lines.length - 1));
  if (rowIndex === 1) return null;

  let lineStart = tableStartOffset;
  for (let index = 0; index < rowIndex; index += 1) {
    lineStart += lines[index].length + 1;
  }

  return {
    from: lineStart,
    to: lineStart + lines[rowIndex].length
  };
}

function selectTableRow(markdown: string, tableBlock: TableBlock): TextRange | null {
  const tableMarkdown = markdown.slice(tableBlock.startOffset, tableBlock.endOffset).replace(/\n$/, "");
  return selectTableRowInMarkdownTable(tableMarkdown, tableBlock.startOffset, tableBlock.position.row);
}

export function insertTableAtSelection(markdown: string, selection: TextRange, options: InsertTableOptions = {}): TextEdit {
  const from = Math.min(selection.from, selection.to);
  const to = Math.max(selection.from, selection.to);
  const selectedTable = selectedTextToMarkdownTable(markdown.slice(from, to));
  if (selectedTable) {
    return insertMarkdownTableAtRange(markdown, { from, to }, selectedTable, {
      row: selectedTable.split("\n").length > 2 ? 2 : 0,
      col: 0
    });
  }

  const columns = clampTableSize(options.columns ?? 3, 1, 12);
  const bodyRows = clampTableSize(options.bodyRows ?? 2, 0, 30);
  const table = buildMarkdownTable({
    headers: Array.from({ length: columns }, (_value, index) => `Column ${index + 1}`),
    aligns: Array.from({ length: columns }, () => "none"),
    rows: Array.from({ length: bodyRows }, () => Array.from({ length: columns }, () => ""))
  });

  return insertMarkdownTableAtRange(markdown, { from, to }, table, { row: 0, col: 0 });
}

function selectedTextToMarkdownTable(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  return clipboardTableRowsFromData({ text: trimmed })?.markdownTable ?? null;
}

function insertMarkdownTableAtRange(
  markdown: string,
  range: TextRange,
  table: string,
  target: { row: number; col: number }
): TextEdit {
  const { from, to } = range;
  const prefix = from > 0 && markdown[from - 1] !== "\n" ? "\n\n" : "";
  const suffix = markdown[to] && markdown[to] !== "\n" ? "\n\n" : "";
  const insert = prefix + table + suffix;
  const next = markdown.slice(0, from) + insert + markdown.slice(to);
  const tableStartOffset = from + prefix.length;
  const nextSelection = selectTableCellInMarkdownTable(table, tableStartOffset, target.row, target.col);
  const fallbackCursor = tableStartOffset + table.length;

  return {
    markdown: next,
    change: { from, to, insert },
    selection: nextSelection ?? { from: fallbackCursor, to: fallbackCursor }
  };
}

function clampTableSize(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function deleteTable(markdown: string, tableBlock: TableBlock): TextEdit {
  const change = {
    from: tableBlock.startOffset,
    to: tableBlock.endOffset,
    insert: ""
  };
  const next = applyTextChange(markdown, change);
  const cursor = Math.min(tableBlock.startOffset, next.length);

  return {
    markdown: next,
    change,
    selection: {
      from: cursor,
      to: cursor
    }
  };
}

function replaceTable(
  markdown: string,
  tableBlock: TableBlock,
  tableMarkdown: string,
  position = tableBlock.position
): TextEdit {
  const trailingBreak = tableBlock.endOffset < markdown.length ? "\n" : "";
  const change = {
    from: tableBlock.startOffset,
    to: tableBlock.endOffset,
    insert: tableMarkdown + trailingBreak
  };
  const next = applyTextChange(markdown, change);
  const nextCursor = Math.min(tableBlock.startOffset + tableMarkdown.length, next.length);
  const nextSelection = selectTableCellInMarkdownTable(tableMarkdown, tableBlock.startOffset, position.row, position.col);

  return {
    markdown: next,
    change,
    selection: nextSelection ?? {
      from: nextCursor,
      to: nextCursor
    }
  };
}

function targetTableRowForPaste(startRow: number, rowOffset: number): number {
  if (startRow === 0) return rowOffset === 0 ? 0 : rowOffset + 1;
  if (startRow === 1) return rowOffset + 2;
  return startRow + rowOffset;
}
