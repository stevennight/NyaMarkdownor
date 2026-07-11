import { extractHeadings } from "./markdown";
import type { Heading } from "../types";

export type MarkdownOutlineCache = {
  headingsFor: (markdown: string) => Heading[];
};

export function createMarkdownOutlineCache(
  extract: (markdown: string) => Heading[] = extractHeadings
): MarkdownOutlineCache {
  let lastMarkdown: string | null = null;
  let lastHeadings: Heading[] = [];

  return {
    headingsFor(markdown) {
      if (markdown === lastMarkdown) return lastHeadings;

      lastMarkdown = markdown;
      lastHeadings = extract(markdown);
      return lastHeadings;
    }
  };
}
