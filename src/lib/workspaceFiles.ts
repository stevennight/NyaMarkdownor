import { suggestedUntitledMarkdownName } from "./fileNames";

export const WORKSPACE_SIDEBAR_FILE_LIMIT = 160;

export type WorkspaceFileDisplay<T> = {
  files: T[];
  totalCount: number;
  hiddenCount: number;
  limited: boolean;
};

export function sortWorkspaceFiles<T extends { relativePath: string; path: string }>(files: T[]): T[] {
  return [...files].sort((left, right) => {
    const leftPath = normalizeWorkspacePath(left.relativePath);
    const rightPath = normalizeWorkspacePath(right.relativePath);
    const pathOrder = leftPath.localeCompare(rightPath, undefined, { sensitivity: "base", numeric: true });
    if (pathOrder !== 0) return pathOrder;
    return left.path.localeCompare(right.path, undefined, { sensitivity: "base", numeric: true });
  });
}

export function sortWorkspaceFilesByModified<T extends { modifiedMs: number; relativePath: string; path: string }>(files: T[]): T[] {
  return [...files].sort((left, right) => {
    const modifiedOrder = right.modifiedMs - left.modifiedMs;
    if (modifiedOrder !== 0) return modifiedOrder;

    const leftPath = normalizeWorkspacePath(left.relativePath);
    const rightPath = normalizeWorkspacePath(right.relativePath);
    const pathOrder = leftPath.localeCompare(rightPath, undefined, { sensitivity: "base", numeric: true });
    if (pathOrder !== 0) return pathOrder;
    return left.path.localeCompare(right.path, undefined, { sensitivity: "base", numeric: true });
  });
}

export function filterWorkspaceFiles<T extends { name: string; relativePath: string }>(files: T[], query: string): T[] {
  const terms = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  if (!terms.length) return files;

  return files.filter((file) => {
    const haystack = `${file.name} ${normalizeWorkspacePath(file.relativePath)}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

export function limitWorkspaceFilesForSidebar<T>(
  files: T[],
  limit = WORKSPACE_SIDEBAR_FILE_LIMIT
): WorkspaceFileDisplay<T> {
  const safeLimit = normalizeLimit(limit);
  const visibleFiles = files.slice(0, safeLimit);

  return {
    files: visibleFiles,
    totalCount: files.length,
    hiddenCount: Math.max(0, files.length - visibleFiles.length),
    limited: visibleFiles.length < files.length
  };
}

export function workspaceFileDepth(relativePath: string): number {
  return normalizeWorkspacePath(relativePath).split("/").filter(Boolean).length - 1;
}

export function suggestedWorkspaceNewMarkdownPath(
  rootPath: string,
  files: readonly { name: string; relativePath: string }[],
  additionalNames: readonly string[] = []
): string {
  return joinWorkspacePath(rootPath, suggestedUntitledMarkdownName([
    ...files.map((file) => file.name),
    ...additionalNames
  ]));
}

function joinWorkspacePath(rootPath: string, fileName: string): string {
  const root = rootPath.trim();
  if (!root) return fileName;
  if (/[\\/]$/.test(root)) return `${root}${fileName}`;
  return `${root}${root.includes("\\") && !root.includes("/") ? "\\" : "/"}${fileName}`;
}

function normalizeWorkspacePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit)) return WORKSPACE_SIDEBAR_FILE_LIMIT;
  return Math.max(0, Math.trunc(limit));
}
