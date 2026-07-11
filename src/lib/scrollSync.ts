export type ScrollMetrics = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
};

export function getScrollProgress(element: ScrollMetrics): number {
  const maxScroll = element.scrollHeight - element.clientHeight;
  if (maxScroll <= 0) return 0;
  return clamp(element.scrollTop / maxScroll);
}

export function setScrollProgress(element: ScrollMetrics, progress: number): void {
  const maxScroll = element.scrollHeight - element.clientHeight;
  element.scrollTop = maxScroll <= 0 ? 0 : Math.round(maxScroll * clamp(progress));
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
