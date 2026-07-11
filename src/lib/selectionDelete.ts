import type { TextRange } from "./editorCommands";
import { normalizeTextRanges } from "./textRanges";

export type SelectionDeletion = {
  ranges: TextRange[];
  markdown: string;
  selection: TextRange;
};

export function deleteSelectionRanges(markdown: string, ranges: readonly TextRange[]): SelectionDeletion | null {
  const normalizedRanges = normalizeTextRanges(ranges, markdown.length);
  if (!normalizedRanges.length) return null;

  let cursor = 0;
  let nextMarkdown = "";
  for (const range of normalizedRanges) {
    nextMarkdown += markdown.slice(cursor, range.from);
    cursor = range.to;
  }
  nextMarkdown += markdown.slice(cursor);

  const caret = Math.min(normalizedRanges[0].from, nextMarkdown.length);
  return {
    ranges: normalizedRanges,
    markdown: nextMarkdown,
    selection: { from: caret, to: caret }
  };
}
