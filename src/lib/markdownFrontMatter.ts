export type MarkdownFrontMatter = {
  frontMatter: string;
  body: string;
};

export function splitMarkdownFrontMatter(markdown: string): MarkdownFrontMatter {
  const match = markdown.match(/^(---|\+\+\+)\r?\n[\s\S]*?\r?\n\1(?:\r?\n|$)/);
  if (!match) return { frontMatter: "", body: markdown };

  return {
    frontMatter: match[0],
    body: markdown.slice(match[0].length)
  };
}

export function withMarkdownFrontMatter(frontMatter: string, body: string): string {
  return `${frontMatter}${body}`;
}
