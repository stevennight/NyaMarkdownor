import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecentFile } from "../types";
import { createRecentFilesRecord, forgetRecentFile, loadRecentFiles, loadRecentFilesRecord, parseRecentFilesRecord, rememberRecentFile, rememberRecentFiles, saveRecentFiles } from "./recentFiles";

function createStorageMock(options: { setThrows?: boolean } = {}): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear: vi.fn(() => store.clear()),
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      if (options.setThrows) throw new Error("quota exceeded");
      store.set(key, value);
    })
  };
}

describe("recent files", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-09T00:00:00Z"));
    vi.stubGlobal("localStorage", createStorageMock());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("remembers the newest file first, de-duplicates by path, and persists", () => {
    let recent: RecentFile[] = [];

    recent = rememberRecentFile(recent, "D:/notes/a.md", "A.md");
    vi.setSystemTime(new Date("2026-07-09T00:01:00Z"));
    recent = rememberRecentFile(recent, "D:/notes/b.md", "B.md");
    vi.setSystemTime(new Date("2026-07-09T00:02:00Z"));
    recent = rememberRecentFile(recent, "d:\\notes\\A.md", "A renamed.md");

    expect(recent.map((file) => file.path)).toEqual(["d:\\notes\\A.md", "D:/notes/b.md"]);
    expect(recent[0]).toMatchObject({
      name: "A renamed.md",
      updatedAt: Date.parse("2026-07-09T00:02:00Z")
    });
    expect(loadRecentFiles().map((file) => file.path)).toEqual(["d:\\notes\\A.md", "D:/notes/b.md"]);
  });

  it("caps the list to the eight most recent files", () => {
    let recent: RecentFile[] = [];

    for (let index = 0; index < 10; index += 1) {
      recent = rememberRecentFile(recent, `D:/notes/${index}.md`, `${index}.md`);
    }

    expect(recent).toHaveLength(8);
    expect(recent.map((file) => file.path)).toEqual([
      "D:/notes/9.md",
      "D:/notes/8.md",
      "D:/notes/7.md",
      "D:/notes/6.md",
      "D:/notes/5.md",
      "D:/notes/4.md",
      "D:/notes/3.md",
      "D:/notes/2.md"
    ]);
  });

  it("ignores null paths without mutating or persisting", () => {
    const current: RecentFile[] = [{ path: "D:/notes/a.md", name: "A.md", updatedAt: 1 }];

    const next = rememberRecentFile(current, null, "Untitled.md");

    expect(next).toBe(current);
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it("remembers a batch of files with one persistence write", () => {
    const next = rememberRecentFiles([], [
      { path: "D:/notes/a.md", name: "A.md" },
      { path: null, name: "Untitled.md" },
      { path: "D:/notes/b.md", name: "B.md" },
      { path: "D:/notes/a.md", name: "A renamed.md" }
    ]);

    expect(next.map((file) => [file.path, file.name])).toEqual([
      ["D:/notes/a.md", "A renamed.md"],
      ["D:/notes/b.md", "B.md"]
    ]);
    expect(localStorage.setItem).toHaveBeenCalledTimes(1);
  });

  it("forgets one file and persists the remaining entries", () => {
    const current: RecentFile[] = [
      { path: "D:/notes/a.md", name: "A.md", updatedAt: 1 },
      { path: "D:/notes/b.md", name: "B.md", updatedAt: 2 }
    ];

    const next = forgetRecentFile(current, "d:\\notes\\A.md");

    expect(next.map((file) => file.path)).toEqual(["D:/notes/b.md"]);
    expect(loadRecentFiles().map((file) => file.path)).toEqual(["D:/notes/b.md"]);
  });

  it("persists recent files with a timestamped recovery record", () => {
    const files: RecentFile[] = [{ path: "D:/notes/a.md", name: "A.md", updatedAt: 1 }];

    expect(saveRecentFiles(files)).toBe(true);
    expect(loadRecentFiles()).toEqual(files);
    expect(loadRecentFilesRecord()).toMatchObject({
      version: 1,
      files
    });
    expect(loadRecentFilesRecord()?.savedAt).toEqual(expect.any(Number));
  });

  it("parses desktop recent-file records with their saved timestamp", () => {
    const files: RecentFile[] = [{ path: "D:/notes/a.md", name: "A.md", updatedAt: 1 }];
    const record = createRecentFilesRecord(files, 123);

    expect(parseRecentFilesRecord(JSON.stringify(record))).toEqual(record);
  });

  it("loads legacy recent-file arrays as migration records", () => {
    const files: RecentFile[] = [
      { path: "D:/notes/a.md", name: "A.md", updatedAt: 1 },
      { path: "d:\\notes\\A.md", name: "A duplicate.md", updatedAt: 2 }
    ];

    expect(parseRecentFilesRecord(JSON.stringify(files))).toEqual({
      version: 1,
      savedAt: 0,
      files: [files[0]]
    });
  });

  it("migrates and deduplicates safe Windows verbatim recent paths", () => {
    const files: RecentFile[] = [
      { path: "\\\\?\\D:\\notes\\A.md", name: "A.md", updatedAt: 2 },
      { path: "D:\\notes\\A.md", name: "A duplicate.md", updatedAt: 1 }
    ];

    expect(parseRecentFilesRecord(JSON.stringify(files))?.files).toEqual([
      { path: "D:\\notes\\A.md", name: "A.md", updatedAt: 2 }
    ]);
  });

  it("keeps the in-memory recent list when persistence fails", () => {
    vi.stubGlobal("localStorage", createStorageMock({ setThrows: true }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const next = rememberRecentFile([], "D:/notes/a.md", "A.md");

    expect(next.map((file) => file.path)).toEqual(["D:/notes/a.md"]);
    expect(warn).toHaveBeenCalled();
  });

  it("keeps in-memory removals when persistence fails", () => {
    vi.stubGlobal("localStorage", createStorageMock({ setThrows: true }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const next = forgetRecentFile([
      { path: "D:/notes/a.md", name: "A.md", updatedAt: 1 },
      { path: "D:/notes/b.md", name: "B.md", updatedAt: 2 }
    ], "D:/notes/a.md");

    expect(next.map((file) => file.path)).toEqual(["D:/notes/b.md"]);
    expect(warn).toHaveBeenCalled();
  });
});
