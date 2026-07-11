import { EditorState, RangeSetBuilder } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { findInlineMarkdownLinks, findMarkdownAutolinks } from "../lib/inlineMarkdown";
import { intersectsNonEmptySelection } from "../lib/selectionRanges";
import { findTableAtOffset } from "../lib/tables";

const syntaxMark = Decoration.mark({ class: "cm-md-mark" });
const tableMark = Decoration.mark({ class: "cm-md-table-mark" });
const selectedSyntaxMark = Decoration.mark({ class: "cm-md-mark cm-md-mark-in-selection" });
const selectedTableMark = Decoration.mark({ class: "cm-md-table-mark cm-md-table-mark-in-selection" });

type RangeKind = "syntax" | "table";

type Range = {
  from: number;
  to: number;
  decoration: Decoration;
  selectedDecoration: Decoration;
  kind: RangeKind;
};

export type MarkdownSyntaxRange = {
  from: number;
  to: number;
  kind: RangeKind;
};

export const markdownSyntaxMarks = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (value) => value.decorations
  }
);

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const selections = view.state.selection.ranges;
  const tableRanges: TableSourceRange[] = [];
  let tableMarkdown: string | null = null;

  for (const { from, to } of view.visibleRanges) {
    let position = from;
    while (position <= to) {
      const line = view.state.doc.lineAt(position);
      const isCodeLine = isMarkdownCodeTextLine(view.state, line.from, line.to);
      const hasTableCandidate = line.text.includes("|");
      const ranges = isCodeLine
        ? []
        : collectLineRanges(
            line.text,
            line.from,
            hasTableCandidate && isMarkdownTableLineWithCache(
              line.text,
              line.from,
              tableMarkdown ?? (tableMarkdown = view.state.doc.toString()),
              tableRanges
            )
          );
      for (const range of ranges) {
        const decoration = intersectsNonEmptySelection(range.from, range.to, selections)
          ? range.selectedDecoration
          : range.decoration;
        builder.add(range.from, range.to, decoration);
      }
      if (line.to >= to) break;
      position = line.to + 1;
    }
  }

  return builder.finish();
}

type TableSourceRange = {
  from: number;
  to: number;
};

function isMarkdownTableLineWithCache(
  lineText: string,
  from: number,
  markdown: string,
  tableRanges: TableSourceRange[]
): boolean {
  if (!lineText.includes("|")) return false;
  if (tableRanges.some((range) => from >= range.from && from < range.to)) return true;

  const table = findTableAtOffset(markdown, from, {
    assumeNonCodeLine: true,
    deferLineNumberCalculation: true
  });
  if (!table) return false;

  tableRanges.push({ from: table.startOffset, to: table.endOffset });
  return true;
}

export function markdownSyntaxRangesForLine(text: string, offset = 0): MarkdownSyntaxRange[] {
  return collectLineRanges(text, offset, false).map(({ from, to, kind }) => ({ from, to, kind }));
}

export function isMarkdownCodeTextLine(state: EditorState, from: number, to: number): boolean {
  const docLength = state.doc.length;
  const lineFrom = Math.max(0, Math.min(from, docLength));
  const lineTo = Math.max(lineFrom, Math.min(to, docLength));
  const probes = lineFrom === lineTo
    ? [lineFrom]
    : [lineFrom, Math.max(lineFrom, lineTo - 1)];

  return probes.some((position) => isMarkdownCodeTextPosition(state, position));
}

export function isMarkdownTableLine(state: EditorState, from: number, to: number, markdown = state.doc.toString()): boolean {
  const docLength = state.doc.length;
  const lineFrom = Math.max(0, Math.min(from, docLength));
  const lineTo = Math.max(lineFrom, Math.min(to, docLength));
  const lineText = state.sliceDoc(lineFrom, lineTo);
  if (!lineText.includes("|") || isMarkdownCodeTextLine(state, lineFrom, lineTo)) return false;

  return Boolean(findTableAtOffset(markdown, lineFrom));
}

function collectLineRanges(text: string, offset: number, tableLine: boolean): Range[] {
  const ranges: Range[] = [];
  const inlineCodeContentRanges = collectInlineCodeContentRanges(text, offset);

  addMatch(ranges, text, /^(#{1,6})(?=\s)/g, offset, syntaxMark, selectedSyntaxMark);
  addMatch(ranges, text, /^(\s{0,3}>+\s?)/g, offset, syntaxMark, selectedSyntaxMark);
  addMatch(ranges, text, /^(\s*)([-*+]|\d+[.)])(?=\s+)/g, offset, syntaxMark, selectedSyntaxMark, 2);
  addTaskMarkerRanges(ranges, text, offset);
  addInlineLinkSyntaxRanges(ranges, text, offset);
  addAutolinkSyntaxRanges(ranges, text, offset);
  addReferenceStyleLinkSyntaxRanges(ranges, text, offset);
  addMatch(ranges, text, /(`+)/g, offset, syntaxMark, selectedSyntaxMark);
  addStrikethroughRanges(ranges, text, offset);
  addAsteriskEmphasisRanges(ranges, text, offset);
  addUnderscoreEmphasisRanges(ranges, text, offset);

  if (tableLine) {
    addMatch(ranges, text, /\|/g, offset, tableMark, selectedTableMark, 0, "table");
  }

  return ranges
    .filter((range) => range.to > range.from)
    .filter((range) => !inlineCodeContentRanges.some((codeRange) => rangesOverlap(range.from, range.to, codeRange.from, codeRange.to)))
    .sort((a, b) => a.from - b.from || b.to - a.to)
    .filter((range, index, sorted) => index === 0 || range.from >= sorted[index - 1].to);
}

function addTaskMarkerRanges(ranges: Range[], text: string, offset: number): void {
  const match = text.match(/^(?:\s{0,3}>+\s?)*\s{0,3}(?:[-*+]|\d+[.)])\s+(\[[ xX]\])(?=\s+)/);
  if (!match || match.index === undefined) return;

  const marker = match[1];
  const markerFrom = match[0].lastIndexOf(marker);
  if (markerFrom < 0) return;

  addSyntaxRange(ranges, offset + markerFrom, offset + markerFrom + marker.length);
}

function addInlineLinkSyntaxRanges(ranges: Range[], text: string, offset: number): void {
  for (const link of findInlineMarkdownLinks(text)) {
    ranges.push({
      from: offset + link.from,
      to: offset + link.labelFrom,
      decoration: syntaxMark,
      selectedDecoration: selectedSyntaxMark,
      kind: "syntax"
    });
    ranges.push({
      from: offset + link.labelTo,
      to: offset + link.destinationFrom,
      decoration: syntaxMark,
      selectedDecoration: selectedSyntaxMark,
      kind: "syntax"
    });
    ranges.push({
      from: offset + link.destinationFrom,
      to: offset + link.destinationTo,
      decoration: syntaxMark,
      selectedDecoration: selectedSyntaxMark,
      kind: "syntax"
    });
    ranges.push({
      from: offset + link.destinationTo,
      to: offset + link.to,
      decoration: syntaxMark,
      selectedDecoration: selectedSyntaxMark,
      kind: "syntax"
    });
  }
}

function addAutolinkSyntaxRanges(ranges: Range[], text: string, offset: number): void {
  for (const link of findMarkdownAutolinks(text)) {
    addSyntaxRange(ranges, offset + link.from, offset + link.labelFrom);
    addSyntaxRange(ranges, offset + link.labelTo, offset + link.to);
  }
}

function addReferenceStyleLinkSyntaxRanges(ranges: Range[], text: string, offset: number): void {
  const regexp = /(!?\[)([^\]\n]+)(\]\[[^\]\n]*\])/g;

  for (const match of text.matchAll(regexp)) {
    if (match.index === undefined) continue;

    const opener = match[1] ?? "";
    const label = match[2] ?? "";
    const trailer = match[3] ?? "";
    if (!opener || !label || !trailer) continue;

    const from = offset + match.index;
    addSyntaxRange(ranges, from, from + opener.length);
    addSyntaxRange(ranges, from + opener.length + label.length, from + opener.length + label.length + trailer.length);
  }
}

function addAsteriskEmphasisRanges(ranges: Range[], text: string, offset: number): void {
  addPairedEmphasisRanges(ranges, text, offset, "*", false);
}

function addUnderscoreEmphasisRanges(ranges: Range[], text: string, offset: number): void {
  addPairedEmphasisRanges(ranges, text, offset, "_", true);
}

function addStrikethroughRanges(ranges: Range[], text: string, offset: number): void {
  let opener: number | null = null;

  for (let index = 0; index < text.length - 1; index += 1) {
    if (text.slice(index, index + 2) !== "~~" || isEscapedByOddBackslashes(text, index)) continue;

    const delimiter = emphasisDelimiterKind(text, index, 2, false);
    if (delimiter.closing && opener !== null) {
      addSyntaxRange(ranges, offset + opener, offset + opener + 2);
      addSyntaxRange(ranges, offset + index, offset + index + 2);
      opener = null;
    } else if (delimiter.opening) {
      opener = index;
    }

    index += 1;
  }
}

function addPairedEmphasisRanges(
  ranges: Range[],
  text: string,
  offset: number,
  marker: "*" | "_",
  blockIntraword: boolean
): void {
  const openers = new Map<number, number[]>();

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== marker || isEscapedByOddBackslashes(text, index)) continue;

    const length = delimiterRunLength(text, index, marker);
    const markerLength = length;
    const delimiter = emphasisDelimiterKind(text, index, markerLength, blockIntraword);

    if (delimiter.closing) {
      const stack = openers.get(markerLength);
      const opener = stack?.pop();
      if (opener !== undefined) {
        addSyntaxRange(ranges, offset + opener, offset + opener + markerLength);
        addSyntaxRange(ranges, offset + index, offset + index + markerLength);
      }
    }

    if (delimiter.opening) {
      const stack = openers.get(markerLength) ?? [];
      stack.push(index);
      openers.set(markerLength, stack);
    }

    index += length - 1;
  }
}

function addSyntaxRange(ranges: Range[], from: number, to: number): void {
  ranges.push({
    from,
    to,
    decoration: syntaxMark,
    selectedDecoration: selectedSyntaxMark,
    kind: "syntax"
  });
}

function delimiterRunLength(text: string, index: number, marker: "*" | "_"): number {
  let length = 0;
  while (text[index + length] === marker) length += 1;
  return length;
}

function emphasisDelimiterKind(
  text: string,
  index: number,
  length: number,
  blockIntraword: boolean
): { opening: boolean; closing: boolean } {
  const before = index > 0 ? text[index - 1] : "";
  const after = text[index + length] ?? "";
  const beforeWord = isWordCharacter(before);
  const afterWord = isWordCharacter(after);
  const beforeWhitespace = !before || /\s/.test(before);
  const afterWhitespace = !after || /\s/.test(after);

  return {
    opening: !afterWhitespace && (!blockIntraword || !beforeWord),
    closing: !beforeWhitespace && (!blockIntraword || !afterWord)
  };
}

function addMatch(
  ranges: Range[],
  text: string,
  regexp: RegExp,
  offset: number,
  decoration: Decoration,
  selectedDecoration: Decoration,
  group = 0,
  kind: RangeKind = "syntax"
): void {
  regexp.lastIndex = 0;

  for (const match of text.matchAll(regexp)) {
    const value = match[group];
    if (!value || match.index === undefined) continue;

    const groupStart = group === 0
      ? match.index
      : match.index + match[0].indexOf(value);

    ranges.push({
      from: offset + groupStart,
      to: offset + groupStart + value.length,
      decoration,
      selectedDecoration,
      kind
    });
  }
}

function isEscapedByOddBackslashes(text: string, index: number): boolean {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

function isWordCharacter(char: string): boolean {
  return Boolean(char && /[\p{L}\p{N}_]/u.test(char));
}

function collectInlineCodeContentRanges(text: string, offset: number): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = [];

  for (const match of text.matchAll(/(`+)([\s\S]*?)\1/g)) {
    if (match.index === undefined) continue;

    const ticks = match[1] ?? "";
    const from = offset + match.index + ticks.length;
    const to = offset + match.index + match[0].length - ticks.length;
    if (to > from) ranges.push({ from, to });
  }

  return ranges;
}

function rangesOverlap(leftFrom: number, leftTo: number, rightFrom: number, rightTo: number): boolean {
  return leftFrom < rightTo && leftTo > rightFrom;
}

function isMarkdownCodeTextPosition(state: EditorState, position: number): boolean {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(position, 1);
  let sawCodeText = false;

  while (node) {
    if (node.name === "CodeText") sawCodeText = true;
    if (node.name === "FencedCode" || node.name === "CodeBlock") return sawCodeText;
    node = node.parent;
  }

  return false;
}
