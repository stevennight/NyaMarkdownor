import { readBrowserFileText, type OpenedFile } from "./fileIo";
import { normalizeMarkdownText } from "./lineEndings";
import { localPathKey } from "./localPathKeys";
import { isSupportedMarkdownFileName } from "./markdownFileTypes";

export type BrowserDroppedFile = Pick<File, "name" | "text"> & Partial<Pick<File, "arrayBuffer">>;

export function isSupportedMarkdownDropName(name: string): boolean {
  return isSupportedMarkdownFileName(name);
}

export function uniqueDroppedPaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const path of paths) {
    const normalized = path.trim();
    const key = localPathKey(normalized);
    if (!normalized || !key || seen.has(key)) continue;
    seen.add(key);
    unique.push(normalized);
  }

  return unique;
}

export async function openedFileFromBrowserDrop(file: BrowserDroppedFile): Promise<OpenedFile | null> {
  if (!isSupportedMarkdownDropName(file.name)) return null;

  const normalized = normalizeMarkdownText(await readBrowserFileText(file));

  return {
    path: null,
    name: file.name,
    ...normalized
  };
}

export async function openedFilesFromBrowserDrop(files: Iterable<BrowserDroppedFile>): Promise<OpenedFile[]> {
  const opened: OpenedFile[] = [];

  for (const file of files) {
    const next = await openedFileFromBrowserDrop(file);
    if (next) opened.push(next);
  }

  return opened;
}

export function droppedOpenToast(fileCount: number, workspaceName: string | null, skippedCount: number): string {
  const parts: string[] = [];
  if (fileCount === 1) parts.push("Opened 1 dropped file");
  if (fileCount > 1) parts.push(`Opened ${fileCount} dropped files`);
  if (workspaceName) parts.push(`Opened folder ${workspaceName}`);
  if (skippedCount > 0) parts.push(`${skippedCount} skipped`);
  return parts.length > 0 ? parts.join(" - ") : "No Markdown files found";
}

export function droppedDraftImportToast(fileCount: number, skippedCount: number): string {
  const parts: string[] = [];
  if (fileCount === 1) parts.push("Imported 1 dropped draft");
  if (fileCount > 1) parts.push(`Imported ${fileCount} dropped drafts`);
  if (skippedCount > 0) parts.push(`${skippedCount} skipped`);
  return parts.length > 0 ? parts.join(" - ") : "No Markdown files found";
}
