import { unescapedPipeIndexes } from "./tableSourceRanges";
import { findTableAtOffset } from "./tables";

const LEGACY_TABLE_CELL_LINE_SEPARATOR = "\u001f";
const TABLE_CELL_LINE_SEPARATOR = "<br>";

type TableSourceRange = {
  start: number;
  end: number;
};

type SourceLine = {
  start: number;
  end: number;
  text: string;
};

type QuotePrefix = {
  depth: number;
  length: number;
};

export function migrateLegacyTableCellBreaks(markdown: string): string {
  if (!markdown.includes(LEGACY_TABLE_CELL_LINE_SEPARATOR)) return markdown;

  const ranges = new Map<string, TableSourceRange>();
  let cursor = markdown.indexOf(LEGACY_TABLE_CELL_LINE_SEPARATOR);
  while (cursor !== -1) {
    const range = tableRangeAtOffset(markdown, cursor);
    if (range) {
      ranges.set(`${range.start}:${range.end}`, range);
    }
    cursor = markdown.indexOf(LEGACY_TABLE_CELL_LINE_SEPARATOR, cursor + 1);
  }

  let migrated = markdown;
  for (const range of [...ranges.values()].sort((left, right) => right.start - left.start)) {
    const table = migrated.slice(range.start, range.end);
    const nextTable = table
      .split("\n")
      .map(replaceLegacySeparatorsInsideTableCells)
      .join("\n");
    migrated = `${migrated.slice(0, range.start)}${nextTable}${migrated.slice(range.end)}`;
  }
  return migrated;
}

function replaceLegacySeparatorsInsideTableCells(line: string): string {
  if (!line.includes(LEGACY_TABLE_CELL_LINE_SEPARATOR)) return line;

  const quote = markdownQuotePrefix(line);
  const prefixLength = quote?.length ?? 0;
  const tableLine = line.slice(prefixLength);
  const pipes = unescapedPipeIndexes(tableLine).map((index) => index + prefixLength);
  if (!pipes.length) return line;

  const firstBoundary = tableLine.trimStart().startsWith("|") ? pipes[0] : prefixLength - 1;
  const lastBoundary = tableLine.trimEnd().endsWith("|") ? pipes[pipes.length - 1] : line.length;
  const from = firstBoundary + 1;
  const cellContent = line.slice(from, lastBoundary);
  return `${line.slice(0, from)}${replaceLegacySeparatorsOutsideInlineCode(cellContent)}${line.slice(lastBoundary)}`;
}

function tableRangeAtOffset(markdown: string, offset: number): TableSourceRange | null {
  const direct = findTableAtOffset(markdown, offset);
  if (direct && direct.position.row !== 1) {
    return { start: direct.startOffset, end: direct.endOffset };
  }
  return quotedTableRangeAtOffset(markdown, offset);
}

function quotedTableRangeAtOffset(markdown: string, offset: number): TableSourceRange | null {
  const lines = sourceLines(markdown);
  const targetLineIndex = lines.findIndex((line) => offset >= line.start && offset <= line.end);
  if (targetLineIndex < 0) return null;

  const targetLine = lines[targetLineIndex];
  const targetQuote = markdownQuotePrefix(targetLine.text);
  if (!targetQuote) return null;

  // Remove quote markers only for table recognition; source offsets stay tied to the original lines.
  const virtualLines = lines.map((line) => {
    const quote = markdownQuotePrefix(line.text);
    return quote ? line.text.slice(quote.length) : line.text;
  });
  const targetColumn = offset - targetLine.start - targetQuote.length;
  if (targetColumn < 0) return null;

  const virtualOffset = virtualLines
    .slice(0, targetLineIndex)
    .reduce((total, line) => total + line.length + 1, 0) + targetColumn;
  const table = findTableAtOffset(virtualLines.join("\n"), virtualOffset);
  if (!table || table.position.row === 1) return null;

  const tableLines = lines.slice(table.startLine, table.endLine + 1);
  if (
    !tableLines.length ||
    tableLines.some((line) => markdownQuotePrefix(line.text)?.depth !== targetQuote.depth)
  ) return null;

  const lastLine = tableLines[tableLines.length - 1];
  return {
    start: tableLines[0].start,
    end: lastLine.end < markdown.length ? lastLine.end + 1 : lastLine.end
  };
}

function sourceLines(markdown: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let start = 0;

  while (start <= markdown.length) {
    const nextBreak = markdown.indexOf("\n", start);
    const end = nextBreak === -1 ? markdown.length : nextBreak;
    lines.push({ start, end, text: markdown.slice(start, end) });
    if (nextBreak === -1) break;
    start = nextBreak + 1;
  }
  return lines;
}

function markdownQuotePrefix(line: string): QuotePrefix | null {
  const leadingIndent = line.match(/^ {0,3}/)?.[0].length ?? 0;
  let cursor = leadingIndent;
  let depth = 0;

  while (line[cursor] === ">") {
    cursor += 1;
    depth += 1;
    if (line[cursor] === " ") cursor += 1;

    let nestedSeparatorEnd = cursor;
    while (line[nestedSeparatorEnd] === " ") nestedSeparatorEnd += 1;
    if (nestedSeparatorEnd > cursor && line[nestedSeparatorEnd] === ">") {
      cursor = nestedSeparatorEnd;
    }
  }

  return depth ? { depth, length: cursor } : null;
}

function replaceLegacySeparatorsOutsideInlineCode(content: string): string {
  let result = "";
  let cursor = 0;

  while (cursor < content.length) {
    if (content[cursor] === "`") {
      const delimiterLength = consecutiveCharacterLength(content, cursor, "`");
      const closing = matchingCodeSpanDelimiter(content, cursor + delimiterLength, delimiterLength);
      if (closing !== -1) {
        result += content.slice(cursor, closing + delimiterLength);
        cursor = closing + delimiterLength;
        continue;
      }
    }

    if (
      content[cursor] === LEGACY_TABLE_CELL_LINE_SEPARATOR &&
      !isEscapedByOddBackslashes(content, cursor)
    ) {
      result += TABLE_CELL_LINE_SEPARATOR;
    } else {
      result += content[cursor];
    }
    cursor += 1;
  }

  return result;
}

function matchingCodeSpanDelimiter(content: string, from: number, delimiterLength: number): number {
  let cursor = from;
  while (cursor < content.length) {
    if (content[cursor] !== "`") {
      cursor += 1;
      continue;
    }
    const candidateLength = consecutiveCharacterLength(content, cursor, "`");
    if (candidateLength === delimiterLength) return cursor;
    cursor += candidateLength;
  }
  return -1;
}

function consecutiveCharacterLength(content: string, from: number, character: string): number {
  let length = 0;
  while (content[from + length] === character) length += 1;
  return length;
}

function isEscapedByOddBackslashes(content: string, index: number): boolean {
  let count = 0;
  for (let cursor = index - 1; cursor >= 0 && content[cursor] === "\\"; cursor -= 1) {
    count += 1;
  }
  return count % 2 === 1;
}
