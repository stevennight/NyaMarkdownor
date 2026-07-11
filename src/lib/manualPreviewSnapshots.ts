export type ManualPreviewSnapshots = Record<string, string>;

export function manualPreviewSnapshotForTab(snapshots: ManualPreviewSnapshots, tabId: string): string {
  return snapshots[tabId] ?? "";
}

export function setManualPreviewSnapshot(
  snapshots: ManualPreviewSnapshots,
  tabId: string,
  markdown: string
): ManualPreviewSnapshots {
  if (!tabId) return snapshots;
  if (markdown === "") return clearManualPreviewSnapshot(snapshots, tabId);
  if (snapshots[tabId] === markdown) return snapshots;

  return {
    ...snapshots,
    [tabId]: markdown
  };
}

export function clearManualPreviewSnapshot(
  snapshots: ManualPreviewSnapshots,
  tabId: string
): ManualPreviewSnapshots {
  if (!tabId || !(tabId in snapshots)) return snapshots;

  const next = { ...snapshots };
  delete next[tabId];
  return next;
}

export function pruneManualPreviewSnapshots(
  snapshots: ManualPreviewSnapshots,
  tabIds: Iterable<string>
): ManualPreviewSnapshots {
  const keptIds = new Set(tabIds);
  let changed = false;
  const next: ManualPreviewSnapshots = {};

  for (const [tabId, markdown] of Object.entries(snapshots)) {
    if (keptIds.has(tabId)) {
      next[tabId] = markdown;
    } else {
      changed = true;
    }
  }

  return changed ? next : snapshots;
}
