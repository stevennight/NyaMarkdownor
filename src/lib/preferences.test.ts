import { afterEach, describe, expect, it, vi } from "vitest";
import { createPreferencesRecord, defaultPreferences, loadPreferences, loadPreferencesRecord, normalizePreferences, parsePreferencesRecord, savePreferences } from "./preferences";

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
      paneLayout: { editorRatio: 0.9, tableWidth: 100 }
    });

    expect(normalized.editorFontSize).toBe(20);
    expect(normalized.editorLineWidth).toBe(680);
    expect(normalized.sidebarVisible).toBe(false);
    expect(normalized.editorDensity).toBe("spacious");
    expect(normalized.paneLayout).toEqual({ editorRatio: 0.68, tableWidth: 240 });
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
