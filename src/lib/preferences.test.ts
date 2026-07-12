import { afterEach, describe, expect, it, vi } from "vitest";
import { createPreferencesRecord, defaultBackupPreferences, defaultPreferences, loadPreferences, loadPreferencesRecord, normalizePreferences, parsePreferencesRecord, savePreferences } from "./preferences";

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

describe("preferences", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("fills newly added editor settings for old preference payloads", () => {
    expect(normalizePreferences({ theme: "dark" })).toEqual({
      ...defaultPreferences,
      theme: "dark"
    });
  });

  it("migrates old preference records with default backup settings", () => {
    const record = parsePreferencesRecord(JSON.stringify({
      version: 1,
      savedAt: 123,
      preferences: { theme: "dark" }
    }));

    expect(record?.preferences.backup).toEqual(defaultBackupPreferences);
  });

  it("normalizes backup directories, history, and numeric limits", () => {
    const normalized = normalizePreferences({
      backup: {
        directory: 42,
        previousDirectories: ["", "  D:/one  ", "D:/one", "D:/two", null, "D:/three", "D:/four", "D:/five", "D:/six", "D:/seven", "D:/eight", "D:/nine"],
        checkpointIntervalMinutes: 0,
        automaticVersionsPerFile: 999,
        manualVersionsPerFile: -1,
        maxTotalFiles: 24,
        maxTotalSizeMb: 99999,
        maxBackupFileSizeMb: 1,
        automaticRetentionDays: 99999,
        orphanRetentionDays: 0
      } as never
    });

    expect(normalized.backup).toEqual({
      directory: null,
      previousDirectories: ["D:/one", "D:/two", "D:/three", "D:/four", "D:/five", "D:/six", "D:/seven", "D:/eight"],
      checkpointIntervalMinutes: 1,
      automaticVersionsPerFile: 256,
      manualVersionsPerFile: 1,
      maxTotalFiles: 128,
      maxTotalSizeMb: 32768,
      maxBackupFileSizeMb: 16,
      automaticRetentionDays: 3650,
      orphanRetentionDays: 7
    });
  });

  it("keeps valid custom backup preferences and rounds numeric values", () => {
    expect(normalizePreferences({
      backup: {
        ...defaultBackupPreferences,
        directory: "D:/Nya Backups",
        previousDirectories: ["D:/Old Backups"],
        checkpointIntervalMinutes: 14.6,
        maxTotalFiles: 4096
      }
    }).backup).toEqual({
      ...defaultBackupPreferences,
      directory: "D:/Nya Backups",
      previousDirectories: ["D:/Old Backups"],
      checkpointIntervalMinutes: 15,
      maxTotalFiles: 4096
    });
  });

  it("keeps the effective per-file backup limit within the total storage budget", () => {
    expect(normalizePreferences({
      backup: {
        ...defaultBackupPreferences,
        maxTotalSizeMb: 256,
        maxBackupFileSizeMb: 4096
      }
    }).backup).toMatchObject({
      maxTotalSizeMb: 256,
      maxBackupFileSizeMb: 256
    });
  });

  it("keeps the visual editor as a persisted default view", () => {
    const record = createPreferencesRecord({ viewMode: "wysiwyg" }, 123);

    expect(parsePreferencesRecord(JSON.stringify(record))).toEqual(record);
    expect(normalizePreferences({ viewMode: "wysiwyg" }).viewMode).toBe("wysiwyg");
  });

  it("keeps the selected sidebar page across persisted preferences", () => {
    const record = createPreferencesRecord({ sidebarPage: "recovery" }, 123);

    expect(parsePreferencesRecord(JSON.stringify(record))).toEqual(record);
    expect(normalizePreferences({ sidebarPage: "files" }).sidebarPage).toBe("files");
    expect(parsePreferencesRecord(JSON.stringify({
      version: 1,
      savedAt: 123,
      preferences: { sidebarPage: "unknown" }
    }))?.preferences.sidebarPage).toBe("outline");
  });

  it("migrates and persists language preferences", () => {
    expect(normalizePreferences({ theme: "dark" }).language).toBe("system");
    expect(normalizePreferences({ language: "zh-CN" }).language).toBe("zh-CN");
    expect(normalizePreferences({ language: "unknown" as "en" }).language).toBe("system");
  });

  it("clamps editor ergonomics settings to supported ranges", () => {
    const normalized = normalizePreferences({
      sidebarVisible: false,
      editorFontSize: 99,
      editorLineWidth: 200,
      editorDensity: "spacious",
      tableHeightMode: "scroll",
      tableMaxHeightVh: 99,
      paneLayout: { editorRatio: 0.9, tableWidth: 100 }
    });

    expect(normalized.editorFontSize).toBe(20);
    expect(normalized.editorLineWidth).toBe(680);
    expect(normalized.sidebarVisible).toBe(false);
    expect(normalized.editorDensity).toBe("spacious");
    expect(normalized.tableHeightMode).toBe("scroll");
    expect(normalized.tableMaxHeightVh).toBe(80);
    expect(normalized.paneLayout).toEqual({ editorRatio: 0.68, tableWidth: 240 });
  });

  it("normalizes global long-table display preferences without changing documents", () => {
    expect(normalizePreferences({ tableHeightMode: "scroll", tableMaxHeightVh: 45 })).toMatchObject({
      tableHeightMode: "scroll",
      tableMaxHeightVh: 45
    });
    expect(normalizePreferences({
      tableHeightMode: "unsupported" as "scroll",
      tableMaxHeightVh: 10
    })).toMatchObject({
      tableHeightMode: "full",
      tableMaxHeightVh: 30
    });
  });

  it("does not throw when preference persistence is unavailable", () => {
    vi.stubGlobal("localStorage", createStorageMock({ setThrows: true }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(savePreferences(defaultPreferences)).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it("persists preferences with a timestamped recovery record", () => {
    vi.stubGlobal("localStorage", createStorageMock());

    expect(savePreferences({ ...defaultPreferences, theme: "dark" })).toBe(true);
    expect(loadPreferences().theme).toBe("dark");
    expect(loadPreferencesRecord()).toMatchObject({
      version: 1,
      preferences: { ...defaultPreferences, theme: "dark" }
    });
    expect(loadPreferencesRecord()?.savedAt).toEqual(expect.any(Number));
  });

  it("parses legacy preference payloads as migration records", () => {
    const record = parsePreferencesRecord(JSON.stringify({ theme: "dark" }));

    expect(record).toEqual({
      version: 1,
      savedAt: 0,
      preferences: { ...defaultPreferences, theme: "dark" }
    });
  });

  it("parses desktop preference records with their saved timestamp", () => {
    const record = createPreferencesRecord({ ...defaultPreferences, editorDensity: "compact" }, 123);

    expect(parsePreferencesRecord(JSON.stringify(record))).toEqual(record);
  });
});
