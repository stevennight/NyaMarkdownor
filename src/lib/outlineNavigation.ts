import type { Heading } from "../types";

type OutlineHeading = Pick<Heading, "id" | "line">;

export function lineNumberAtOffset(markdown: string, offset: number): number {
  const clampedOffset = Math.max(0, Math.min(offset, markdown.length));
  let line = 0;

  for (let index = 0; index < clampedOffset; index += 1) {
    if (markdown.charCodeAt(index) === 10) line += 1;
  }

  return line;
}

export function outlineHeadingKey(heading: OutlineHeading): string {
  return `${heading.id}:${heading.line}`;
}

export function activeOutlineHeadingKey(
  headings: readonly OutlineHeading[],
  currentLine: number
): string | null {
  if (!Number.isFinite(currentLine)) return null;

  const line = Math.max(0, Math.floor(currentLine));
  let activeHeading: OutlineHeading | null = null;

  for (const heading of headings) {
    if (heading.line > line) continue;
    if (!activeHeading || heading.line >= activeHeading.line) activeHeading = heading;
  }

  return activeHeading ? outlineHeadingKey(activeHeading) : null;
}
