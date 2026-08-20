import { normalizeRichLinkHref } from "./richLinks";

export function sourceLinkAtPosition(markdown: string, position: number): string | null {
  const offset = Math.max(0, Math.min(position, markdown.length));
  const lineStart = offset === 0 ? 0 : markdown.lastIndexOf("\n", offset - 1) + 1;
  const lineEnd = markdown.indexOf("\n", offset);
  const end = lineEnd === -1 ? markdown.length : lineEnd;
  const line = markdown.slice(lineStart, end);
  const column = offset - lineStart;

  const markdownLink = /\[[^\]\r\n]*\]\(\s*(?:<([^>\r\n]+)>|([^\s)\r\n]+))/g;
  for (const match of line.matchAll(markdownLink)) {
    const href = match[1] ?? match[2];
    if (!href || match.index === undefined) continue;
    const linkEnd = match.index + match[0].length;
    if (column < match.index || column > linkEnd) continue;
    return normalizeRichLinkHref(href);
  }

  const bareLink = /(?:https?:\/\/|mailto:)[^\s<>\])]+/gi;
  for (const match of line.matchAll(bareLink)) {
    if (match.index === undefined) continue;
    const linkEnd = match.index + match[0].length;
    if (column < match.index || column > linkEnd) continue;
    return normalizeRichLinkHref(match[0].replace(/[.,!?;:]+$/, ""));
  }

  return null;
}
