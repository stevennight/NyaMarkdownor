export type MarkdownFrontMatter = {
  frontMatter: string;
  body: string;
};

export type MarkdownFrontMatterEditor = {
  delimiter: "---" | "+++";
  format: "YAML" | "TOML";
  content: string;
  lineEnding: "\n" | "\r\n";
  trailingLineEnding: boolean;
};

export type MarkdownFrontMatterPromotion = MarkdownFrontMatter & {
  promoted: boolean;
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

export function promoteMarkdownFrontMatter(currentFrontMatter: string, body: string): MarkdownFrontMatterPromotion {
  if (currentFrontMatter) {
    return { frontMatter: currentFrontMatter, body, promoted: false };
  }

  const detected = splitMarkdownFrontMatter(body);
  return detected.frontMatter
    ? { ...detected, promoted: true }
    : { frontMatter: "", body, promoted: false };
}

export function markdownFrontMatterEditor(frontMatter: string): MarkdownFrontMatterEditor | null {
  if (!frontMatter) return null;

  const delimiter = frontMatter.startsWith("+++") ? "+++" : "---";
  const lineEnding = frontMatter.includes("\r\n") ? "\r\n" : "\n";
  const trailingLineEnding = frontMatter.endsWith(lineEnding);
  const withoutTrailingLineEnding = trailingLineEnding
    ? frontMatter.slice(0, -lineEnding.length)
    : frontMatter;
  const openingEnd = withoutTrailingLineEnding.indexOf(lineEnding);
  const closingStart = withoutTrailingLineEnding.lastIndexOf(lineEnding);
  if (openingEnd < 0 || closingStart < openingEnd) return null;

  return {
    delimiter,
    format: delimiter === "+++" ? "TOML" : "YAML",
    content: withoutTrailingLineEnding.slice(openingEnd + lineEnding.length, closingStart),
    lineEnding,
    trailingLineEnding
  };
}

export function updateMarkdownFrontMatterContent(frontMatter: string, content: string): string {
  const editor = markdownFrontMatterEditor(frontMatter);
  if (!editor) return frontMatter;

  const normalizedContent = content.replace(/\r\n?|\n/g, editor.lineEnding);
  return editor.delimiter
    + editor.lineEnding
    + (normalizedContent ? `${normalizedContent}${editor.lineEnding}` : "")
    + editor.delimiter
    + (editor.trailingLineEnding ? editor.lineEnding : "");
}
