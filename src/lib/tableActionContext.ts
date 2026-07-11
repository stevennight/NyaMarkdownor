import type { TableBlock } from "../types";
import type { TextRange } from "./editorCommands";
import { findTableAtOffset } from "./tables";

export type TableActionContext = {
  source: string;
  primary: TextRange;
  table: TableBlock;
};

export function tableActionContextFromSelection(
  source: string,
  primary: TextRange,
  fallbackTable?: TableBlock | null
): TableActionContext | null {
  const table = tableAtSelection(source, primary) ?? tableAtFallback(source, fallbackTable);
  return table ? { source, primary, table } : null;
}

function tableAtSelection(source: string, primary: TextRange): TableBlock | null {
  const from = clampOffset(primary.from, source.length);
  const to = clampOffset(primary.to, source.length);

  return findTableAtOffset(source, from)
    ?? (to > 0 ? findTableAtOffset(source, to - 1) : null)
    ?? null;
}

function tableAtFallback(source: string, fallbackTable?: TableBlock | null): TableBlock | null {
  if (!fallbackTable) return null;

  return findTableAtOffset(source, clampOffset(fallbackTable.startOffset, source.length))
    ?? findTableAtOffset(source, clampOffset(Math.max(0, fallbackTable.endOffset - 1), source.length))
    ?? null;
}

function clampOffset(offset: number, length: number): number {
  if (!Number.isFinite(offset)) return 0;
  return Math.max(0, Math.min(length, offset));
}
