export type TableSelectionShortcut =
  | "cell"
  | "row"
  | "column"
  | "column-body"
  | "header"
  | "body"
  | "table";

export type TabNavigationShortcut =
  | { type: "next" }
  | { type: "previous" }
  | { type: "index"; index: number };

type KeyboardShortcutEvent = Pick<KeyboardEvent, "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey">;

export type AppShortcutOverlayState = {
  commandPaletteOpen: boolean;
  settingsOpen: boolean;
  historyManagerOpen: boolean;
  externalDiskReviewOpen: boolean;
};

export function areAppShortcutsBlocked(state: AppShortcutOverlayState): boolean {
  return state.commandPaletteOpen
    || state.settingsOpen
    || state.historyManagerOpen
    || state.externalDiskReviewOpen;
}

export function getTabNavigationShortcut(event: KeyboardShortcutEvent): TabNavigationShortcut | null {
  if (!(event.ctrlKey || event.metaKey)) return null;

  const key = event.key.toLowerCase();

  if (!event.altKey && key === "tab") return { type: event.shiftKey ? "previous" : "next" };
  if (!event.altKey && !event.shiftKey && event.key === "PageDown") return { type: "next" };
  if (!event.altKey && !event.shiftKey && event.key === "PageUp") return { type: "previous" };
  if (event.altKey && !event.shiftKey && /^[1-9]$/.test(event.key)) {
    return { type: "index", index: Number(event.key) - 1 };
  }

  return null;
}

export function getTableSelectionShortcut(event: KeyboardShortcutEvent): TableSelectionShortcut | null {
  if (!(event.ctrlKey || event.metaKey) || !event.altKey) return null;

  const key = event.key.toLowerCase();

  if (event.shiftKey) {
    return key === "c" ? "column-body" : null;
  }

  if (key === "a") return "table";
  if (key === "b") return "body";
  if (key === "c") return "column";
  if (key === "e") return "cell";
  if (key === "h") return "header";
  if (key === "r") return "row";
  return null;
}
