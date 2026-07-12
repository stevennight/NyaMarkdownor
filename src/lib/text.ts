import { replaceInlineMarkdownLinksWithLabels, replaceMarkdownAutolinksWithLabels, replaceShortcutReferenceLinksWithLabels } from "./inlineMarkdown";

export function visualWidth(text: string): number {
  const segments = graphemeSegments(text);
  let width = 0;
  for (const segment of segments) {
    width += visualSegmentWidth(segment);
  }
  return width;
}

export function padVisual(text: string, width: number): string {
  return text + " ".repeat(Math.max(0, width - visualWidth(text)));
}

export function offsetAtLine(text: string, lineNumber: number): number {
  if (lineNumber <= 0) return 0;

  let line = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") {
      line += 1;
      if (line === lineNumber) return index + 1;
    }
  }

  return text.length;
}

export function cursorPosition(text: string, offset: number): { line: number; col: number } {
  let line = 0;
  let lastBreak = -1;

  for (let index = 0; index < offset; index += 1) {
    if (text[index] === "\n") {
      line += 1;
      lastBreak = index;
    }
  }

  return { line, col: offset - lastBreak - 1 };
}

export type StripInlineMarkdownOptions = {
  referenceLabels?: ReadonlySet<string>;
};

const TABLE_CELL_LINE_BREAK_PLACEHOLDER = "\uE000NMD_TABLE_CELL_BREAK\uE001";

export function stripInlineMarkdown(text: string, options: StripInlineMarkdownOptions = {}): string {
  const code = protectInlineCode(text);
  const stripped = replaceShortcutReferenceLinksWithLabels(replaceMarkdownAutolinksWithLabels(replaceInlineMarkdownLinksWithLabels(code.text)), options.referenceLabels)
    .replace(/!\[([^\]]*)\]\[[^\]]*\]/g, "$1")
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
    .replace(/(^|[^\w])(\*\*|__)(?=\S)(.*?\S)\2(?=$|[^\w])/g, "$1$3")
    .replace(/(^|[^\w])(\*|_)(?=\S)(.*?\S)\2(?=$|[^\w])/g, "$1$3")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/\\([\\`*{}\[\]()#+\-.!|_<>])/g, "$1");

  return restoreInlineCode(stripped, code.values);
}

export function stripTableCellMarkdown(text: string, lineBreakMode: "space" | "newline" = "space", options: StripInlineMarkdownOptions = {}): string {
  return restoreTableCellLineBreaks(
    stripInlineMarkdown(protectTableCellLineBreaks(text), options),
    lineBreakMode === "newline" ? "\n" : " "
  );
}

export function protectTableCellLineBreaks(text: string): string {
  let result = "";
  let cursor = 0;

  while (cursor < text.length) {
    if (text[cursor] === "`") {
      const delimiterLength = consecutiveCharacterLength(text, cursor, "`");
      const closing = matchingCodeSpanDelimiter(text, cursor + delimiterLength, delimiterLength);
      if (closing !== -1) {
        result += text.slice(cursor, closing + delimiterLength);
        cursor = closing + delimiterLength;
        continue;
      }
    }

    const lineBreak = !isEscapedByOddBackslashes(text, cursor)
      ? text.slice(cursor).match(/^<br[ \t]*\/?>/i)
      : null;
    if (lineBreak) {
      result += TABLE_CELL_LINE_BREAK_PLACEHOLDER;
      cursor += lineBreak[0].length;
      continue;
    }

    result += text[cursor];
    cursor += 1;
  }

  return result;
}

export function restoreTableCellLineBreaks(text: string, replacement: string): string {
  return text.replaceAll(TABLE_CELL_LINE_BREAK_PLACEHOLDER, replacement);
}

function protectInlineCode(text: string): { text: string; values: string[] } {
  const values: string[] = [];
  return {
    text: text.replace(/(`+)([\s\S]*?)\1/g, (_match, _ticks: string, content: string) => {
      const index = values.push(normalizeInlineCodeText(content)) - 1;
      return `\u0000NYA_CODE_${index}\u0000`;
    }),
    values
  };
}

function restoreInlineCode(text: string, values: string[]): string {
  return text.replace(/\u0000NYA_CODE_(\d+)\u0000/g, (_match, index: string) => values[Number(index)] ?? "");
}

function normalizeInlineCodeText(text: string): string {
  const normalized = text.replace(/\r\n?|\n/g, " ");
  return /^ .*\S.* $/.test(normalized) ? normalized.slice(1, -1) : normalized;
}

function matchingCodeSpanDelimiter(text: string, from: number, delimiterLength: number): number {
  let cursor = from;
  while (cursor < text.length) {
    if (text[cursor] !== "`") {
      cursor += 1;
      continue;
    }
    const candidateLength = consecutiveCharacterLength(text, cursor, "`");
    if (candidateLength === delimiterLength) return cursor;
    cursor += candidateLength;
  }
  return -1;
}

function consecutiveCharacterLength(text: string, from: number, character: string): number {
  let length = 0;
  while (text[from + length] === character) length += 1;
  return length;
}

function isEscapedByOddBackslashes(text: string, index: number): boolean {
  let count = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
    count += 1;
  }
  return count % 2 === 1;
}

type GraphemeSegmenter = {
  segment(text: string): Iterable<{ segment: string }>;
};

const segmenter = createGraphemeSegmenter();
const wideCharPattern = /[\u1100-\u115f\u2329\u232a\u2e80-\ua4cf\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6]/u;
const zeroWidthCharPattern = /[\u0300-\u036f\u0483-\u0489\u0591-\u05bd\u05bf\u05c1-\u05c2\u05c4-\u05c5\u05c7\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06dc\u06df-\u06e4\u06e7-\u06e8\u06ea-\u06ed\u0711\u0730-\u074a\u07a6-\u07b0\u07eb-\u07f3\u0816-\u0819\u081b-\u0823\u0825-\u0827\u0829-\u082d\u0859-\u085b\u08d3-\u08e1\u08e3-\u0903\u093a\u093c\u0941-\u0948\u094d\u0951-\u0957\u0962-\u0963\u0981\u09bc\u09c1-\u09c4\u09cd\u09e2-\u09e3\u0a01-\u0a02\u0a3c\u0a41-\u0a42\u0a47-\u0a48\u0a4b-\u0a4d\u0a51\u0a70-\u0a71\u0a75\u0a81-\u0a82\u0abc\u0ac1-\u0ac5\u0ac7-\u0ac8\u0acd\u0ae2-\u0ae3\u0b01\u0b3c\u0b3f\u0b41-\u0b44\u0b4d\u0b56\u0b62-\u0b63\u0b82\u0bc0\u0bcd\u0c00\u0c04\u0c3c\u0c3e-\u0c40\u0c46-\u0c48\u0c4a-\u0c4d\u0c55-\u0c56\u0c62-\u0c63\u0c81\u0cbc\u0cbf\u0cc6\u0ccc-\u0ccd\u0ce2-\u0ce3\u0d00-\u0d01\u0d3b-\u0d3c\u0d41-\u0d44\u0d4d\u0d62-\u0d63\u0d81\u0dca\u0dd2-\u0dd4\u0dd6\u0e31\u0e34-\u0e3a\u0e47-\u0e4e\u0eb1\u0eb4-\u0ebc\u0ec8-\u0ece\u0f18-\u0f19\u0f35\u0f37\u0f39\u0f71-\u0f7e\u0f80-\u0f84\u0f86-\u0f87\u0f8d-\u0f97\u0f99-\u0fbc\u0fc6\ufe00-\ufe0f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/u;
const emojiPattern = /\p{Extended_Pictographic}/u;

function graphemeSegments(text: string): string[] {
  if (!segmenter) return Array.from(text);
  return Array.from(segmenter.segment(text), (part) => part.segment);
}

function visualSegmentWidth(segment: string): number {
  if (!segment) return 0;
  if (emojiPattern.test(segment)) return 2;

  let width = 0;
  for (const char of segment) {
    if (zeroWidthCharPattern.test(char)) continue;
    width += wideCharPattern.test(char) ? 2 : 1;
  }
  return width;
}

function createGraphemeSegmenter(): GraphemeSegmenter | null {
  const Segmenter = (Intl as unknown as {
    Segmenter?: new (locale: string | undefined, options: { granularity: "grapheme" }) => GraphemeSegmenter;
  }).Segmenter;

  return Segmenter ? new Segmenter(undefined, { granularity: "grapheme" }) : null;
}
