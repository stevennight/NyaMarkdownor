import type { RenderedMarkdown } from "../types";
import { highlightCodeHtml } from "./codeHighlight";
import { extractHeadings } from "./markdownHeadings";
import { renderMarkdownHtml } from "./markdown";

export function renderMarkdownPreview(markdown: string): RenderedMarkdown {
  return {
    html: renderMarkdownPreviewHtml(markdown),
    headings: extractHeadings(markdown)
  };
}

export function renderMarkdownPreviewHtml(markdown: string): string {
  return renderMarkdownHtml(markdown, { highlightCode: highlightCodeHtml });
}
