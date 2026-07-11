import { invoke, isTauri as tauriRuntimeAvailable } from "@tauri-apps/api/core";
import type { MarkdownFileStats, MarkdownLineEnding, WorkspaceListing } from "../types";
import { localPathKey } from "./localPathKeys";
import { markdownWithLineEnding, normalizeMarkdownLineEndings, normalizeMarkdownText } from "./lineEndings";
import { sortWorkspaceFiles, workspaceFileDepth } from "./workspaceFiles";
import { isExtensionOnlyMarkdownName, isSupportedMarkdownFileName, markdownFileInputAccept } from "./markdownFileTypes";

export type OpenedFile = {
  path: string | null;
  name: string;
  markdown: string;
  lineEnding: MarkdownLineEnding;
  backupPath?: string | null;
  fileStats?: MarkdownFileStats | null;
};

export type MarkdownBackup = {
  path: string;
  name: string;
  modifiedMs: number;
  size: number;
};

export type SavedExport = {
  path: string | null;
  name: string;
};

export type OpenMarkdownFilesResult = {
  files: OpenedFile[];
  failedCount: number;
  failedMessages: string[];
};

export type FileAssociationScope = "markdown" | "plain-text";

type WriteMarkdownResult = {
  backupPath: string | null;
  stats: MarkdownFileStats;
};

type BrowserWindowWithFileAccess = Window & {
  showOpenFilePicker?: unknown;
  showSaveFilePicker?: unknown;
};

type TauriWindow = Window & {
  __TAURI__?: unknown;
  __TAURI_INTERNALS__?: unknown;
};

export function isTauriRuntime(): boolean {
  if (tauriRuntimeAvailable()) return true;
  if (typeof window === "undefined") return false;

  const tauriWindow = window as TauriWindow;
  return Boolean(tauriWindow.__TAURI_INTERNALS__ || tauriWindow.__TAURI__);
}

export function supportsBrowserFileAccess(): boolean {
  if (typeof window === "undefined") return false;
  const browserWindow = window as BrowserWindowWithFileAccess;
  return typeof browserWindow.showOpenFilePicker === "function" && typeof browserWindow.showSaveFilePicker === "function";
}

export function openedFileHasLocalBinding(file: Pick<OpenedFile, "path">): boolean {
  return Boolean(file.path);
}

export async function initialMarkdownFilePaths(): Promise<string[]> {
  if (!isTauriRuntime()) return [];
  return invoke<string[]>("initial_markdown_file_paths");
}

export async function takeSecondaryInstanceMarkdownPaths(): Promise<string[]> {
  if (!isTauriRuntime()) return [];
  return invoke<string[]>("take_secondary_instance_markdown_paths");
}

export async function openMarkdownFile(): Promise<OpenedFile | null> {
  const result = await openMarkdownFiles();
  if (result.files[0]) return result.files[0];
  if (result.failedCount > 0) {
    throw new Error(result.failedMessages[0] ? `File could not be opened: ${result.failedMessages[0]}` : "File could not be opened.");
  }
  return null;
}

export async function openMarkdownFiles(): Promise<OpenMarkdownFilesResult> {
  if (isTauriRuntime()) {
    const selected = await invoke<string[]>("pick_markdown_files");
    const paths = uniqueOpenPaths(selected);
    if (!paths.length) return emptyOpenMarkdownFilesResult();

    return settledOpenMarkdownFiles(paths.map(readMarkdownPath));
  }

  throw new Error("Opening a real local file requires the desktop app. Use draft import in web preview.");
}

export async function importMarkdownFilesAsDrafts(): Promise<OpenMarkdownFilesResult> {
  if (isTauriRuntime()) {
    return openMarkdownFiles();
  }

  return openBrowserFiles();
}

export async function openMarkdownWorkspace(): Promise<WorkspaceListing | null> {
  if (!isTauriRuntime()) {
    throw new Error("Workspace folders are only available in the desktop app.");
  }

  const selected = await invoke<string | null>("pick_markdown_workspace");
  if (!selected) return null;
  return listMarkdownWorkspace(selected);
}

export async function openLocalImageFiles(): Promise<string[] | null> {
  if (!isTauriRuntime()) return null;

  const selected = await invoke<string[]>("pick_local_image_files");
  return selected.length ? selected : null;
}

export async function listMarkdownWorkspace(rootPath: string): Promise<WorkspaceListing> {
  if (!isTauriRuntime()) {
    throw new Error("Workspace folders are only available in the desktop app.");
  }

  const listing = await invoke<WorkspaceListing>("list_markdown_workspace", { rootPath });
  return {
    ...listing,
    files: sortWorkspaceFiles(listing.files).map((file) => ({
      ...file,
      depth: workspaceFileDepth(file.relativePath)
    }))
  };
}

export async function readMarkdownPath(path: string): Promise<OpenedFile> {
  if (!isTauriRuntime()) {
    throw new Error("Recent files are only available in the desktop app.");
  }

  const [markdown, fileStats] = await Promise.all([
    invoke<string>("read_markdown_file", { path }),
    readMarkdownFileStats(path)
  ]);
  const normalized = normalizeMarkdownText(markdown);
  return {
    path,
    name: fileNameFromPath(path),
    ...normalized,
    fileStats
  };
}

export async function readMarkdownFileStats(path: string | null): Promise<MarkdownFileStats | null> {
  if (!path || !isTauriRuntime()) return null;
  return invoke<MarkdownFileStats>("stat_markdown_file", { path });
}

async function existingMarkdownFileStats(path: string): Promise<MarkdownFileStats | null> {
  return invoke<MarkdownFileStats | null>("existing_markdown_file_stats", { path });
}

export async function revealMarkdownFile(path: string | null): Promise<void> {
  if (!path) throw new Error("No local file path to reveal.");
  if (!isTauriRuntime()) throw new Error("Revealing files requires the desktop app.");
  await invoke("reveal_markdown_file", { path });
}

export async function manageFileAssociation(scope: FileAssociationScope): Promise<void> {
  if (!isTauriRuntime()) throw new Error("File associations require the desktop app.");
  await invoke("manage_file_association", { scope });
}

export async function listMarkdownBackups(path: string | null): Promise<MarkdownBackup[]> {
  if (!path || !isTauriRuntime()) return [];
  return invoke<MarkdownBackup[]>("list_markdown_backups", { path });
}

export async function readMarkdownBackup(sourcePath: string, backupPath: string): Promise<OpenedFile> {
  if (!isTauriRuntime()) {
    throw new Error("Backups are only available in the desktop app.");
  }

  const [markdown, fileStats] = await Promise.all([
    invoke<string>("read_markdown_backup", { sourcePath, backupPath }),
    readMarkdownFileStats(sourcePath)
  ]);
  const normalized = normalizeMarkdownText(markdown);
  return {
    path: sourcePath,
    name: fileNameFromPath(sourcePath),
    ...normalized,
    backupPath,
    fileStats
  };
}

export async function saveMarkdownFile(
  path: string | null,
  content: string,
  suggestedName: string,
  expectedStats: MarkdownFileStats | null = null,
  lineEnding: MarkdownLineEnding = "lf"
): Promise<OpenedFile | null> {
  const markdown = normalizeMarkdownLineEndings(content);
  const diskContent = markdownWithLineEnding(markdown, lineEnding);

  if (isTauriRuntime()) {
    const selectedTarget = path ?? await invoke<string | null>("pick_markdown_save_path", {
      suggestedPath: ensureMarkdownName(suggestedName)
    });

    if (!selectedTarget) return null;
    const target = ensureMarkdownPath(selectedTarget);
    const targetStats = path === null ? await existingMarkdownFileStats(target) : expectedStats;
    const expectedMissing = path === null && targetStats === null;

    const result = await invoke<WriteMarkdownResult>("write_markdown_file", {
      path: target,
      content: diskContent,
      expectedStats: targetStats,
      expectedMissing
    });
    return {
      path: target,
      name: fileNameFromPath(target),
      markdown,
      lineEnding,
      backupPath: result.backupPath,
      fileStats: result.stats
    };
  }

  downloadMarkdown(diskContent, ensureMarkdownName(suggestedName));
  return {
    path: null,
    name: ensureMarkdownName(suggestedName),
    markdown,
    lineEnding,
    backupPath: null,
    fileStats: null
  };
}

export async function createMarkdownFile(
  content: string,
  suggestedName: string,
  lineEnding: MarkdownLineEnding = "lf"
): Promise<OpenedFile | null> {
  const markdown = normalizeMarkdownLineEndings(content);
  const diskContent = markdownWithLineEnding(markdown, lineEnding);

  if (isTauriRuntime()) {
    const selectedTarget = await invoke<string | null>("pick_markdown_save_path", {
      suggestedPath: ensureMarkdownName(suggestedName)
    });

    if (!selectedTarget) return null;
    const target = ensureMarkdownPath(selectedTarget);

    const result = await invoke<WriteMarkdownResult>("create_markdown_file", { path: target, content: diskContent });
    return {
      path: target,
      name: fileNameFromPath(target),
      markdown,
      lineEnding,
      backupPath: result.backupPath,
      fileStats: result.stats
    };
  }

  throw new Error("Creating a real local file requires the desktop app.");
}

export async function saveMarkdownFileAs(
  content: string,
  suggestedName: string,
  lineEnding: MarkdownLineEnding = "lf"
): Promise<OpenedFile | null> {
  return saveMarkdownFile(null, content, suggestedName, null, lineEnding);
}

export async function saveHtmlExport(html: string, suggestedName: string): Promise<SavedExport | null> {
  const exportName = ensureHtmlName(suggestedName);

  if (isTauriRuntime()) {
    const target = await invoke<string | null>("pick_html_export_path", {
      suggestedPath: exportName
    });

    if (!target) return null;
    const exportPath = ensureHtmlPath(target);

    await invoke("write_export_file", { path: exportPath, content: html });
    return {
      path: exportPath,
      name: fileNameFromPath(exportPath)
    };
  }

  downloadFile(html, exportName, "text/html;charset=utf-8");
  return {
    path: null,
    name: exportName
  };
}

export function ensureMarkdownName(name: string): string {
  const normalized = name.trim();
  if (!normalized) return "Untitled.md";

  if (isExtensionOnlyMarkdownName(normalized)) return `Untitled${normalized}`;

  return isSupportedMarkdownFileName(normalized) ? normalized : `${normalized}.md`;
}

export function ensureMarkdownPath(path: string): string {
  const normalized = path.trim();
  if (!normalized) return "Untitled.md";

  const separatorIndex = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  const prefix = separatorIndex >= 0 ? normalized.slice(0, separatorIndex + 1) : "";
  const baseName = separatorIndex >= 0 ? normalized.slice(separatorIndex + 1).trim() : normalized;
  const safeName = baseName === "." || baseName === ".." ? "Untitled.md" : ensureMarkdownName(baseName);

  return `${prefix}${safeName}`;
}

export function ensureHtmlName(name: string): string {
  const normalized = name.trim();
  if (!normalized) return "Untitled.html";

  const withoutMarkdownExtension = isSupportedMarkdownFileName(normalized)
    ? normalized.slice(0, normalized.lastIndexOf("."))
    : normalized;
  const extensionOnly = withoutMarkdownExtension.match(/^\.html?$/i);
  if (extensionOnly) return `Untitled${extensionOnly[0]}`;

  return /\.html?$/i.test(withoutMarkdownExtension) ? withoutMarkdownExtension : `${withoutMarkdownExtension || "Untitled"}.html`;
}

export function ensureHtmlPath(path: string): string {
  const normalized = path.trim();
  if (!normalized) return "Untitled.html";

  const separatorIndex = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  const prefix = separatorIndex >= 0 ? normalized.slice(0, separatorIndex + 1) : "";
  const baseName = separatorIndex >= 0 ? normalized.slice(separatorIndex + 1).trim() : normalized;
  const safeName = baseName === "." || baseName === ".." ? "Untitled.html" : ensureHtmlName(baseName);

  return `${prefix}${safeName}`;
}

export function openMarkdownFilesToast(openedCount: number, failedCount: number): string {
  return openMarkdownFilesToastWithFailures(openedCount, failedCount, []);
}

export function openMarkdownFilesToastWithFailures(
  openedCount: number,
  failedCount: number,
  failedMessages: readonly string[]
): string {
  const firstFailure = failedMessages[0]?.trim();
  const failureDetail = firstFailure ? `: ${firstFailure}` : "";

  if (openedCount <= 0) {
    if (failedCount === 1) return `1 file could not be opened${failureDetail}`;
    if (failedCount > 1) return `${failedCount} files could not be opened${failureDetail}`;
    return "No files selected";
  }

  const opened = openedCount === 1 ? "Opened 1 file" : `Opened ${openedCount} files`;
  if (failedCount === 1) return `${opened} - 1 failed${failureDetail}`;
  if (failedCount > 1) return `${opened} - ${failedCount} failed${failureDetail}`;
  return opened;
}

export function uniqueOpenPaths(paths: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const path of paths) {
    const normalized = path.trim();
    const key = localPathKey(normalized);
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    unique.push(normalized);
  }

  return unique;
}

function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() || "Untitled.md";
}

function openBrowserFiles(): Promise<OpenMarkdownFilesResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = markdownFileInputAccept;
    input.style.display = "none";
    document.body.append(input);

    const finish = (result: OpenMarkdownFilesResult) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(result);
    };

    input.addEventListener("change", async () => {
      const files = Array.from(input.files ?? []);
      if (!files.length) {
        finish(emptyOpenMarkdownFilesResult());
        return;
      }

      try {
        const opened = await settledOpenMarkdownFiles(files.map(async (file) => {
          const normalized = normalizeMarkdownText(await readBrowserFileText(file));
          return {
            path: null,
            name: file.name,
            ...normalized
          };
        }));
        finish(opened);
      } catch (error) {
        input.remove();
        reject(error);
      }
    });
    input.addEventListener("cancel", () => finish(emptyOpenMarkdownFilesResult()), { once: true });
    input.click();
  });
}

export async function readBrowserFileText(file: Pick<File, "text"> & Partial<Pick<File, "arrayBuffer">>): Promise<string> {
  if (typeof file.arrayBuffer !== "function") return file.text();
  return decodeBrowserTextBytes(new Uint8Array(await file.arrayBuffer()));
}

export function decodeBrowserTextBytes(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return decodeBytes(bytes.slice(3), "utf-8");
  }

  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return decodeBytes(bytes.slice(2), "utf-16le");
  }

  if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
    return decodeBytes(bytes.slice(2), "utf-16be");
  }

  try {
    return decodeBytes(bytes, "utf-8");
  } catch (utf8Error) {
    for (const encoding of ["gb18030", "gbk"] as const) {
      try {
        return decodeBytes(bytes, encoding);
      } catch {
        // Try the next local legacy encoding before surfacing the UTF-8 error.
      }
    }
    throw utf8Error;
  }
}

function decodeBytes(bytes: Uint8Array, encoding: string): string {
  return new TextDecoder(encoding, { fatal: true }).decode(bytes);
}

function emptyOpenMarkdownFilesResult(): OpenMarkdownFilesResult {
  return { files: [], failedCount: 0, failedMessages: [] };
}

async function settledOpenMarkdownFiles(openers: Iterable<Promise<OpenedFile>>): Promise<OpenMarkdownFilesResult> {
  const settled = await Promise.allSettled(openers);
  const files: OpenedFile[] = [];
  const failedMessages: string[] = [];
  let failedCount = 0;

  for (const result of settled) {
    if (result.status === "fulfilled") {
      files.push(result.value);
    } else {
      failedCount += 1;
      failedMessages.push(errorMessage(result.reason));
      console.warn(result.reason);
    }
  }

  return { files, failedCount, failedMessages };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function downloadMarkdown(content: string, fileName: string): void {
  downloadFile(content, fileName, "text/markdown;charset=utf-8");
}

function downloadFile(content: string, fileName: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
