import { describe, expect, it } from "vitest";
import { areAppShortcutsBlocked, getTabNavigationShortcut, getTableSelectionShortcut } from "./appShortcuts";

type ShortcutEvent = Parameters<typeof getTableSelectionShortcut>[0];

function shortcutEvent(key: string, overrides: Partial<ShortcutEvent> = {}): ShortcutEvent {
  return {
    altKey: true,
    ctrlKey: true,
    key,
    metaKey: false,
    shiftKey: false,
    ...overrides
  };
}

describe("getTableSelectionShortcut", () => {
  it("maps table selection shortcuts", () => {
    expect(getTableSelectionShortcut(shortcutEvent("E"))).toBe("cell");
    expect(getTableSelectionShortcut(shortcutEvent("R"))).toBe("row");
    expect(getTableSelectionShortcut(shortcutEvent("C"))).toBe("column");
    expect(getTableSelectionShortcut(shortcutEvent("C", { shiftKey: true }))).toBe("column-body");
    expect(getTableSelectionShortcut(shortcutEvent("H"))).toBe("header");
    expect(getTableSelectionShortcut(shortcutEvent("B"))).toBe("body");
    expect(getTableSelectionShortcut(shortcutEvent("A"))).toBe("table");
  });

  it("supports the platform meta key", () => {
    expect(getTableSelectionShortcut(shortcutEvent("A", { ctrlKey: false, metaKey: true }))).toBe("table");
  });

  it("ignores non-table shortcuts and incomplete modifiers", () => {
    expect(getTableSelectionShortcut(shortcutEvent("C", { altKey: false }))).toBeNull();
    expect(getTableSelectionShortcut(shortcutEvent("C", { ctrlKey: false, metaKey: false }))).toBeNull();
    expect(getTableSelectionShortcut(shortcutEvent("A", { shiftKey: true }))).toBeNull();
    expect(getTableSelectionShortcut(shortcutEvent("T"))).toBeNull();
  });
});

describe("getTabNavigationShortcut", () => {
  it("maps common tab cycling shortcuts", () => {
    expect(getTabNavigationShortcut(shortcutEvent("Tab", { altKey: false }))).toEqual({ type: "next" });
    expect(getTabNavigationShortcut(shortcutEvent("Tab", { altKey: false, shiftKey: true }))).toEqual({ type: "previous" });
    expect(getTabNavigationShortcut(shortcutEvent("PageDown", { altKey: false }))).toEqual({ type: "next" });
    expect(getTabNavigationShortcut(shortcutEvent("PageUp", { altKey: false }))).toEqual({ type: "previous" });
  });

  it("maps direct tab shortcuts with the alternate modifier", () => {
    expect(getTabNavigationShortcut(shortcutEvent("1"))).toEqual({ type: "index", index: 0 });
    expect(getTabNavigationShortcut(shortcutEvent("9"))).toEqual({ type: "index", index: 8 });
  });

  it("ignores incomplete or unrelated tab shortcuts", () => {
    expect(getTabNavigationShortcut(shortcutEvent("Tab", { altKey: false, ctrlKey: false, metaKey: false }))).toBeNull();
    expect(getTabNavigationShortcut(shortcutEvent("1", { altKey: false }))).toBeNull();
    expect(getTabNavigationShortcut(shortcutEvent("PageDown", { altKey: true }))).toBeNull();
    expect(getTabNavigationShortcut(shortcutEvent("0"))).toBeNull();
  });
});

describe("areAppShortcutsBlocked", () => {
  const clear = {
    commandPaletteOpen: false,
    settingsOpen: false,
    historyManagerOpen: false,
    externalDiskReviewOpen: false
  };

  it("allows shortcuts when no blocking overlay is open", () => {
    expect(areAppShortcutsBlocked(clear)).toBe(false);
  });

  it.each(Object.keys(clear) as Array<keyof typeof clear>)("blocks shortcuts for %s", (key) => {
    expect(areAppShortcutsBlocked({ ...clear, [key]: true })).toBe(true);
  });
});
