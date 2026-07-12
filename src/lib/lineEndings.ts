import type { MarkdownLineEnding } from "../types";
import { migrateLegacyTableCellBreaks } from "./legacyTableCellBreaks";

export type NormalizedMarkdownText = {
  markdown: string;
  lineEnding: MarkdownLineEnding;
};

export type NormalizeMarkdownTextOptions = {
  migrateLegacyTableCellBreaks?: boolean;
};

export function isMarkdownLineEnding(value: unknown): value is MarkdownLineEnding {
  return value === "lf" || value === "crlf";
}

export function detectMarkdownLineEnding(markdown: string): MarkdownLineEnding {
  let crlfCount = 0;
  let lfCount = 0;
  let first: MarkdownLineEnding | null = null;

  for (let index = 0; index < markdown.length; index += 1) {
    const code = markdown.charCodeAt(index);
    if (code === 13) {
      if (markdown.charCodeAt(index + 1) === 10) {
        crlfCount += 1;
        first ??= "crlf";
        index += 1;
      } else {
        lfCount += 1;
        first ??= "lf";
      }
      continue;
    }

    if (code === 10) {
      lfCount += 1;
      first ??= "lf";
    }
  }

  if (crlfCount === lfCount) return first ?? "lf";
  return crlfCount > lfCount ? "crlf" : "lf";
}

export function normalizeMarkdownLineEndings(markdown: string): string {
  return markdown.includes("\r") ? markdown.replace(/\r\n?/g, "\n") : markdown;
}

export function normalizeMarkdownText(
  markdown: string,
  options: NormalizeMarkdownTextOptions = {}
): NormalizedMarkdownText {
  const normalized = normalizeMarkdownLineEndings(markdown);
  return {
    markdown: options.migrateLegacyTableCellBreaks ? migrateLegacyTableCellBreaks(normalized) : normalized,
    lineEnding: detectMarkdownLineEnding(markdown)
  };
}

export function markdownWithLineEnding(markdown: string, lineEnding: MarkdownLineEnding): string {
  const normalized = normalizeMarkdownLineEndings(markdown);
  return lineEnding === "crlf" ? normalized.replace(/\n/g, "\r\n") : normalized;
}
