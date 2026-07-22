import { unescapedPipeIndexes } from "./tableSourceRanges";

export type MalformedMarkdownTableProjection = {
  raw: string;
  markdown: string;
};

type SourceLine = {
  text: string;
  lineBreak: string;
  end: number;
};

type PipeRow = {
  cells: string[];
  separators: number[];
  hasLeadingPipe: boolean;
  hasTrailingPipe: boolean;
};

type CodeFence = {
  char: "`" | "~";
  length: number;
};

const API_TABLE_CONTINUATION_PREFIX = /^ {8,}(?=\|)/;
const DESCRIPTION_HEADER = /(?:说明|描述|备注|\bdescription\b|\bnotes?\b)/i;

/**
 * Builds a parse-only projection for a narrow class of malformed API-export
 * tables. The caller remains responsible for retaining the original source.
 */
export function projectMalformedMarkdownTables(markdown: string): string {
  let remaining = markdown;
  let projected = "";

  while (remaining) {
    const start = malformedMarkdownTableProjectionStart(remaining);
    if (start < 0) return projected + remaining;

    const table = malformedMarkdownTableProjectionAtStart(remaining.slice(start));
    if (!table) return projected + remaining;

    projected += remaining.slice(0, start) + table.markdown;
    remaining = remaining.slice(start + table.raw.length);
  }

  return projected;
}

export function malformedMarkdownTableProjectionStart(markdown: string): number {
  const lines = sourceLines(markdown);
  let offset = 0;
  let fence: CodeFence | null = null;

  for (const line of lines) {
    if (fence) {
      if (closesCodeFence(line.text, fence)) fence = null;
    } else {
      const openingFence = openingCodeFence(line.text);
      if (openingFence) {
        fence = openingFence;
      } else if (malformedMarkdownTableProjectionAtStart(markdown.slice(offset))) {
        return offset;
      }
    }

    offset = line.end;
  }

  return -1;
}

export function malformedMarkdownTableProjectionAtStart(source: string): MalformedMarkdownTableProjection | null {
  const firstLines = sourceLines(source, 2);
  if (firstLines.length < 2 || isIndentedCodeLine(firstLines[0].text) || isIndentedCodeLine(firstLines[1].text)) return null;
  if (!firstLines[0].text.startsWith("|") || !firstLines[1].text.startsWith("|")) return null;

  const header = pipeRow(firstLines[0].text);
  const delimiter = pipeRow(firstLines[1].text);
  if (!header
    || !delimiter
    || !header.hasLeadingPipe
    || !header.hasTrailingPipe
    || !delimiter.hasLeadingPipe
    || !delimiter.hasTrailingPipe
    || !isDelimiterRow(delimiter)) {
    return null;
  }

  const columnCount = delimiter.cells.length;
  if (columnCount < 1 || header.cells.length !== columnCount) return null;

  const descriptionColumns = header.cells
    .map((cell, index) => DESCRIPTION_HEADER.test(cell.trim()) ? index : -1)
    .filter((index) => index >= 0);
  if (descriptionColumns.length !== 1) return null;

  const lines = sourceLines(source);
  const descriptionColumn = descriptionColumns[0];
  const normalizedLines = [lines[0].text, lines[1].text];
  let lastConsumedLine = 1;
  let sawOrdinaryBodyRow = false;
  let continuationPrefix: string | null = null;

  for (let index = 2; index < lines.length; index += 1) {
    const line = lines[index].text;
    if (!line.trim()) break;

    const ordinaryRow = !isIndentedCodeLine(line) ? pipeRow(line) : null;
    if (ordinaryRow
      && line.startsWith("|")
      && ordinaryRow.hasLeadingPipe
      && ordinaryRow.hasTrailingPipe
      && ordinaryRow.cells.length >= columnCount) {
      normalizedLines.push(line);
      lastConsumedLine = index;
      sawOrdinaryBodyRow = true;
      continue;
    }

    if (!sawOrdinaryBodyRow) break;
    const prefix = line.match(API_TABLE_CONTINUATION_PREFIX)?.[0] ?? null;
    if (!prefix || (continuationPrefix !== null && continuationPrefix !== prefix)) break;

    const recoveredLine = line.slice(prefix.length);
    const recoveredRow = pipeRow(recoveredLine);
    if (!recoveredRow
      || !recoveredRow.hasLeadingPipe
      || !recoveredRow.hasTrailingPipe
      || recoveredRow.cells.length < columnCount) {
      break;
    }

    continuationPrefix = prefix;
    normalizedLines.push(recoveredLine);
    lastConsumedLine = index;
  }

  let changed = continuationPrefix !== null;
  for (let index = 0; index < normalizedLines.length; index += 1) {
    if (index === 1) continue;
    const repaired = repairDescriptionCellPipes(normalizedLines[index], columnCount, descriptionColumn);
    if (repaired !== normalizedLines[index]) changed = true;
    normalizedLines[index] = repaired;
  }

  if (!changed) return null;

  const raw = source.slice(0, lines[lastConsumedLine].end);
  const markdown = normalizedLines
    .map((line, index) => line + lines[index].lineBreak)
    .join("");

  return { raw, markdown };
}

function repairDescriptionCellPipes(line: string, columnCount: number, descriptionColumn: number): string {
  const row = pipeRow(line);
  if (!row || row.cells.length <= columnCount) return line;

  const overflow = row.cells.length - columnCount;
  const firstDescriptionSeparator = descriptionColumn;
  const lastDescriptionSeparator = firstDescriptionSeparator + overflow;
  const escapeIndexes = row.separators.slice(firstDescriptionSeparator, lastDescriptionSeparator);
  if (escapeIndexes.length !== overflow) return line;

  let repaired = line;
  for (let index = escapeIndexes.length - 1; index >= 0; index -= 1) {
    const pipeIndex = escapeIndexes[index];
    repaired = `${repaired.slice(0, pipeIndex)}\\${repaired.slice(pipeIndex)}`;
  }
  return repaired;
}

function pipeRow(line: string): PipeRow | null {
  const pipes = unescapedPipeIndexes(line);
  if (!pipes.length) return null;

  const firstContent = line.search(/\S/);
  if (firstContent < 0) return null;
  let lastContent = line.length - 1;
  while (lastContent >= 0 && /\s/.test(line[lastContent])) lastContent -= 1;

  const hasLeadingPipe = line[firstContent] === "|";
  const hasTrailingPipe = line[lastContent] === "|";
  const contentStart = hasLeadingPipe ? firstContent + 1 : 0;
  const contentEnd = hasTrailingPipe ? lastContent : line.length;
  const separators = pipes.filter((index) => index >= contentStart && index < contentEnd);
  const cells: string[] = [];
  let cellStart = contentStart;

  for (const separator of separators) {
    cells.push(line.slice(cellStart, separator).trim());
    cellStart = separator + 1;
  }
  cells.push(line.slice(cellStart, contentEnd).trim());

  return { cells, separators, hasLeadingPipe, hasTrailingPipe };
}

function isDelimiterRow(row: PipeRow): boolean {
  return row.cells.length > 0 && row.cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function isIndentedCodeLine(line: string): boolean {
  return /^(?: {4,}| {0,3}\t)/.test(line);
}

function openingCodeFence(line: string): CodeFence | null {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})/);
  if (!match) return null;
  return { char: match[1][0] as "`" | "~", length: match[1].length };
}

function closesCodeFence(line: string, fence: CodeFence): boolean {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
  return Boolean(match && match[1][0] === fence.char && match[1].length >= fence.length);
}

function sourceLines(source: string, limit = Number.POSITIVE_INFINITY): SourceLine[] {
  const lines: SourceLine[] = [];
  let cursor = 0;

  while (cursor < source.length && lines.length < limit) {
    let lineEnd = cursor;
    while (lineEnd < source.length && source[lineEnd] !== "\r" && source[lineEnd] !== "\n") lineEnd += 1;

    let breakEnd = lineEnd;
    if (source[breakEnd] === "\r" && source[breakEnd + 1] === "\n") {
      breakEnd += 2;
    } else if (source[breakEnd] === "\r" || source[breakEnd] === "\n") {
      breakEnd += 1;
    }

    lines.push({
      text: source.slice(cursor, lineEnd),
      lineBreak: source.slice(lineEnd, breakEnd),
      end: breakEnd
    });
    cursor = breakEnd;
  }

  return lines;
}
