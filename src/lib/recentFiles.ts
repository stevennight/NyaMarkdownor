import type { RecentFile } from "../types";
import { queueDesktopStoreTextWrite, readDesktopStoreText } from "./desktopStore";
import { localPathKey, simplifyLocalPath } from "./localPathKeys";

const RECENT_FILES_KEY = "nya-markdownor-recent-files-v1";
const MAX_RECENT_FILES = 8;

export type RecentFilesRecord = {
  version: 1;
  savedAt: number;
  files: RecentFile[];
};

export type RecentFileInput = {
  path: string | null;
  name: string;
};

export function loadRecentFiles(): RecentFile[] {
  return loadRecentFilesRecord()?.files ?? [];
}

export function loadRecentFilesRecord(): RecentFilesRecord | null {
  try {
    const raw = localStorage.getItem(RECENT_FILES_KEY);
    if (!raw) return null;
    return parseRecentFilesRecord(raw);
  } catch (error) {
    console.warn(error);
    return null;
  }
}

export function rememberRecentFile(current: RecentFile[], path: string | null, name: string): RecentFile[] {
  return rememberRecentFiles(current, [{ path, name }]);
}

export function rememberRecentFiles(current: RecentFile[], files: Iterable<RecentFileInput>): RecentFile[] {
  const opened = Array.from(files).filter((file): file is { path: string; name: string } => Boolean(file.path));
  if (!opened.length) return current;

  const updatedAt = Date.now();
  let next = current;

  for (const file of opened) {
    const path = simplifyLocalPath(file.path);
    const key = localPathKey(path);
    next = [
      { path, name: file.name, updatedAt },
      ...next.filter((item) => localPathKey(item.path) !== key)
    ].slice(0, MAX_RECENT_FILES);
  }

  saveRecentFiles(next);
  return next;
}

export function forgetRecentFile(current: RecentFile[], path: string): RecentFile[] {
  const key = localPathKey(path);
  const next = current.filter((item) => localPathKey(item.path) !== key);
  saveRecentFiles(next);
  return next;
}

export function saveRecentFiles(files: RecentFile[]): boolean {
  const record = createRecentFilesRecord(files);
  const serialized = JSON.stringify(record);
  void queueDesktopStoreTextWrite("recent-files", serialized);

  try {
    localStorage.setItem(RECENT_FILES_KEY, serialized);
    return true;
  } catch (error) {
    console.warn(error);
    return false;
  }
}

export async function loadDesktopRecentFilesRecord(): Promise<RecentFilesRecord | null> {
  const raw = await readDesktopStoreText("recent-files");
  return raw ? parseRecentFilesRecord(raw) : null;
}

export function createRecentFilesRecord(files: RecentFile[], savedAt = Date.now()): RecentFilesRecord {
  return {
    version: 1,
    savedAt,
    files: normalizeRecentFiles(files)
  };
}

export function parseRecentFilesRecord(raw: string): RecentFilesRecord | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const record = normalizeRecentFilesRecord(parsed);
    if (record) return record;

    if (Array.isArray(parsed)) {
      return {
        version: 1,
        savedAt: 0,
        files: normalizeRecentFiles(parsed)
      };
    }
    return null;
  } catch (error) {
    console.warn(error);
    return null;
  }
}

function normalizeRecentFilesRecord(value: unknown): RecentFilesRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<RecentFilesRecord>;
  if (record.version !== 1 || typeof record.savedAt !== "number" || !Number.isFinite(record.savedAt)) return null;
  if (!Array.isArray(record.files)) return null;

  return {
    version: 1,
    savedAt: record.savedAt,
    files: normalizeRecentFiles(record.files)
  };
}

function normalizeRecentFiles(value: unknown[]): RecentFile[] {
  const seen = new Set<string>();
  const files: RecentFile[] = [];

  for (const item of value) {
    if (!(
      Boolean(item)
      && typeof item === "object"
      && typeof (item as Partial<RecentFile>).path === "string"
      && typeof (item as Partial<RecentFile>).name === "string"
      && typeof (item as Partial<RecentFile>).updatedAt === "number"
    )) continue;

    const file = item as RecentFile;
    const path = simplifyLocalPath(file.path);
    const key = localPathKey(path);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    files.push({ ...file, path });
    if (files.length >= MAX_RECENT_FILES) break;
  }

  return files;
}
