import type { TextRange } from "./editorCommands";

export function normalizeTextRanges(ranges: readonly TextRange[], textLength: number): TextRange[] {
  const sortedRanges = ranges
    .map((range) => ({
      from: Math.max(0, Math.min(range.from, range.to, textLength)),
      to: Math.max(0, Math.min(Math.max(range.from, range.to), textLength))
    }))
    .filter((range) => range.to > range.from)
    .sort((left, right) => left.from - right.from || left.to - right.to);

  const mergedRanges: TextRange[] = [];
  for (const range of sortedRanges) {
    const previous = mergedRanges[mergedRanges.length - 1];
    if (previous && range.from <= previous.to) {
      previous.to = Math.max(previous.to, range.to);
      continue;
    }
    mergedRanges.push({ ...range });
  }

  return mergedRanges;
}
