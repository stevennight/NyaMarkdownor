import type { TableBlock } from "../types";
import type { TextRange } from "./editorCommands";
import { findTableAtOffset } from "./tables";

export function tableBlockForSelectionRanges(markdown: string, ranges: readonly TextRange[]): TableBlock | null {
  const selections = ranges
    .map((range) => normalizeRange(range, markdown.length))
    .filter((range) => range.to > range.from)
    .sort((left, right) => left.from - right.from || left.to - right.to);
  if (!selections.length) return null;

  let tableBlock: TableBlock | null = null;

  for (const selection of selections) {
    for (const offset of candidateTableOffsets(markdown, selection)) {
      const candidate = findTableAtOffset(markdown, offset);
      if (!candidate) continue;
      if (tableBlock && (tableBlock.startOffset !== candidate.startOffset || tableBlock.endOffset !== candidate.endOffset)) {
        return null;
      }
      tableBlock = candidate;
      break;
    }
  }

  if (!tableBlock) return null;
  return selections.every((selection) => selectionCanClampToTable(markdown, selection, tableBlock))
    ? tableBlock
    : null;
}

export function clampSelectionRangesToTableBlock(ranges: readonly TextRange[], tableBlock: TableBlock): TextRange[] {
  return ranges
    .map((range) => clampSelectionRangeToTableBlock(range, tableBlock))
    .filter((range): range is TextRange => Boolean(range && range.to > range.from));
}

export function clampSelectionRangeToTableBlock(selection: TextRange, tableBlock: TableBlock): TextRange | null {
  const from = Math.max(selection.from, tableBlock.startOffset);
  const to = Math.min(selection.to, tableBlock.endOffset);
  return to > from ? { from, to } : null;
}

function normalizeRange(range: TextRange, markdownLength: number): TextRange {
  const from = Math.max(0, Math.min(range.from, range.to, markdownLength));
  const to = Math.max(0, Math.min(Math.max(range.from, range.to), markdownLength));
  return { from, to };
}

function candidateTableOffsets(markdown: string, selection: TextRange): number[] {
  const offsets = new Set<number>();

  if (selection.from < markdown.length) offsets.add(selection.from);
  if (selection.to > 0) offsets.add(selection.to - 1);

  const firstNonWhitespace = firstNonWhitespaceOffset(markdown, selection.from, selection.to);
  if (firstNonWhitespace !== null) offsets.add(firstNonWhitespace);

  const lastNonWhitespace = lastNonWhitespaceOffset(markdown, selection.from, selection.to);
  if (lastNonWhitespace !== null) offsets.add(lastNonWhitespace);

  return [...offsets];
}

function selectionCanClampToTable(markdown: string, selection: TextRange, tableBlock: TableBlock): boolean {
  if (selection.to <= tableBlock.startOffset) {
    return isWhitespaceText(markdown.slice(selection.from, tableBlock.startOffset));
  }

  if (selection.from >= tableBlock.endOffset) {
    return isWhitespaceText(markdown.slice(tableBlock.endOffset, selection.to));
  }

  const beforeTable = selection.from < tableBlock.startOffset
    ? markdown.slice(selection.from, tableBlock.startOffset)
    : "";
  const afterTable = selection.to > tableBlock.endOffset
    ? markdown.slice(tableBlock.endOffset, selection.to)
    : "";

  return isWhitespaceText(beforeTable) && isWhitespaceText(afterTable);
}

function firstNonWhitespaceOffset(markdown: string, from: number, to: number): number | null {
  for (let offset = from; offset < to; offset += 1) {
    if (!/\s/.test(markdown[offset])) return offset;
  }
  return null;
}

function lastNonWhitespaceOffset(markdown: string, from: number, to: number): number | null {
  for (let offset = to - 1; offset >= from; offset -= 1) {
    if (!/\s/.test(markdown[offset])) return offset;
  }
  return null;
}

function isWhitespaceText(text: string): boolean {
  return !/[^\s]/.test(text);
}
