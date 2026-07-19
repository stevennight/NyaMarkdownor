import type { MarkdownTable, TableAlignment, TableBlock } from "../types";
import { cursorPosition, offsetAtLine, padVisual, stripInlineMarkdown, stripTableCellMarkdown, visualWidth } from "./text";
import { unescapedPipeIndexes } from "./tableSourceRanges";

export type TableSortDirection = "ascending" | "descending";

type CodeFence = {
  char: "`" | "~";
  length: number;
};

export type FindTableAtOffsetOptions = {
  /** The caller has already ruled out fenced code for the requested line. */
  assumeNonCodeLine?: boolean;
  /** Defer line counting until a real table has been found. */
  deferLineNumberCalculation?: boolean;
};

export function findTableAtOffset(
  markdown: string,
  offset: number,
  options: FindTableAtOffsetOptions = {}
): TableBlock | null {
  const currentLine = lineAtOffset(markdown, offset, !options.deferLineNumberCalculation);
  if (!canBeTableLine(currentLine.text)) return null;
  if (!options.assumeNonCodeLine && isLineInsideCodeFence(markdown, currentLine.start)) return null;

  let blockStart = currentLine;
  let blockEnd = currentLine;

  while (true) {
    const previous = previousLine(markdown, blockStart);
    if (!previous || !canBeTableLine(previous.text)) break;
    blockStart = previous;
  }

  while (true) {
    const next = nextLine(markdown, blockEnd);
    if (!next || !canBeTableLine(next.text)) break;
    blockEnd = next;
  }

  const blockLines = collectLines(markdown, blockStart, blockEnd);
  const delimiterIndex = blockLines.findIndex((line, index) => index > 0 && isDelimiterLine(line.text));
  if (delimiterIndex <= 0) return null;

  const tableLines = blockLines.slice(delimiterIndex - 1);
  const table = parseMarkdownTable(tableLines.map((line) => line.text));
  if (!table) return null;

  const firstLine = tableLines[0];
  const lastLine = tableLines[tableLines.length - 1];
  const row = currentLine.number - firstLine.number;
  if (row < 0 || row >= tableLines.length) return null;
  const startLine = options.deferLineNumberCalculation
    ? lineNumberAtOffset(markdown, firstLine.start)
    : firstLine.number;

  return {
    startLine,
    endLine: startLine + tableLines.length - 1,
    startOffset: firstLine.start,
    endOffset: lastLine.end < markdown.length ? lastLine.end + 1 : markdown.length,
    table,
    position: {
      row,
      col: clampCellIndex(getCellIndexFromColumn(currentLine.text, currentLine.col), table.headers.length)
    }
  };
}

export function findTableBlock(lines: string[], lineIndex: number, colIndex: number): Omit<TableBlock, "startOffset" | "endOffset"> | null {
  if (!lines.length || lineIndex < 0 || lineIndex >= lines.length) return null;
  if (!canBeTableLine(lines[lineIndex])) return null;

  let start = lineIndex;
  let end = lineIndex;

  while (start > 0 && canBeTableLine(lines[start - 1])) start -= 1;
  while (end < lines.length - 1 && canBeTableLine(lines[end + 1])) end += 1;

  let delimiter = -1;
  for (let index = start + 1; index <= end; index += 1) {
    if (isDelimiterLine(lines[index])) {
      delimiter = index;
      break;
    }
  }

  if (delimiter === -1 || delimiter - 1 < start) return null;

  start = delimiter - 1;
  const table = parseMarkdownTable(lines.slice(start, end + 1));
  if (!table) return null;

  return {
    startLine: start,
    endLine: end,
    table,
    position: {
      row: lineIndex - start,
      col: clampCellIndex(getCellIndexFromColumn(lines[lineIndex], colIndex), table.headers.length)
    }
  };
}

export function parseMarkdownTable(lines: string[]): MarkdownTable | null {
  if (lines.length < 2 || !isDelimiterLine(lines[1])) return null;

  let headers = splitTableRow(lines[0]);
  let aligns = parseAlignments(splitTableRow(lines[1]));
  const colCount = Math.max(headers.length, aligns.length);

  headers = normalizeCellCount(headers, colCount);
  aligns = normalizeCellCount(aligns, colCount, "none");

  const rows = lines.slice(2).map((line) => normalizeCellCount(splitTableRow(line), colCount));
  return { headers, aligns, rows };
}

export function buildMarkdownTable(table: MarkdownTable): string {
  const colCount = table.headers.length;
  const widths = new Array<number>(colCount).fill(3);

  table.headers.forEach((cell, index) => {
    widths[index] = Math.max(widths[index], tableCellDisplayWidth(cell));
  });

  table.rows.forEach((row) => {
    for (let index = 0; index < colCount; index += 1) {
      widths[index] = Math.max(widths[index], tableCellDisplayWidth(row[index] ?? ""));
    }
  });

  table.aligns.forEach((align, index) => {
    widths[index] = Math.max(widths[index], separatorWidth(align));
  });

  return [
    formatTableRow(table.headers, widths),
    formatSeparatorRow(table.aligns, widths),
    ...table.rows.map((row) => formatTableRow(normalizeCellCount(row, colCount), widths))
  ].join("\n");
}

export function tableToTsv(table: MarkdownTable): string {
  return [table.headers, ...table.rows]
    .map((row) => row.map((cell) => stripTableCellMarkdown(cell ?? "", "space").replace(/\t/g, " ")).join("\t"))
    .join("\n");
}

export function parseTsvRows(text: string): string[][] {
  return parseDelimitedRows(text, "\t");
}

export function parseCsvRows(text: string): string[][] {
  return parseDelimitedRows(text, ",");
}

export function isLikelyCsvTableText(text: string, rows = parseCsvRows(text)): boolean {
  if (!text.includes(",") || !text.replace(/\r\n?/g, "\n").includes("\n")) return false;
  if (rows.length < 2) return false;

  const firstWidth = rows[0]?.length ?? 0;
  if (firstWidth < 2) return false;
  return rows.every((row) => row.length === firstWidth);
}

function parseDelimitedRows(text: string, delimiter: "\t" | ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let atCellStart = true;
  let quotedCell = false;
  let afterClosingQuote = false;
  const source = text.replace(/\r\n?/g, "\n").replace(/\n+$/g, "");

  function pushCell() {
    row.push(quotedCell ? cell : cell.trim());
    cell = "";
    atCellStart = true;
    quotedCell = false;
    afterClosingQuote = false;
  }

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (inQuotes) {
      if (char === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
        afterClosingQuote = true;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"' && atCellStart) {
      inQuotes = true;
      quotedCell = true;
      afterClosingQuote = false;
      cell = "";
      atCellStart = false;
    } else if (char === delimiter) {
      pushCell();
    } else if (char === "\n") {
      pushCell();
      rows.push(row);
      row = [];
    } else if (quotedCell && afterClosingQuote && /\s/.test(char)) {
      continue;
    } else {
      cell += char;
      if (!/\s/.test(char)) atCellStart = false;
      afterClosingQuote = false;
    }
  }

  pushCell();
  rows.push(row);

  return trimOuterEmptyRows(rows);
}

function trimOuterEmptyRows(rows: string[][]): string[][] {
  let start = 0;
  let end = rows.length;

  while (start < end && isEmptyDelimitedRow(rows[start])) start += 1;
  while (end > start && isEmptyDelimitedRow(rows[end - 1])) end -= 1;

  return rows.slice(start, end);
}

function isEmptyDelimitedRow(row: string[]): boolean {
  return row.every((value) => value.length === 0);
}

export function tsvToMarkdownTable(text: string): string | null {
  return rowsToMarkdownTable(parseTsvRows(text));
}

export function csvToMarkdownTable(text: string): string | null {
  const rows = parseCsvRows(text);
  return isLikelyCsvTableText(text, rows) ? rowsToMarkdownTable(rows) : null;
}

export function markdownTableTextToRows(text: string): string[][] | null {
  const table = parseMarkdownTableText(text);
  return table ? [table.headers, ...table.rows] : null;
}

export function markdownTableTextToMarkdownTable(text: string): string | null {
  const table = parseMarkdownTableText(text);
  return table ? buildMarkdownTable(table) : null;
}

export function markdownTextContainsOnlyTable(text: string): boolean {
  const normalized = text.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const block = parseMarkdownTableTextBlock(lines);
  if (!block) return false;

  return lines.slice(0, block.startLine).every((line) => !line.trim())
    && lines.slice(block.endLine).every((line) => !line.trim());
}

export function rowsToMarkdownTable(rows: string[][]): string | null {
  if (!rows.length) return null;

  const colCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  if (colCount < 1) return null;

  const normalizedRows = rows.map((row) => normalizeCellCount(row, colCount));
  const table: MarkdownTable = normalizedRows.length === 1
    ? {
        headers: Array.from({ length: colCount }, (_value, index) => `Column ${index + 1}`),
        aligns: Array.from({ length: colCount }, () => "none"),
        rows: normalizedRows
      }
    : {
        headers: normalizedRows[0],
        aligns: Array.from({ length: colCount }, () => "none"),
        rows: normalizedRows.slice(1)
      };

  return buildMarkdownTable(table);
}

function parseMarkdownTableText(text: string): MarkdownTable | null {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  return parseMarkdownTableTextBlock(lines)?.table ?? null;
}

function parseMarkdownTableTextBlock(lines: readonly string[]): {
  table: MarkdownTable;
  startLine: number;
  endLine: number;
} | null {
  let fence: CodeFence | null = null;

  for (let index = 0; index < lines.length - 1; index += 1) {
    const line = lines[index];

    if (fence) {
      if (closesCodeFence(line, fence)) fence = null;
      continue;
    }

    const openingFence = openingCodeFence(line);
    if (openingFence) {
      fence = openingFence;
      continue;
    }

    if (!canBeTableLine(line)) continue;

    const delimiterLine = lines[index + 1];
    if (!canBeTableLine(delimiterLine) || !isDelimiterLine(delimiterLine)) continue;

    let end = index + 2;
    while (end < lines.length && canBeTableLine(lines[end])) end += 1;

    const table = parseMarkdownTable(lines.slice(index, end));
    if (table) return { table, startLine: index, endLine: end };
  }

  return null;
}

export function fillTableCells(table: MarkdownTable, startRow: number, startCol: number, cells: string[][]): MarkdownTable {
  const next = cloneTable(table);
  const safeStartRow = Math.max(0, startRow);
  const safeStartCol = Math.max(0, startCol);
  const pastedColCount = cells.reduce((max, row) => Math.max(max, row.length), 0);
  const nextColCount = Math.max(next.headers.length, safeStartCol + pastedColCount);

  while (next.headers.length < nextColCount) {
    const nextIndex = next.headers.length;
    next.headers.push(`Column ${nextIndex + 1}`);
    next.aligns.push("none");
  }

  next.rows = next.rows.map((row) => normalizeCellCount(row, nextColCount));

  cells.forEach((rowCells, rowOffset) => {
    const targetRow = targetTableRowForPaste(safeStartRow, rowOffset);
    const targetCells = targetRow === 0
      ? next.headers
      : ensureDataRow(next, targetRow - 2, nextColCount);

    rowCells.forEach((value, colOffset) => {
      targetCells[safeStartCol + colOffset] = value;
    });
  });

  return next;
}

export function insertRow(table: MarkdownTable, rowIndex: number): MarkdownTable {
  const next = cloneTable(table);
  const insertAt = Math.max(0, Math.min(rowIndex, next.rows.length));
  next.rows.splice(insertAt, 0, new Array(next.headers.length).fill(""));
  return next;
}

export function insertColumn(table: MarkdownTable, colIndex: number): MarkdownTable {
  const next = cloneTable(table);
  const insertAt = Math.max(0, Math.min(colIndex, next.headers.length));
  next.headers.splice(insertAt, 0, `Column ${insertAt + 1}`);
  next.aligns.splice(insertAt, 0, "none");
  next.rows.forEach((row) => row.splice(insertAt, 0, ""));
  return next;
}

export function deleteRow(table: MarkdownTable, rowIndex: number): MarkdownTable {
  const next = cloneTable(table);
  if (!next.rows.length) return next;
  next.rows.splice(Math.max(0, Math.min(rowIndex, next.rows.length - 1)), 1);
  return next;
}

export function deleteColumn(table: MarkdownTable, colIndex: number): MarkdownTable {
  const next = cloneTable(table);
  if (next.headers.length <= 1) return next;

  const removeAt = Math.max(0, Math.min(colIndex, next.headers.length - 1));
  next.headers.splice(removeAt, 1);
  next.aligns.splice(removeAt, 1);
  next.rows.forEach((row) => row.splice(removeAt, 1));
  return next;
}

export function duplicateRow(table: MarkdownTable, rowIndex: number): MarkdownTable {
  const next = cloneTable(table);
  if (!next.rows.length) return next;

  const sourceIndex = Math.max(0, Math.min(rowIndex, next.rows.length - 1));
  next.rows.splice(sourceIndex + 1, 0, normalizeCellCount(next.rows[sourceIndex], next.headers.length));
  return next;
}

export function duplicateColumn(table: MarkdownTable, colIndex: number): MarkdownTable {
  const next = cloneTable(table);
  if (!next.headers.length) return next;

  const sourceIndex = Math.max(0, Math.min(colIndex, next.headers.length - 1));
  next.headers.splice(sourceIndex + 1, 0, next.headers[sourceIndex] ?? "");
  next.aligns.splice(sourceIndex + 1, 0, next.aligns[sourceIndex] ?? "none");
  next.rows.forEach((row) => row.splice(sourceIndex + 1, 0, row[sourceIndex] ?? ""));
  return next;
}

export function moveRow(table: MarkdownTable, rowIndex: number, direction: -1 | 1): MarkdownTable {
  const next = cloneTable(table);
  const from = Math.max(0, Math.min(rowIndex, next.rows.length - 1));
  const to = from + direction;
  if (to < 0 || to >= next.rows.length) return next;

  [next.rows[from], next.rows[to]] = [next.rows[to], next.rows[from]];
  return next;
}

export function moveColumn(table: MarkdownTable, colIndex: number, direction: -1 | 1): MarkdownTable {
  const next = cloneTable(table);
  const from = Math.max(0, Math.min(colIndex, next.headers.length - 1));
  const to = from + direction;
  if (to < 0 || to >= next.headers.length) return next;

  [next.headers[from], next.headers[to]] = [next.headers[to], next.headers[from]];
  [next.aligns[from], next.aligns[to]] = [next.aligns[to], next.aligns[from]];
  next.rows.forEach((row) => {
    [row[from], row[to]] = [row[to], row[from]];
  });
  return next;
}

export function getSortedTableRowOrder(table: MarkdownTable, colIndex: number, direction: TableSortDirection): number[] {
  if (!table.rows.length) return [];

  const safeCol = Math.max(0, Math.min(colIndex, Math.max(0, table.headers.length - 1)));
  const sortDirection = direction === "ascending" ? 1 : -1;

  return table.rows
    .map((row, index) => ({
      index,
      key: tableSortKey(row[safeCol] ?? "")
    }))
    .sort((a, b) => {
      if (a.key.empty && b.key.empty) return a.index - b.index;
      if (a.key.empty) return 1;
      if (b.key.empty) return -1;

      const groupComparison = compareTableSortKeyGroups(a.key, b.key);
      if (groupComparison !== 0) return groupComparison;

      const comparison = compareTableSortKeys(a.key, b.key);
      return comparison === 0 ? a.index - b.index : comparison * sortDirection;
    })
    .map((row) => row.index);
}

export function sortTableRows(table: MarkdownTable, colIndex: number, direction: TableSortDirection): MarkdownTable {
  const next = cloneTable(table);
  const order = getSortedTableRowOrder(next, colIndex, direction);
  const colCount = next.headers.length;
  next.rows = order.map((index) => normalizeCellCount(next.rows[index] ?? [], colCount));
  return next;
}

export function updateTableCell(table: MarkdownTable, rowIndex: number, colIndex: number, value: string): MarkdownTable {
  const next = cloneTable(table);

  if (rowIndex === -1) {
    next.headers[colIndex] = value;
  } else if (next.rows[rowIndex]) {
    next.rows[rowIndex][colIndex] = value;
  }

  return next;
}

export function setColumnAlignment(table: MarkdownTable, colIndex: number, alignment: TableAlignment): MarkdownTable {
  const next = cloneTable(table);
  if (!next.headers.length) return next;

  const target = Math.max(0, Math.min(colIndex, next.headers.length - 1));
  next.aligns[target] = alignment;
  return next;
}

export function normalizeCellCount<T>(cells: T[], count: number, fill = "" as T): T[] {
  const next = cells.slice(0, count);
  while (next.length < count) next.push(fill);
  return next;
}

function cloneTable(table: MarkdownTable): MarkdownTable {
  return {
    headers: [...table.headers],
    aligns: [...table.aligns],
    rows: table.rows.map((row) => [...row])
  };
}

function targetTableRowForPaste(startRow: number, rowOffset: number): number {
  if (startRow === 0) return rowOffset === 0 ? 0 : rowOffset + 1;
  if (startRow === 1) return rowOffset + 2;
  return startRow + rowOffset;
}

function ensureDataRow(table: MarkdownTable, rowIndex: number, colCount: number): string[] {
  const safeIndex = Math.max(0, rowIndex);
  while (table.rows.length <= safeIndex) {
    table.rows.push(new Array(colCount).fill(""));
  }

  table.rows[safeIndex] = normalizeCellCount(table.rows[safeIndex], colCount);
  return table.rows[safeIndex];
}

type TableSortKey = {
  text: string;
  date: number | null;
  number: number | null;
  empty: boolean;
};

const tableSortCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base"
});

function tableSortKey(cell: string): TableSortKey {
  const text = stripInlineMarkdown(cell)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    text,
    date: parseSortableDate(text),
    number: parseSortableNumber(text),
    empty: text.length === 0
  };
}

function compareTableSortKeys(a: TableSortKey, b: TableSortKey): number {
  if (a.date !== null && b.date !== null) return a.date - b.date;
  if (a.number !== null && b.number !== null) return a.number - b.number;
  return tableSortCollator.compare(a.text, b.text);
}

function compareTableSortKeyGroups(a: TableSortKey, b: TableSortKey): number {
  if (a.date !== null || b.date !== null) return comparePresence(a.date !== null, b.date !== null);
  if (a.number !== null || b.number !== null) return comparePresence(a.number !== null, b.number !== null);
  return 0;
}

function comparePresence(aPresent: boolean, bPresent: boolean): number {
  if (aPresent === bPresent) return 0;
  return aPresent ? -1 : 1;
}

function parseSortableNumber(text: string): number | null {
  let value = text.replace(/\s+/g, "");
  value = value.replace(/^[¥$€£]/, "");
  if (value.endsWith("%")) value = value.slice(0, -1);

  const simpleNumber = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
  const groupedNumber = /^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?(?:e[+-]?\d+)?$/i;
  if (!simpleNumber.test(value) && !groupedNumber.test(value)) return null;

  const number = Number(value.replace(/,/g, ""));
  return Number.isFinite(number) ? number : null;
}

function parseSortableDate(text: string): number | null {
  const match = text.match(/^(\d{4})(?:[-/.年])(\d{1,2})(?:[-/.月])(\d{1,2})(?:日)?(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = match[4] === undefined ? 0 : Number(match[4]);
  const minute = match[5] === undefined ? 0 : Number(match[5]);
  const second = match[6] === undefined ? 0 : Number(match[6]);

  if (
    !Number.isInteger(year)
    || !Number.isInteger(month)
    || !Number.isInteger(day)
    || month < 1
    || month > 12
    || day < 1
    || day > 31
    || hour < 0
    || hour > 23
    || minute < 0
    || minute > 59
    || second < 0
    || second > 59
  ) {
    return null;
  }

  const timestamp = Date.UTC(year, month - 1, day, hour, minute, second);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
    || date.getUTCHours() !== hour
    || date.getUTCMinutes() !== minute
    || date.getUTCSeconds() !== second
  ) {
    return null;
  }

  return timestamp;
}

function hasPipe(line: string): boolean {
  return unescapedPipeIndexes(line).length > 0;
}

function canBeTableLine(line: string): boolean {
  return Boolean(line.trim()) && hasPipe(line) && !isIndentedCodeLine(line);
}

function isIndentedCodeLine(line: string): boolean {
  return /^(?: {4,}|\t)/.test(line);
}

function isLineInsideCodeFence(markdown: string, lineStartOffset: number): boolean {
  let fence: CodeFence | null = null;
  let cursor = 0;
  const limit = Math.max(0, Math.min(lineStartOffset, markdown.length));

  while (cursor < limit) {
    const nextBreak = markdown.indexOf("\n", cursor);
    const lineEnd = nextBreak === -1 ? markdown.length : nextBreak;
    const line = markdown.slice(cursor, lineEnd);

    if (fence) {
      if (closesCodeFence(line, fence)) fence = null;
    } else {
      fence = openingCodeFence(line);
    }

    if (nextBreak === -1) break;
    cursor = nextBreak + 1;
  }

  return fence !== null;
}

function openingCodeFence(line: string): CodeFence | null {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})/);
  if (!match) return null;

  const marker = match[1];
  return {
    char: marker[0] as "`" | "~",
    length: marker.length
  };
}

function closesCodeFence(line: string, fence: CodeFence): boolean {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
  return Boolean(match && match[1][0] === fence.char && match[1].length >= fence.length);
}

function isDelimiterLine(line: string): boolean {
  if (!hasPipe(line)) return false;
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function splitTableRow(row: string): string[] {
  let text = row.trim();
  if (text.startsWith("|")) text = text.slice(1);
  const pipeIndexes = unescapedPipeIndexes(text);
  if (pipeIndexes[pipeIndexes.length - 1] === text.length - 1) text = text.slice(0, -1);

  const splitIndexes = unescapedPipeIndexes(text);
  const cells: string[] = [];
  let cellStart = 0;

  for (const pipeIndex of splitIndexes) {
    cells.push(unescapeTableCellPipes(text.slice(cellStart, pipeIndex).trim()));
    cellStart = pipeIndex + 1;
  }

  cells.push(unescapeTableCellPipes(text.slice(cellStart).trim()));
  return cells;
}

function unescapeTableCellPipes(cell: string): string {
  let text = "";

  for (const char of cell) {
    if (char !== "|") {
      text += char;
      continue;
    }

    const backslashes = trailingBackslashCount(text);
    text = `${text.slice(0, text.length - backslashes)}${"\\".repeat(Math.floor(backslashes / 2))}|`;
  }

  return text;
}

function parseAlignments(cells: string[]): TableAlignment[] {
  return cells.map((cell) => {
    const value = cell.trim();
    const left = value.startsWith(":");
    const right = value.endsWith(":");

    if (left && right) return "center";
    if (right) return "right";
    if (left) return "left";
    return "none";
  });
}

function formatTableRow(row: string[], widths: number[]): string {
  return `| ${row.map((cell, index) => padVisual(escapeTableCell(cell ?? ""), widths[index])).join(" | ")} |`;
}

function formatSeparatorRow(aligns: TableAlignment[], widths: number[]): string {
  return `| ${widths.map((width, index) => {
    const align = aligns[index] ?? "none";

    if (align === "right") return padVisual(`${"-".repeat(Math.max(3, width - 1))}:`, width);
    if (align === "center") return padVisual(`:${"-".repeat(Math.max(3, width - 2))}:`, width);
    if (align === "left") return padVisual(`:${"-".repeat(Math.max(3, width - 1))}`, width);
    return padVisual("-".repeat(Math.max(3, width)), width);
  }).join(" | ")} |`;
}

function separatorWidth(align: TableAlignment): number {
  if (align === "left" || align === "right") return 4;
  if (align === "center") return 5;
  return 3;
}

function escapeTableCell(cell: string): string {
  let escaped = "";
  for (const char of cell.replace(/\n/g, "<br>")) {
    if (char !== "|") {
      escaped += char;
      continue;
    }

    const backslashes = trailingBackslashCount(escaped);
    escaped = `${escaped.slice(0, escaped.length - backslashes)}${"\\".repeat(backslashes * 2 + 1)}|`;
  }

  return escaped;
}

function tableCellDisplayWidth(cell: string): number {
  return visualWidth(escapeTableCell(cell));
}

function trailingBackslashCount(text: string): number {
  let count = 0;
  for (let index = text.length - 1; index >= 0 && text[index] === "\\"; index -= 1) {
    count += 1;
  }
  return count;
}

function getCellIndexFromColumn(line: string, column: number): number {
  const trimmed = line.trimStart();
  const leadingOffset = line.length - trimmed.length;
  const hasLeadingPipe = trimmed.startsWith("|");
  let count = unescapedPipeIndexes(line).filter((index) => index < Math.min(column, line.length)).length;

  if (hasLeadingPipe && column > leadingOffset) count -= 1;
  return Math.max(0, count);
}

function clampCellIndex(index: number, colCount: number): number {
  return Math.max(0, Math.min(index, Math.max(0, colCount - 1)));
}

type LineInfo = {
  start: number;
  end: number;
  number: number;
  col: number;
  text: string;
};

function lineAtOffset(text: string, offset: number, calculateLineNumber = true): LineInfo {
  const safeOffset = Math.max(0, Math.min(offset, text.length));
  const previousBreak = safeOffset === 0 ? -1 : text.lastIndexOf("\n", safeOffset - 1);
  const start = previousBreak + 1;
  const nextBreak = text.indexOf("\n", safeOffset);
  const end = nextBreak === -1 ? text.length : nextBreak;

  return {
    start,
    end,
    number: calculateLineNumber ? lineNumberAtOffset(text, start) : 0,
    col: safeOffset - start,
    text: text.slice(start, end)
  };
}

function previousLine(text: string, line: LineInfo): LineInfo | null {
  if (line.start === 0) return null;

  const end = line.start - 1;
  const previousBreak = end === 0 ? -1 : text.lastIndexOf("\n", end - 1);
  const start = previousBreak + 1;

  return {
    start,
    end,
    number: line.number - 1,
    col: 0,
    text: text.slice(start, end)
  };
}

function nextLine(text: string, line: LineInfo): LineInfo | null {
  if (line.end >= text.length) return null;

  const start = line.end + 1;
  const nextBreak = text.indexOf("\n", start);
  const end = nextBreak === -1 ? text.length : nextBreak;

  return {
    start,
    end,
    number: line.number + 1,
    col: 0,
    text: text.slice(start, end)
  };
}

function collectLines(text: string, start: LineInfo, end: LineInfo): LineInfo[] {
  const lines = [start];
  let current = start;

  while (current.number < end.number) {
    const next = nextLine(text, current);
    if (!next) break;
    lines.push(next);
    current = next;
  }

  return lines;
}

function lineNumberAtOffset(text: string, offset: number): number {
  let line = 0;
  for (let index = 0; index < offset; index += 1) {
    if (text[index] === "\n") line += 1;
  }
  return line;
}
