import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createWorkspaceRootRecord,
  loadWorkspaceRoot,
  loadWorkspaceRootRecord,
  parseWorkspaceRootRecord,
  saveWorkspaceRoot
} from "./workspaceRoot";

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

describe("workspace root storage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("persists the last workspace root as a timestamped record", () => {
    vi.stubGlobal("localStorage", createStorageMock());

    expect(saveWorkspaceRoot("D:/notes")).toBe(true);
    expect(loadWorkspaceRoot()).toBe("D:/notes");
    expect(loadWorkspaceRootRecord()).toMatchObject({
      version: 1,
      rootPath: "D:/notes"
    });
    expect(loadWorkspaceRootRecord()?.savedAt).toEqual(expect.any(Number));
  });

  it("persists a closed workspace so stale desktop records do not reopen it", () => {
    vi.stubGlobal("localStorage", createStorageMock());

    expect(saveWorkspaceRoot(null)).toBe(true);
    expect(loadWorkspaceRoot()).toBeNull();
    expect(loadWorkspaceRootRecord()).toMatchObject({
      version: 1,
      rootPath: null
    });
  });

  it("parses legacy raw workspace paths as migration records", () => {
    expect(parseWorkspaceRootRecord("D:/notes")).toEqual({
      version: 1,
      savedAt: 0,
      rootPath: "D:/notes"
    });
  });

  it("parses desktop workspace-root records with their saved timestamp", () => {
    const record = createWorkspaceRootRecord("D:/notes", 123);

    expect(parseWorkspaceRootRecord(JSON.stringify(record))).toEqual(record);
  });

  it("migrates safe Windows verbatim workspace roots", () => {
    expect(parseWorkspaceRootRecord(JSON.stringify({
      version: 1,
      savedAt: 123,
      rootPath: "\\\\?\\D:\\notes"
    }))).toEqual({
      version: 1,
      savedAt: 123,
      rootPath: "D:\\notes"
    });
  });

  it("does not throw when workspace-root persistence is unavailable", () => {
    vi.stubGlobal("localStorage", createStorageMock({ setThrows: true }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(saveWorkspaceRoot("D:/notes")).toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});
