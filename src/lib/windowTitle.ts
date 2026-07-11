export type DocumentWindowTitleOptions = {
  displayName: string;
  dirty: boolean;
  dirtyTabsCount: number;
  appName?: string;
};

export function documentWindowTitle({
  displayName,
  dirty,
  dirtyTabsCount,
  appName = "NyaMarkdownor"
}: DocumentWindowTitleOptions): string {
  const name = displayName.trim() || "Untitled.md";
  const dirtyMarker = dirty ? "* " : "";
  const dirtyTabsLabel = dirtyTabsCount > 1 ? ` (${dirtyTabsCount} unsaved)` : "";

  return `${dirtyMarker}${name}${dirtyTabsLabel} - ${appName}`;
}
