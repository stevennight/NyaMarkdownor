export type MarkdownFrontMatter = {
  frontMatter: string;
  body: string;
};

export function splitMarkdownFrontMatter(markdown: string): MarkdownFrontMatter {
  const opening = markdown.match(/^(---|\+\+\+)\r?\n/);
  if (!opening) return { frontMatter: "", body: markdown };

  const delimiter = opening[1];
  let lineStart = opening[0].length;

  while (lineStart <= markdown.length) {
    const newlineIndex = markdown.indexOf("\n", lineStart);
    const rawLineEnd = newlineIndex === -1 ? markdown.length : newlineIndex;
    const lineEnd = rawLineEnd > lineStart && markdown[rawLineEnd - 1] === "\r"
      ? rawLineEnd - 1
      : rawLineEnd;

    if (markdown.slice(lineStart, lineEnd) === delimiter) {
      const frontMatterEnd = newlineIndex === -1 ? rawLineEnd : newlineIndex + 1;
      return {
        frontMatter: markdown.slice(0, frontMatterEnd),
        body: markdown.slice(frontMatterEnd)
      };
    }

    if (newlineIndex === -1) break;
    lineStart = newlineIndex + 1;
  }

  return { frontMatter: "", body: markdown };
}

export function withMarkdownFrontMatter(frontMatter: string, body: string): string {
  if (!frontMatter || !body || /(?:\r?\n)$/.test(frontMatter) || /^(?:\r?\n)/.test(body)) {
    return `${frontMatter}${body}`;
  }

  const lineEnding = frontMatter.includes("\r\n") ? "\r\n" : "\n";
  return `${frontMatter}${lineEnding}${body}`;
}
