import type { Heading } from "../types";

export type MarkdownWorkerRequest = {
  id: number;
  outlineMarkdown: string;
  previewMarkdown: string;
  includePreview: boolean;
};

export type MarkdownWorkerResponse = {
  id: number;
  headings: Heading[];
  previewHtml: string;
  includePreview: boolean;
  error?: string;
};
