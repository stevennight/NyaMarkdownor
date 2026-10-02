import type { MarkdownLexerConfiguration, MarkdownToken } from "@tiptap/core";
import { detectMarkerType, markerToStart, ORDERED_LIST_MARKER_PATTERN } from "@tiptap/extension-list";

// A copy of Tiptap's ordered-list tokenizer with one correction: an item's
// continuation lines are dedented to the item's content column, which counts
// the marker, its "." or ")" delimiter and the spaces after it. Tiptap 3.27
// leaves out the delimiter, so every continuation line and nested code block
// in an ordered item kept one extra leading space.

const ORDERED_LIST_ITEM_REGEX = new RegExp(`^(\\s*)(${ORDERED_LIST_MARKER_PATTERN})([.)])(\\s+)(.*)$`);
const ORDERED_LIST_LINE_START_REGEX = new RegExp(`^(\\s*)(${ORDERED_LIST_MARKER_PATTERN})([.)])\\s+`);
const INDENTED_LINE_REGEX = /^\s/;

const PARAGRAPH_INTERRUPTERS = {
  heading: /^#{1,6}(?:\s|$)/,
  bulletItem: /^[-+*]\s+/,
  codeFence: /^(?:```|~~~)/,
  thematicBreak: /^(?:(?:-[ \t]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})$/
};

type OrderedListItem = {
  indent: number;
  number: number;
  type?: string;
  contentLines: string[];
  raw: string;
};

function isOrderedListMarkerLine(line: string): boolean {
  return ORDERED_LIST_ITEM_REGEX.test(line.trimStart());
}

function isBlockContentLine(line: string): boolean {
  const trimmedLine = line.trimStart();
  return PARAGRAPH_INTERRUPTERS.bulletItem.test(trimmedLine)
    || isOrderedListMarkerLine(trimmedLine)
    || PARAGRAPH_INTERRUPTERS.heading.test(trimmedLine)
    || (PARAGRAPH_INTERRUPTERS.thematicBreak.test(trimmedLine) && !trimmedLine.startsWith("-"))
    || /^>\s?/.test(trimmedLine)
    || PARAGRAPH_INTERRUPTERS.codeFence.test(trimmedLine);
}

function interruptsLazyContinuation(line: string): boolean {
  return Object.values(PARAGRAPH_INTERRUPTERS).some((pattern) => pattern.test(line));
}

function splitItemContent(contentLines: string[]): { paragraphLines: string[]; blockLines: string[] } {
  const paragraphLines: string[] = [];
  const blockLines: string[] = [];
  let reachedBlockBoundary = false;

  contentLines.forEach((line) => {
    if (reachedBlockBoundary) {
      blockLines.push(line);
      return;
    }
    if (line.trim() === "" || (paragraphLines.length > 0 && isBlockContentLine(line))) {
      reachedBlockBoundary = true;
      blockLines.push(line);
      return;
    }
    paragraphLines.push(line);
  });

  return { paragraphLines, blockLines };
}

export function orderedListContentIndent(indent: string, marker: string, spacing: string): number {
  // CommonMark: one to four spaces after the delimiter belong to the marker;
  // five or more means the content is an indented code block after one space.
  const spaces = spacing.length >= 5 ? 1 : spacing.length;
  return indent.length + marker.length + 1 + spaces;
}

function collectOrderedListItems(lines: string[]): [OrderedListItem[], number] {
  const listItems: OrderedListItem[] = [];
  let currentLineIndex = 0;
  let consumed = 0;

  while (currentLineIndex < lines.length) {
    const line = lines[currentLineIndex];
    const match = line.match(ORDERED_LIST_ITEM_REGEX);
    if (!match) break;

    const [, indent, marker, , spacing, content] = match;
    const number = parseInt(marker, 10);
    const markerType = Number.isNaN(number) ? detectMarkerType(marker) : undefined;
    const itemNumber = Number.isNaN(number) ? markerToStart(marker) : number;
    const contentIndent = orderedListContentIndent(indent, marker, spacing);

    const itemContentLines = [content];
    const itemLines = [line];
    let nextLineIndex = currentLineIndex + 1;
    let sawBlankLine = false;

    while (nextLineIndex < lines.length) {
      const nextLine = lines[nextLineIndex];
      if (ORDERED_LIST_ITEM_REGEX.test(nextLine)) break;

      if (nextLine.trim() === "") {
        itemLines.push(nextLine);
        itemContentLines.push("");
        sawBlankLine = true;
      } else if (INDENTED_LINE_REGEX.test(nextLine)) {
        const leadingWhitespace = nextLine.length - nextLine.trimStart().length;
        itemLines.push(nextLine);
        itemContentLines.push(nextLine.slice(Math.min(leadingWhitespace, contentIndent)));
      } else {
        if (sawBlankLine || interruptsLazyContinuation(nextLine)) break;
        itemLines.push(nextLine);
        itemContentLines.push(nextLine);
      }
      nextLineIndex += 1;
    }

    listItems.push({
      indent: indent.length,
      number: itemNumber,
      type: markerType,
      contentLines: itemContentLines,
      raw: itemLines.join("\n")
    });

    consumed = nextLineIndex;
    currentLineIndex = nextLineIndex;
  }

  return [listItems, consumed];
}

function buildNestedStructure(items: OrderedListItem[], baseIndent: number, lexer: MarkdownLexerConfiguration): unknown[] {
  const result: unknown[] = [];
  let currentIndex = 0;

  while (currentIndex < items.length) {
    const item = items[currentIndex];
    if (item.indent !== baseIndent) {
      currentIndex += 1;
      continue;
    }

    const { paragraphLines, blockLines } = splitItemContent(item.contentLines);
    const mainText = paragraphLines.join("\n").trim();
    const tokens: unknown[] = [];

    if (mainText) {
      tokens.push({ type: "paragraph", raw: mainText, tokens: lexer.inlineTokens(mainText) });
    }

    const additionalContent = trimBlankLines(blockLines.join("\n"));
    if (additionalContent) tokens.push(...lexer.blockTokens(additionalContent));

    let lookAheadIndex = currentIndex + 1;
    const nestedItems: OrderedListItem[] = [];
    while (lookAheadIndex < items.length && items[lookAheadIndex].indent > baseIndent) {
      nestedItems.push(items[lookAheadIndex]);
      lookAheadIndex += 1;
    }

    if (nestedItems.length > 0) {
      const nextIndent = Math.min(...nestedItems.map((nestedItem) => nestedItem.indent));
      tokens.push({
        type: "list",
        ordered: true,
        start: nestedItems[0].number,
        typeMarker: nestedItems[0].type,
        items: buildNestedStructure(nestedItems, nextIndent, lexer),
        raw: nestedItems.map((nestedItem) => nestedItem.raw).join("\n")
      });
    }

    result.push({ type: "list_item", raw: item.raw, tokens });
    currentIndex = lookAheadIndex;
  }

  return result;
}

// Only blank lines are trimmed: the indentation of the first block line is
// meaningful (an indented code block or an over-indented fence).
function trimBlankLines(value: string): string {
  return value.replace(/^(?:[ \t]*\n)+/, "").replace(/(?:\n[ \t]*)+$/, "");
}

export const orderedListMarkdownTokenizer = {
  name: "orderedList",
  level: "block" as const,
  start: (src: string) => {
    const index = src.match(ORDERED_LIST_LINE_START_REGEX)?.index;
    return index !== undefined ? index : -1;
  },
  tokenize: (src: string, _tokens: MarkdownToken[], lexer: MarkdownLexerConfiguration) => {
    const lines = src.split("\n");
    const [listItems, consumed] = collectOrderedListItems(lines);
    if (listItems.length === 0) return undefined;

    const items = buildNestedStructure(listItems, listItems[0].indent, lexer);
    if (items.length === 0) return undefined;

    return {
      type: "list",
      ordered: true,
      start: listItems[0]?.number || 1,
      typeMarker: listItems[0]?.type,
      items,
      raw: lines.slice(0, consumed).join("\n")
    } as unknown as MarkdownToken;
  }
};
