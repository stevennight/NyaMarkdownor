import type { MarkdownDocument } from "../types";

export type DirtyDocument = Pick<MarkdownDocument, "markdown" | "lastSavedMarkdown">;

export function isDocumentDirty(document: DirtyDocument): boolean {
  return document.markdown !== document.lastSavedMarkdown;
}

export function dirtyDocuments<T extends { document: DirtyDocument }>(tabs: readonly T[]): T[] {
  return tabs.filter((tab) => isDocumentDirty(tab.document));
}
