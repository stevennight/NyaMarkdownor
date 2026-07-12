import type { ViewMode } from "../types";

export function shouldFocusEditorView(
  viewTabId: string | null,
  activeTabId: string | null,
  viewMode: ViewMode
): boolean {
  return viewMode !== "preview" && Boolean(viewTabId) && viewTabId === activeTabId;
}

export function shouldFocusPendingMountedEditor(
  pendingTabId: string | null,
  mountedTabId: string,
  activeTabId: string | null,
  viewMode: ViewMode
): boolean {
  return Boolean(pendingTabId)
    && pendingTabId === mountedTabId
    && mountedTabId === activeTabId
    && viewMode !== "preview";
}

export function shouldPreserveEditorSelectionOnToolbarMouseDown(
  viewMode: ViewMode,
  mouseButton: number,
  targetIsControl: boolean
): boolean {
  return viewMode === "wysiwyg" && mouseButton === 0 && targetIsControl;
}
