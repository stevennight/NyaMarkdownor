import type { AppPreferences, EditorDensity, LanguagePreference, SidebarPage, ThemeMode, ViewMode } from "../types";
import { queueDesktopStoreTextWrite, readDesktopStoreText } from "./desktopStore";
import { defaultPaneLayout, normalizePaneLayout } from "./paneLayout";

const PREFERENCES_KEY = "nya-markdownor-preferences-v1";

export type PreferencesRecord = {
  version: 1;
  savedAt: number;
  preferences: AppPreferences;
};

export const defaultPreferences: AppPreferences = {
  viewMode: "split",
  theme: "light",
  language: "system",
  sidebarVisible: true,
  sidebarPage: "outline",
  autoSave: true,
  smartCopy: true,
  softSyntax: true,
  editorFontSize: 15,
  editorLineWidth: 920,
  editorDensity: "comfortable",
  paneLayout: defaultPaneLayout
};

export function loadPreferences(): AppPreferences {
  return loadPreferencesRecord()?.preferences ?? defaultPreferences;
}

export function loadPreferencesRecord(): PreferencesRecord | null {
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY);
    if (!raw) return null;
    return parsePreferencesRecord(raw);
  } catch (error) {
    console.warn(error);
    return null;
  }
}

export function savePreferences(preferences: AppPreferences): boolean {
  const record = createPreferencesRecord(preferences);
  const serialized = JSON.stringify(record);
  void queueDesktopStoreTextWrite("preferences", serialized);

  try {
    localStorage.setItem(PREFERENCES_KEY, serialized);
    return true;
  } catch (error) {
    console.warn(error);
    return false;
  }
}

export async function loadDesktopPreferencesRecord(): Promise<PreferencesRecord | null> {
  const raw = await readDesktopStoreText("preferences");
  return raw ? parsePreferencesRecord(raw) : null;
}

export function createPreferencesRecord(preferences: Partial<AppPreferences>, savedAt = Date.now()): PreferencesRecord {
  return {
    version: 1,
    savedAt,
    preferences: normalizePreferences(preferences)
  };
}

export function parsePreferencesRecord(raw: string): PreferencesRecord | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const record = normalizePreferencesRecord(parsed);
    if (record) return record;
    if (parsed && typeof parsed === "object") return createPreferencesRecord(parsed as Partial<AppPreferences>, 0);
    return null;
  } catch (error) {
    console.warn(error);
    return null;
  }
}

export function normalizePreferences(value: Partial<AppPreferences>): AppPreferences {
  return {
    viewMode: isViewMode(value.viewMode) ? value.viewMode : defaultPreferences.viewMode,
    theme: isThemeMode(value.theme) ? value.theme : defaultPreferences.theme,
    language: isLanguagePreference(value.language) ? value.language : defaultPreferences.language,
    sidebarVisible: typeof value.sidebarVisible === "boolean" ? value.sidebarVisible : defaultPreferences.sidebarVisible,
    sidebarPage: isSidebarPage(value.sidebarPage) ? value.sidebarPage : defaultPreferences.sidebarPage,
    autoSave: typeof value.autoSave === "boolean" ? value.autoSave : defaultPreferences.autoSave,
    smartCopy: typeof value.smartCopy === "boolean" ? value.smartCopy : defaultPreferences.smartCopy,
    softSyntax: typeof value.softSyntax === "boolean" ? value.softSyntax : defaultPreferences.softSyntax,
    editorFontSize: clampNumber(value.editorFontSize, 13, 20, defaultPreferences.editorFontSize),
    editorLineWidth: clampNumber(value.editorLineWidth, 680, 1160, defaultPreferences.editorLineWidth),
    editorDensity: isEditorDensity(value.editorDensity) ? value.editorDensity : defaultPreferences.editorDensity,
    paneLayout: normalizePaneLayout(value.paneLayout)
  };
}

function normalizePreferencesRecord(value: unknown): PreferencesRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<PreferencesRecord>;
  if (record.version !== 1 || typeof record.savedAt !== "number" || !Number.isFinite(record.savedAt)) return null;
  if (!record.preferences || typeof record.preferences !== "object") return null;

  return {
    version: 1,
    savedAt: record.savedAt,
    preferences: normalizePreferences(record.preferences)
  };
}

function isViewMode(value: unknown): value is ViewMode {
  return value === "focus" || value === "split" || value === "preview" || value === "wysiwyg";
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark";
}

function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === "system" || value === "zh-CN" || value === "en";
}

function isSidebarPage(value: unknown): value is SidebarPage {
  return value === "outline" || value === "files" || value === "recovery";
}

function isEditorDensity(value: unknown): value is EditorDensity {
  return value === "compact" || value === "comfortable" || value === "spacious";
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}
