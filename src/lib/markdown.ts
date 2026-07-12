import MarkdownIt from "markdown-it";
import type { Heading, MarkdownTable, RenderedMarkdown, TableBlock } from "../types";
import { stripInlineMarkdown, stripTableCellMarkdown } from "./text";
import { buildMarkdownTable, parseMarkdownTable } from "./tables";
import { slugifyHeadingText } from "./headingIds";
import { normalizeReferenceLabel } from "./inlineMarkdown";
import type { TextRange } from "./editorCommands";
import { tableCellBoundaryRange, unescapedPipeIndexes } from "./tableSourceRanges";
import { normalizeTextRanges } from "./textRanges";
import { clampSelectionRangesToTableBlock, tableBlockForSelectionRanges } from "./tableSelectionRanges";
import { splitMarkdownFrontMatter } from "./markdownFrontMatter";

const markdownIt = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: false
});

type CodeFence = {
  char: "`" | "~";
  length: number;
};

type SelectedTableSlice = {
  table: MarkdownTable;
  selectedRows: SelectedTableRow[];
  columns: number[];
  selectedCellKeys?: Set<string>;
};

type SelectedTableRow = {
  row: string[];
  isHeader: boolean;
  position: number;
};

type MarkdownRenderEnv = {
  headingIds?: Map<string, number>;
  sourceLineOffset?: number;
};

markdownIt.core.ruler.after("inline", "nya_task_lists", (state) => {
  const sourceLineOffset = Number.isInteger(state.env.sourceLineOffset)
    ? Number(state.env.sourceLineOffset)
    : 0;

  state.tokens.forEach((token, index) => {
    if (token.type !== "list_item_open") return;

    const inlineToken = findListItemInlineToken(state.tokens, index);
    if (!inlineToken) return;

    const match = inlineToken.content.match(/^\[([ xX])\]\s+/);
    if (!match) return;

    const checked = match[1].toLowerCase() === "x";
    const taskLine = token.map?.[0];
    token.attrJoin("class", "task-list-item");
    token.attrSet("data-task-line", taskLine === undefined ? "" : String(taskLine + sourceLineOffset));
    token.attrSet("data-task-checked", checked ? "true" : "false");
    inlineToken.content = inlineToken.content.slice(match[0].length);

    const firstTextChild = inlineToken.children?.find((child) => child.type === "text");
    if (firstTextChild?.content.startsWith(match[0])) {
      firstTextChild.content = firstTextChild.content.slice(match[0].length);
    }
  });
});

markdownIt.core.ruler.after("inline", "nya_table_cell_breaks", (state) => {
  let inTableCell = false;

  state.tokens.forEach((token) => {
    if (token.type === "th_open" || token.type === "td_open") {
      inTableCell = true;
      return;
    }

    if (token.type === "th_close" || token.type === "td_close") {
      inTableCell = false;
      return;
    }

    if (!inTableCell || token.type !== "inline") return;

    token.children?.forEach((child) => {
      if (child.type !== "text" || !child.content.includes("<br")) return;
      child.meta = { ...(child.meta ?? {}), nyaTableCellBreaks: true };
    });
  });
});

markdownIt.renderer.rules.list_item_open = (tokens, index, options, env, self) => {
  const token = tokens[index];
  const rendered = self.renderToken(tokens, index, options);
  const line = token.attrGet("data-task-line");
  if (line === null) return rendered;

  const checked = token.attrGet("data-task-checked") === "true";
  const checkbox = `<input class="task-list-checkbox" type="checkbox" data-task-line="${line}" aria-label="Toggle task"${checked ? " checked" : ""}>`;
  return `${rendered}${checkbox}`;
};

markdownIt.renderer.rules.link_open = (tokens, index, options, env, self) => {
  const token = tokens[index];
  const href = token.attrGet("href") ?? "";

  if (/^(javascript|vbscript|data):/i.test(href)) {
    token.attrSet("href", "#");
  }

  token.attrSet("target", "_blank");
  token.attrSet("rel", "noreferrer noopener");
  return self.renderToken(tokens, index, options);
};

markdownIt.renderer.rules.heading_open = (tokens, index, options, env: MarkdownRenderEnv, self) => {
  const token = tokens[index];
  const inlineToken = tokens[index + 1];
  const text = inlineToken?.type === "inline" ? stripInlineMarkdown(inlineToken.content) : "heading";
  token.attrSet("id", nextHeadingId(text, env));
  return self.renderToken(tokens, index, options);
};

markdownIt.renderer.rules.text = (tokens, index) => {
  const escaped = escapeHtmlText(tokens[index].content);
  return hasTableCellBreaks(tokens[index]) ? escaped.replace(/&lt;br\s*\/?&gt;/gi, "<br>") : escaped;
};

markdownIt.renderer.rules.image = (tokens, index, options, env, self) => {
  const token = tokens[index];
  const src = token.attrGet("src") ?? "";

  if (/^(javascript|vbscript):/i.test(src)) {
    token.attrSet("src", "");
  }

  token.attrSet("loading", "lazy");
  return self.renderToken(tokens, index, options);
};

export function renderMarkdown(markdown: string): RenderedMarkdown {
  return {
    html: renderMarkdownHtml(markdown),
    headings: extractHeadings(markdown)
  };
}

export function renderMarkdownHtml(markdown: string): string {
  const { frontMatter, body } = splitMarkdownFrontMatter(markdown);
  return renderMarkdownFragment(body, frontMatterLineCount(frontMatter));
}

export function markdownToHtmlFragment(markdown: string): string {
  return renderMarkdownFragment(markdown, 0).trim();
}

function renderMarkdownFragment(markdown: string, sourceLineOffset: number): string {
  return markdownIt.render(markdown, {
    headingIds: new Map<string, number>(),
    sourceLineOffset
  });
}

export function markdownRangeToClipboardPayload(markdown: string, selection: TextRange): { plainText: string; markdown: string; html: string } {
  const from = Math.max(0, Math.min(selection.from, selection.to, markdown.length));
  const to = Math.max(from, Math.min(Math.max(selection.from, selection.to), markdown.length));
  const selectedMarkdown = markdown.slice(from, to);
  const referenceLabels = referenceLabelsFromMarkdown(markdown);
  const tablePayload = tableSelectionToClipboardPayload(markdown, { from, to }, referenceLabels);

  return {
    plainText: tablePayload?.plainText ?? markdownToPlain(selectedMarkdown, referenceLabels),
    markdown: tablePayload?.markdown ?? selectedMarkdown,
    html: tablePayload?.html ?? markdownToHtmlFragment(selectedMarkdown)
  };
}

export function markdownRangesToClipboardPayload(markdown: string, ranges: readonly TextRange[]): { plainText: string; markdown: string; html: string } {
  const normalizedRanges = normalizeClipboardRanges(markdown, ranges);
  if (normalizedRanges.length <= 1) {
    return markdownRangeToClipboardPayload(markdown, normalizedRanges[0] ?? { from: 0, to: 0 });
  }

  const referenceLabels = referenceLabelsFromMarkdown(markdown);
  const tablePayload = tableRangesToClipboardPayload(markdown, normalizedRanges, referenceLabels);
  if (tablePayload) return tablePayload;

  const selectedMarkdown = normalizedRanges.map((range) => markdown.slice(range.from, range.to)).join("\n");
  return {
    plainText: markdownToPlain(selectedMarkdown, referenceLabels),
    markdown: selectedMarkdown,
    html: markdownToHtmlFragment(selectedMarkdown)
  };
}

export function markdownRangesToTableCsv(markdown: string, ranges: readonly TextRange[]): string | null {
  const normalizedRanges = normalizeClipboardRanges(markdown, ranges);
  const referenceLabels = referenceLabelsFromMarkdown(markdown);
  if (normalizedRanges.length <= 1) {
    const slice = tableSelectionToSlice(markdown, normalizedRanges[0] ?? { from: 0, to: 0 });
    return slice ? selectedTableSliceToCsv(slice.selectedRows, slice.columns, slice.selectedCellKeys, referenceLabels) : null;
  }

  const slice = tableRangesToSlice(markdown, normalizedRanges);
  return slice ? selectedTableSliceToCsv(slice.selectedRows, slice.columns, slice.selectedCellKeys, referenceLabels) : null;
}

export function markdownRangesToTableTsv(markdown: string, ranges: readonly TextRange[]): string | null {
  const normalizedRanges = normalizeClipboardRanges(markdown, ranges);
  const referenceLabels = referenceLabelsFromMarkdown(markdown);
  if (normalizedRanges.length <= 1) {
    const slice = tableSelectionToSlice(markdown, normalizedRanges[0] ?? { from: 0, to: 0 });
    return slice ? selectedTableSliceToTsv(slice.selectedRows, slice.columns, slice.selectedCellKeys, referenceLabels) : null;
  }

  const slice = tableRangesToSlice(markdown, normalizedRanges);
  return slice ? selectedTableSliceToTsv(slice.selectedRows, slice.columns, slice.selectedCellKeys, referenceLabels) : null;
}

export function markdownRangesToTableMarkdown(markdown: string, ranges: readonly TextRange[]): string | null {
  const normalizedRanges = normalizeClipboardRanges(markdown, ranges);
  if (normalizedRanges.length <= 1) {
    const slice = tableSelectionToSlice(markdown, normalizedRanges[0] ?? { from: 0, to: 0 });
    return slice ? buildClipboardMarkdownTable(slice.table, slice.selectedRows, slice.columns, slice.selectedCellKeys) : null;
  }

  const slice = tableRangesToSlice(markdown, normalizedRanges);
  return slice ? buildClipboardMarkdownTable(slice.table, slice.selectedRows, slice.columns, slice.selectedCellKeys) : null;
}

export function markdownTableSliceToClipboardPayload(
  table: MarkdownTable,
  rowPositions: number[],
  columnIndexes = table.headers.map((_header, index) => index),
  referenceLabels?: ReadonlySet<string>
): { plainText: string; markdown: string; html: string } | null {
  const columns = uniqueSortedIndexes(columnIndexes, table.headers.length);
  const selectedRows = uniqueSortedIndexes(rowPositions, table.rows.length + 2)
    .map((position) => tableRowForPosition(table, position))
    .filter((row): row is SelectedTableRow => row !== null);

  if (!columns.length || !selectedRows.length) return null;

  const markdown = buildClipboardMarkdownTable(table, selectedRows, columns);

  return {
    plainText: selectedTableSliceToTsv(selectedRows, columns, undefined, referenceLabels),
    markdown,
    html: renderSelectedTableHtml(selectedRows, columns, table.aligns)
  };
}

export function markdownTableSliceToTsv(
  table: MarkdownTable,
  rowPositions: number[],
  columnIndexes = table.headers.map((_header, index) => index),
  referenceLabels?: ReadonlySet<string>
): string | null {
  const columns = uniqueSortedIndexes(columnIndexes, table.headers.length);
  const selectedRows = uniqueSortedIndexes(rowPositions, table.rows.length + 2)
    .map((position) => tableRowForPosition(table, position))
    .filter((row): row is SelectedTableRow => row !== null);

  if (!columns.length || !selectedRows.length) return null;

  return selectedTableSliceToTsv(selectedRows, columns, undefined, referenceLabels);
}

export function markdownTableSliceToMarkdown(
  table: MarkdownTable,
  rowPositions: number[],
  columnIndexes = table.headers.map((_header, index) => index)
): string | null {
  const columns = uniqueSortedIndexes(columnIndexes, table.headers.length);
  const selectedRows = uniqueSortedIndexes(rowPositions, table.rows.length + 2)
    .map((position) => tableRowForPosition(table, position))
    .filter((row): row is SelectedTableRow => row !== null);

  if (!columns.length || !selectedRows.length) return null;

  return buildClipboardMarkdownTable(table, selectedRows, columns);
}

export function markdownTableSliceToCsv(
  table: MarkdownTable,
  rowPositions: number[],
  columnIndexes = table.headers.map((_header, index) => index),
  referenceLabels?: ReadonlySet<string>
): string | null {
  const columns = uniqueSortedIndexes(columnIndexes, table.headers.length);
  const selectedRows = uniqueSortedIndexes(rowPositions, table.rows.length + 2)
    .map((position) => tableRowForPosition(table, position))
    .filter((row): row is SelectedTableRow => row !== null);

  if (!columns.length || !selectedRows.length) return null;

  return selectedTableSliceToCsv(selectedRows, columns, undefined, referenceLabels);
}

export function markdownToPlain(markdown: string, referenceLabels = referenceLabelsFromMarkdown(markdown)): string {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let index = 0;
  let fence: CodeFence | null = null;

  while (index < lines.length) {
    if (fence) {
      if (closesCodeFence(lines[index], fence)) {
        fence = null;
      } else {
        out.push(lines[index]);
      }
      index += 1;
      continue;
    }

    const openingFence = openingCodeFence(lines[index]);
    if (openingFence) {
      fence = openingFence;
      index += 1;
      continue;
    }

    if (isIndentedCodeLine(lines[index])) {
      out.push(unindentIndentedCodeLine(lines[index]));
      index += 1;
      continue;
    }

    if (isReferenceDefinitionLine(lines[index])) {
      index += isReferenceDefinitionTitleLine(lines[index + 1]) ? 2 : 1;
      continue;
    }

    if (index + 1 < lines.length && isSetextHeadingTextLine(lines[index]) && setextHeadingLevel(lines[index + 1])) {
      out.push(stripInlineMarkdown(lines[index]).trim());
      index += 2;
      continue;
    }

    if (index + 1 < lines.length && canBeTableLine(lines[index]) && canBeTableLine(lines[index + 1]) && isDelimiterLine(lines[index + 1])) {
      let end = index + 2;
      while (end < lines.length && canBeTableLine(lines[end])) end += 1;

      const table = parseMarkdownTable(lines.slice(index, end));
      if (table) {
        out.push([table.headers, ...table.rows].map((row) => row.map((cell) => stripTableCellMarkdown(cell, "space", { referenceLabels })).join("\t")).join("\n"));
        index = end;
        continue;
      }
    }

    out.push(
      stripInlineMarkdown(lines[index], { referenceLabels })
        .replace(/^ {0,3}#{1,6}(?:[ \t]+|$)/, "")
        .replace(/[ \t]+#+[ \t]*$/, "")
        .replace(/^ {0,3}(?:>\s?)+/, "")
        .replace(/^\s*([-*+]|\d+[.)])\s+/, "")
        .replace(/^\[[ xX]\]\s+/, "")
    );
    index += 1;
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function referenceLabelsFromMarkdown(markdown: string): Set<string> {
  const labels = new Set<string>();
  for (const line of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const match = line.match(/^[ \t]{0,3}\[([^\]\n]+)\]:[ \t]*\S+/);
    if (match) labels.add(normalizeReferenceLabel(match[1]));
  }
  return labels;
}

function tableSelectionToClipboardPayload(markdown: string, selection: TextRange, referenceLabels?: ReadonlySet<string>): { plainText: string; markdown: string; html: string } | null {
  const slice = tableSelectionToSlice(markdown, selection);
  if (!slice) return null;

  return {
    plainText: selectedTableSliceToTsv(slice.selectedRows, slice.columns, slice.selectedCellKeys, referenceLabels),
    markdown: buildClipboardMarkdownTable(slice.table, slice.selectedRows, slice.columns, slice.selectedCellKeys),
    html: renderSelectedTableHtml(slice.selectedRows, slice.columns, slice.table.aligns, slice.selectedCellKeys)
  };
}

function tableRangesToClipboardPayload(markdown: string, ranges: TextRange[], referenceLabels?: ReadonlySet<string>): { plainText: string; markdown: string; html: string } | null {
  const slice = tableRangesToSlice(markdown, ranges);
  if (!slice) return null;

  return {
    plainText: selectedTableSliceToTsv(slice.selectedRows, slice.columns, slice.selectedCellKeys, referenceLabels),
    markdown: buildClipboardMarkdownTable(slice.table, slice.selectedRows, slice.columns, slice.selectedCellKeys),
    html: renderSelectedTableHtml(slice.selectedRows, slice.columns, slice.table.aligns, slice.selectedCellKeys)
  };
}

function tableSelectionToSlice(markdown: string, selection: TextRange): SelectedTableSlice | null {
  if (selection.from === selection.to) return null;

  const block = tableBlockForSelectionRanges(markdown, [selection]);
  if (!block) return null;

  const tableRanges = clampSelectionRangesToTableBlock([selection], block);
  return tableRanges.length ? collectTableSlice(markdown, block, tableRanges) : null;
}

function tableRangesToSlice(markdown: string, ranges: TextRange[]): SelectedTableSlice | null {
  const block = tableBlockForSelectionRanges(markdown, ranges);
  if (!block) return null;

  const tableRanges = clampSelectionRangesToTableBlock(ranges, block);
  if (!tableRanges.length) return null;

  return collectTableSlice(markdown, block, tableRanges);
}

function collectTableSlice(markdown: string, block: TableBlock, ranges: TextRange[]): SelectedTableSlice | null {
  const tableMarkdown = markdown.slice(block.startOffset, block.endOffset).replace(/\n$/, "");
  const lines = tableMarkdown.split("\n");
  const selectedRows: SelectedTableRow[] = [];
  const selectedColumns = new Set<number>();
  const selectedCellKeys = new Set<string>();
  let lineOffset = block.startOffset;

  lines.forEach((line, lineIndex) => {
    const row = tableRowForLine(block.table, lineIndex);
    const lineStart = lineOffset;
    const lineEnd = lineStart + line.length;
    lineOffset = lineEnd + 1;

    if (!row || !ranges.some((range) => rangesOverlap(range, { from: lineStart, to: lineEnd }))) return;

    const cellRanges = tableCellContentRanges(line, lineStart, block.table.headers.length);
    const rowColumns = cellRanges
      .map((range, col) => ranges.some((selection) => rangeCovers(selection, range)) ? col : -1)
      .filter((col) => col >= 0);

    if (!rowColumns.length) return;

    rowColumns.forEach((col) => {
      selectedColumns.add(col);
      selectedCellKeys.add(tableCellKey(lineIndex, col));
    });
    selectedRows.push({ row, isHeader: lineIndex === 0, position: lineIndex });
  });

  if (!selectedRows.length || !selectedColumns.size) return null;

  const columns = [...selectedColumns].sort((left, right) => left - right);

  return {
    table: block.table,
    selectedRows,
    columns,
    selectedCellKeys
  };
}

function selectedTableSliceToTsv(
  selectedRows: SelectedTableRow[],
  columns: number[],
  selectedCellKeys?: Set<string>,
  referenceLabels?: ReadonlySet<string>
): string {
  return selectedRows
    .map((row) => columns.map((col) => stripTableCellMarkdown(selectedTableCellValue(row, col, selectedCellKeys), "space", { referenceLabels })).join("\t"))
    .join("\n");
}

function selectedTableSliceToCsv(
  selectedRows: SelectedTableRow[],
  columns: number[],
  selectedCellKeys?: Set<string>,
  referenceLabels?: ReadonlySet<string>
): string {
  return selectedRows
    .map((row) => columns.map((col) => escapeCsvCell(stripTableCellMarkdown(selectedTableCellValue(row, col, selectedCellKeys), "newline", { referenceLabels }))).join(","))
    .join("\n");
}

function buildClipboardMarkdownTable(table: MarkdownTable, selectedRows: SelectedTableRow[], columns: number[], selectedCellKeys?: Set<string>): string {
  const firstRowIsHeader = selectedRows[0]?.isHeader ?? false;
  const headers = firstRowIsHeader
    ? columns.map((col) => selectedTableCellValue(selectedRows[0], col, selectedCellKeys))
    : columns.map((col) => table.headers[col] ?? `Column ${col + 1}`);
  const rows = (firstRowIsHeader ? selectedRows.slice(1) : selectedRows)
    .map((row) => columns.map((col) => selectedTableCellValue(row, col, selectedCellKeys)));
  const aligns = columns.map((col) => table.aligns[col] ?? "none");

  return buildMarkdownTable({ headers, aligns, rows });
}

function tableRowForPosition(table: MarkdownTable, rowPosition: number): SelectedTableRow | null {
  if (rowPosition === 0) return { row: table.headers, isHeader: true, position: rowPosition };
  if (rowPosition === 1) return null;

  const row = table.rows[rowPosition - 2];
  return row ? { row, isHeader: false, position: rowPosition } : null;
}

function uniqueSortedIndexes(indexes: number[], maxExclusive: number): number[] {
  return [...new Set(indexes)]
    .filter((index) => Number.isInteger(index) && index >= 0 && index < maxExclusive)
    .sort((left, right) => left - right);
}

function escapeCsvCell(value: string): string {
  if (!/[",\r\n]|^\s|\s$/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

function normalizeClipboardRanges(markdown: string, ranges: readonly TextRange[]): TextRange[] {
  return normalizeTextRanges(ranges, markdown.length);
}

function tableRowForLine(table: NonNullable<ReturnType<typeof parseMarkdownTable>>, lineIndex: number): string[] | null {
  if (lineIndex === 0) return table.headers;
  if (lineIndex === 1) return null;
  return table.rows[lineIndex - 2] ?? null;
}

function tableCellBoundaryRanges(line: string, lineOffset: number, colCount: number): TextRange[] {
  return Array.from({ length: colCount }, (_value, col) => {
    return tableCellBoundaryRange(line, lineOffset, col) ?? {
      from: lineOffset + line.length,
      to: lineOffset + line.length
    };
  });
}

function tableCellContentRanges(line: string, lineOffset: number, colCount: number): TextRange[] {
  return tableCellBoundaryRanges(line, lineOffset, colCount).map((range) => trimTableCellRange(line, lineOffset, range));
}

function trimTableCellRange(line: string, lineOffset: number, range: TextRange): TextRange {
  let from = range.from - lineOffset;
  let to = range.to - lineOffset;
  while (from < to && /\s/.test(line[from])) from += 1;
  while (to > from && /\s/.test(line[to - 1])) to -= 1;
  if (from === to) return range;
  return { from: lineOffset + from, to: lineOffset + to };
}

function rangesOverlap(left: TextRange, right: TextRange): boolean {
  return left.from < right.to && left.to > right.from;
}

function rangeCovers(left: TextRange, right: TextRange): boolean {
  return left.from <= right.from && left.to >= right.to;
}

function renderSelectedTableHtml(
  selectedRows: SelectedTableRow[],
  columns: number[],
  aligns: MarkdownTable["aligns"],
  selectedCellKeys?: Set<string>
): string {
  const firstRowIsHeader = selectedRows[0]?.isHeader ?? false;
  const headerRows = firstRowIsHeader ? selectedRows.slice(0, 1) : [];
  const bodyRows = firstRowIsHeader ? selectedRows.slice(1) : selectedRows;
  const thead = headerRows.length
    ? `<thead>${headerRows.map((row) => renderHtmlTableRow(row, columns, aligns, "th", selectedCellKeys)).join("")}</thead>`
    : "";
  const tbody = bodyRows.length
    ? `<tbody>${bodyRows.map((row) => renderHtmlTableRow(row, columns, aligns, "td", selectedCellKeys)).join("")}</tbody>`
    : "";

  return `<table>${thead}${tbody}</table>`;
}

function renderHtmlTableRow(
  row: SelectedTableRow,
  columns: number[],
  aligns: MarkdownTable["aligns"],
  cellTag: "td" | "th",
  selectedCellKeys?: Set<string>
): string {
  return `<tr>${columns.map((col) => {
    const alignment = htmlAlignmentAttribute(aligns[col] ?? "none");
    const cell = renderTableCellInline(selectedTableCellValue(row, col, selectedCellKeys));
    return `<${cellTag}${alignment}>${cell}</${cellTag}>`;
  }).join("")}</tr>`;
}

function renderTableCellInline(markdown: string): string {
  return markdownIt.renderInline(markdown).replace(/&lt;br\s*\/?&gt;/gi, "<br>");
}

function selectedTableCellValue(row: SelectedTableRow, col: number, selectedCellKeys?: Set<string>): string {
  if (selectedCellKeys && !selectedCellKeys.has(tableCellKey(row.position, col))) return "";
  return row.row[col] ?? "";
}

function tableCellKey(rowPosition: number, col: number): string {
  return `${rowPosition}:${col}`;
}

function hasTableCellBreaks(token: { meta?: unknown }): boolean {
  const meta = token.meta;
  return Boolean(meta && typeof meta === "object" && "nyaTableCellBreaks" in meta && meta.nyaTableCellBreaks);
}

function htmlAlignmentAttribute(alignment: MarkdownTable["aligns"][number]): string {
  if (alignment === "left" || alignment === "center" || alignment === "right") {
    return ` style="text-align: ${alignment};"`;
  }
  return "";
}

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function findListItemInlineToken(tokens: TokenLike[], listItemOpenIndex: number): TokenLike | null {
  for (let index = listItemOpenIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === "list_item_close") return null;
    if (token.type === "inline") return token;
  }

  return null;
}

type TokenLike = {
  type: string;
  content: string;
  map: [number, number] | null;
  children: Array<{ type: string; content: string }> | null;
  attrJoin: (name: string, value: string) => void;
  attrSet: (name: string, value: string) => void;
  attrGet: (name: string) => string | null;
};

export function extractHeadings(markdown: string): Heading[] {
  const used = new Map<string, number>();
  const headings: Heading[] = [];
  let fence: CodeFence | null = null;
  const { frontMatter, body } = splitMarkdownFrontMatter(markdown);
  const bodyLineOffset = frontMatterLineCount(frontMatter);
  const lines = body.replace(/\r\n?/g, "\n").split("\n");

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    const line = lines[lineNumber];

    if (fence) {
      if (closesCodeFence(line, fence)) fence = null;
      continue;
    }

    const openingFence = openingCodeFence(line);
    if (openingFence) {
      fence = openingFence;
      continue;
    }

    const atxMatch = line.match(/^ {0,3}(#{1,6})(?:[ \t]+|$)(.*?)\s*(?:[ \t]+#+[ \t]*)?$/);
    if (atxMatch) {
      pushHeading(headings, used, atxMatch[1].length, stripInlineMarkdown(atxMatch[2]), lineNumber + bodyLineOffset);
      continue;
    }

    const setextLevel = setextHeadingLevel(line);
    const previousLine = lines[lineNumber - 1];
    if (setextLevel && previousLine !== undefined && isSetextHeadingTextLine(previousLine)) {
      pushHeading(headings, used, setextLevel, stripInlineMarkdown(previousLine).trim(), lineNumber - 1 + bodyLineOffset);
    }
  }

  return headings;
}

function frontMatterLineCount(frontMatter: string): number {
  return frontMatter.match(/\n/g)?.length ?? 0;
}

function pushHeading(headings: Heading[], used: Map<string, number>, level: number, text: string, line: number): void {
  const base = slugifyHeadingText(text);
  const count = used.get(base) ?? 0;
  used.set(base, count + 1);

  headings.push({
    level,
    text,
    line,
    id: count === 0 ? base : `${base}-${count}`
  });
}

function nextHeadingId(text: string, env: MarkdownRenderEnv): string {
  const base = slugifyHeadingText(text);
  const used = env.headingIds ?? new Map<string, number>();
  env.headingIds = used;

  const count = used.get(base) ?? 0;
  used.set(base, count + 1);
  return count === 0 ? base : `${base}-${count}`;
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

function isReferenceDefinitionLine(line: string): boolean {
  return /^[ \t]{0,3}\[[^\]\n]+\]:[ \t]*\S+/.test(line);
}

function isReferenceDefinitionTitleLine(line?: string): boolean {
  if (line === undefined) return false;
  return /^[ \t]{0,3}(?:"[^"]*"|'[^']*'|\([^)]*\))[ \t]*$/.test(line);
}

function isSetextHeadingTextLine(line: string): boolean {
  return Boolean(line.trim()) && !setextHeadingLevel(line) && !isIndentedCodeLine(line) && !isAtxHeadingLine(line) && !canBeTableLine(line);
}

function isAtxHeadingLine(line: string): boolean {
  return /^ {0,3}#{1,6}(?:[ \t]+|$)/.test(line);
}

function setextHeadingLevel(line: string): 1 | 2 | null {
  const marker = line.match(/^ {0,3}(=+|-+)[ \t]*$/)?.[1];
  if (!marker) return null;
  return marker[0] === "=" ? 1 : 2;
}

function unindentIndentedCodeLine(line: string): string {
  return line.startsWith("\t") ? line.slice(1) : line.replace(/^ {1,4}/, "");
}

function isDelimiterLine(line: string): boolean {
  if (!hasPipe(line)) return false;
  const text = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells = text.split("|");
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
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
