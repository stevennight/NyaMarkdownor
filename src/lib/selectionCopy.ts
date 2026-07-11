import type { TextRange } from "./editorCommands";
import { markdownRangesToTableMarkdown } from "./markdown";
import { tableCellContentRange } from "./tableSourceRanges";
import { clampSelectionRangesToTableBlock, tableBlockForSelectionRanges } from "./tableSelectionRanges";
import { normalizeTextRanges } from "./textRanges";

export function shouldHandleSmartCopy(enabled: boolean, hasSelection: boolean): boolean {
  return enabled && hasSelection;
}

export type SelectionSummary = {
  rangeCount: number;
  charCount: number;
  tableLabel?: string;
};

export function hasNonEmptySelection(ranges: readonly TextRange[], markdownLength: number): boolean {
  return normalizeSelectionRanges(ranges, markdownLength).length > 0;
}

export function getSelectionSummary(ranges: readonly TextRange[], markdown: string | number): SelectionSummary {
  const markdownLength = typeof markdown === "string" ? markdown.length : markdown;
  const normalizedRanges = normalizeSelectionRanges(ranges, markdownLength);
  const summary = {
    rangeCount: normalizedRanges.length,
    charCount: normalizedRanges.reduce((total, range) => total + range.to - range.from, 0)
  };

  if (typeof markdown !== "string") return summary;

  const tableLabel = describeTableSelection(markdown, normalizedRanges);
  return tableLabel ? { ...summary, tableLabel } : summary;
}

export function hasStructuredTableSelection(summary: SelectionSummary): boolean {
  return Boolean(summary.tableLabel);
}

export function selectionRangesOrWholeDocument(ranges: readonly TextRange[], markdownLength: number): TextRange[] {
  const normalizedRanges = normalizeSelectionRanges(ranges, markdownLength);
  return normalizedRanges.length ? normalizedRanges : [{ from: 0, to: markdownLength }];
}

export function markdownFromSelectionRanges(markdown: string, ranges: readonly TextRange[]): string {
  const normalizedRanges = normalizeSelectionRanges(ranges, markdown.length);
  if (!normalizedRanges.length) return markdown;
  const tableMarkdown = markdownRangesToTableMarkdown(markdown, normalizedRanges);
  if (tableMarkdown !== null) return tableMarkdown;
  return normalizedRanges.map((range) => markdown.slice(range.from, range.to)).join("\n");
}

function normalizeSelectionRanges(ranges: readonly TextRange[], markdownLength: number): TextRange[] {
  return normalizeTextRanges(ranges, markdownLength);
}

function describeTableSelection(markdown: string, ranges: TextRange[]): string | null {
  if (!ranges.length) return null;

  const tableBlock = tableBlockForSelectionRanges(markdown, ranges);
  if (!tableBlock) return null;

  const tableRanges = clampSelectionRangesToTableBlock(ranges, tableBlock);
  if (!tableRanges.length) return null;

  const tableMarkdown = markdown.slice(tableBlock.startOffset, tableBlock.endOffset).replace(/\n$/, "");
  const lines = tableMarkdown.split("\n");
  const selectedCells: Array<{ row: number; col: number }> = [];
  const selectedCellKeys = new Set<string>();
  let lineOffset = tableBlock.startOffset;

  lines.forEach((line, rowIndex) => {
    const lineStart = lineOffset;
    const lineEnd = lineStart + line.length;
    lineOffset = lineEnd + 1;

    if (rowIndex === 1 || !tableRanges.some((range) => rangesOverlap(range, { from: lineStart, to: lineEnd }))) return;

    for (let col = 0; col < tableBlock.table.headers.length; col += 1) {
      const cellRange = tableCellContentRange(line, lineStart, col);
      if (!cellRange || !tableRanges.some((range) => rangeCovers(range, cellRange))) continue;

      const key = tableCellKey(rowIndex, col);
      if (selectedCellKeys.has(key)) continue;

      selectedCellKeys.add(key);
      selectedCells.push({ row: rowIndex, col });
    }
  });

  if (!selectedCells.length) return null;

  const selectedRows = uniqueSorted(selectedCells.map((cell) => cell.row));
  const selectedCols = uniqueSorted(selectedCells.map((cell) => cell.col));
  const colCount = tableBlock.table.headers.length;
  const contentRowCount = tableBlock.table.rows.length + 1;
  const bodyRowCount = tableBlock.table.rows.length;
  const cellCount = selectedCells.length;
  const selectsAllColumns = selectedCols.length === colCount;
  const selectsAllContentRows = selectedRows.length === contentRowCount && selectedRows[0] === 0;
  const selectsOnlyBodyRows = bodyRowCount > 0
    && selectedRows.length === bodyRowCount
    && selectedRows.every((row) => row >= 2);
  const isRectangle = cellCount === selectedRows.length * selectedCols.length
    && selectedRows.every((row) => selectedCols.every((col) => selectedCellKeys.has(tableCellKey(row, col))));

  if (selectsAllColumns && selectsAllContentRows && cellCount === contentRowCount * colCount) {
    return `Table selected: ${cellCount} cells`;
  }

  if (selectsAllColumns && selectsOnlyBodyRows && cellCount === bodyRowCount * colCount) {
    return `Table body selected: ${cellCount} cells`;
  }

  if (selectedRows.length === 1 && selectsAllColumns && cellCount === colCount) {
    if (selectedRows[0] === 0) return `Table header selected: ${cellCount} cells`;
    return `Table row selected: ${cellCount} cells`;
  }

  if (selectedCols.length === 1 && selectsAllContentRows && cellCount === contentRowCount) {
    return `Table column selected: ${cellCount} cells`;
  }

  if (selectedCols.length === 1 && selectsOnlyBodyRows && cellCount === bodyRowCount) {
    return `Table column body selected: ${cellCount} cells`;
  }

  if (isRectangle && selectedRows.length > 1 && selectedCols.length > 1) {
    return `Table range selected: ${selectedRows.length}x${selectedCols.length} cells`;
  }

  return `Table cells selected: ${cellCount} cells`;
}

function rangesOverlap(left: TextRange, right: TextRange): boolean {
  return left.from < right.to && left.to > right.from;
}

function rangeCovers(left: TextRange, right: TextRange): boolean {
  return left.from <= right.from && left.to >= right.to;
}

function tableCellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}
