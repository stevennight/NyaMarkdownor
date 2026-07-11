import type { MarkdownDocument } from "../types";

type AutoSaveDocument = Pick<MarkdownDocument, "filePath" | "markdown" | "lastSavedMarkdown">;

export function shouldQueueAutoSave(
  document: AutoSaveDocument,
  autoSaveEnabled: boolean,
  diskNeedsReview: boolean
): boolean {
  return autoSaveEnabled
    && Boolean(document.filePath)
    && !diskNeedsReview
    && document.markdown !== document.lastSavedMarkdown;
}

export function shouldRetryAutoSave(lastAttemptedMarkdown: string | undefined, markdown: string): boolean {
  return lastAttemptedMarkdown !== markdown;
}
