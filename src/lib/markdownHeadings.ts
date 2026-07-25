import type { Heading } from "../types";
import { slugifyHeadingText } from "./headingIds";
import { splitMarkdownFrontMatter } from "./markdownFrontMatter";
import { unescapedPipeIndexes } from "./tableSourceRanges";
import { stripInlineMarkdown } from "./text";

type CodeFence = {
  char: "`" | "~";
  length: number;
};

export function extractHeadings(markdown: string): Heading[] {
  const used = new Map<string, number>();
  const headings: Heading[] = [];
  let fence: CodeFence | null = null;
  const { frontMatter, body } = splitMarkdownFrontMatter(markdown);
  const bodyLineOffset = frontMatterLineCount(frontMatter);
  const lines = body.replace(/\r\n?/g, "\n").split("\n");

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    const line = lines[lineNumber];

    if (fence) {
      if (closesCodeFence(line, fence)) fence = null;
      continue;
    }

    const openingFence = openingCodeFence(line);
    if (openingFence) {
      fence = openingFence;
      continue;
    }

    const atxMatch = line.match(/^ {0,3}(#{1,6})(?:[ \t]+|$)(.*?)\s*(?:[ \t]+#+[ \t]*)?$/);
    if (atxMatch) {
      pushHeading(headings, used, atxMatch[1].length, stripInlineMarkdown(atxMatch[2]), lineNumber + bodyLineOffset);
      continue;
    }

    const setextLevel = setextHeadingLevel(line);
    const previousLine = lines[lineNumber - 1];
    if (setextLevel && previousLine !== undefined && isSetextHeadingTextLine(previousLine)) {
      pushHeading(headings, used, setextLevel, stripInlineMarkdown(previousLine).trim(), lineNumber - 1 + bodyLineOffset);
    }
  }

  return headings;
}

function frontMatterLineCount(frontMatter: string): number {
  return frontMatter.match(/\n/g)?.length ?? 0;
}

function pushHeading(headings: Heading[], used: Map<string, number>, level: number, text: string, line: number): void {
  const base = slugifyHeadingText(text);
  const count = used.get(base) ?? 0;
  used.set(base, count + 1);

  headings.push({
    level,
    text,
    line,
    id: count === 0 ? base : `${base}-${count}`
  });
}

function isSetextHeadingTextLine(line: string): boolean {
  return (
    Boolean(line.trim())
    && !setextHeadingLevel(line)
    && !isIndentedCodeLine(line)
    && !isAtxHeadingLine(line)
    && !canBeTableLine(line)
  );
}

function setextHeadingLevel(line: string): 1 | 2 | null {
  const marker = line.match(/^ {0,3}(=+|-+)[ \t]*$/)?.[1];
  if (!marker) return null;
  return marker[0] === "=" ? 1 : 2;
}

function isIndentedCodeLine(line: string): boolean {
  return /^(?: {4,}|\t)/.test(line);
}

function isAtxHeadingLine(line: string): boolean {
  return /^ {0,3}#{1,6}(?:[ \t]+|$)/.test(line);
}

function canBeTableLine(line: string): boolean {
  return Boolean(line.trim()) && unescapedPipeIndexes(line).length > 0 && !isIndentedCodeLine(line);
}

function openingCodeFence(line: string): CodeFence | null {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})/);
  if (!match) return null;

  const marker = match[1];
  return {
    char: marker[0] as "`" | "~",
    length: marker.length
  };
}

function closesCodeFence(line: string, fence: CodeFence): boolean {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
  return Boolean(match && match[1][0] === fence.char && match[1].length >= fence.length);
}
