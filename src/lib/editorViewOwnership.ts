export function activeOwnedEditorView<T>(
  view: T | null,
  viewTabId: string | null,
  activeTabId: string | null
): T | null {
  if (!view || !viewTabId || !activeTabId) return null;
  return viewTabId === activeTabId ? view : null;
}
