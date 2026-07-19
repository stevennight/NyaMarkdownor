import type { TextRange } from "./editorCommands";

export type SearchOptions = {
  caseSensitive: boolean;
  wholeWord: boolean;
};

export type SearchDirection = "next" | "previous";

export type SearchMatch = TextRange;

export function findTextMatches(text: string, query: string, options: SearchOptions, limit = 10000): SearchMatch[] {
  if (!query || limit <= 0) return [];

  const matcher = new RegExp(escapeRegularExpression(query), options.caseSensitive ? "gu" : "giu");
  const matches: SearchMatch[] = [];

  for (const result of text.matchAll(matcher)) {
    if (matches.length >= limit) break;
    const from = result.index;
    const match = { from, to: from + result[0].length };
    if (!options.wholeWord || isWholeWordMatch(text, match)) {
      matches.push(match);
    }
  }

  return matches;
}

export function findMatchIndexAtSelection(matches: readonly SearchMatch[], selection: TextRange): number {
  const from = Math.min(selection.from, selection.to);
  const to = Math.max(selection.from, selection.to);
  return matches.findIndex((match) => match.from === from && match.to === to);
}

export function findNextMatchIndex(matches: readonly SearchMatch[], position: number, direction: SearchDirection): number {
  if (!matches.length) return -1;

  if (direction === "next") {
    const next = matches.findIndex((match) => match.from >= position);
    return next === -1 ? 0 : next;
  }

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    if (matches[index].to <= position) return index;
  }

  return matches.length - 1;
}

export function replaceTextRange(text: string, range: TextRange, replacement: string): string {
  const from = Math.min(range.from, range.to);
  const to = Math.max(range.from, range.to);
  return text.slice(0, from) + replacement + text.slice(to);
}

export function replaceAllText(text: string, query: string, replacement: string, options: SearchOptions): { text: string; count: number } {
  const matches = findTextMatches(text, query, options, Number.POSITIVE_INFINITY);
  if (!matches.length) return { text, count: 0 };

  let next = text;
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    next = replaceTextRange(next, matches[index], replacement);
  }

  return { text: next, count: matches.length };
}

export function getSelectionAfterReplace(
  text: string,
  query: string,
  replacement: string,
  replacedRange: TextRange,
  options: SearchOptions
): TextRange {
  const nextText = replaceTextRange(text, replacedRange, replacement);
  const cursor = Math.min(nextText.length, Math.min(replacedRange.from, replacedRange.to) + replacement.length);
  const matches = findTextMatches(nextText, query, options);
  if (!matches.length) return { from: cursor, to: cursor };

  return matches[findNextMatchIndex(matches, cursor, "next")];
}

function isWholeWordMatch(text: string, match: SearchMatch): boolean {
  return !isWordChar(text[match.from - 1]) && !isWordChar(text[match.to]);
}

function isWordChar(char: string | undefined): boolean {
  return Boolean(char && /[\p{L}\p{N}_]/u.test(char));
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
