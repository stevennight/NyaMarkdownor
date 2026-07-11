const MANUAL_PREVIEW_THRESHOLD = 300_000;

export type PreviewRenderState = {
  autoPreviewEnabled: boolean;
  manualPreviewStale: boolean;
  previewMarkdown: string;
  previewPaused: boolean;
  shouldRenderPreview: boolean;
};

export function outlineDelayFor(length: number): number {
  if (length > 300_000) return 520;
  if (length > 120_000) return 280;
  return 120;
}

export function previewDelayFor(length: number): number {
  if (length > 160_000) return 420;
  if (length > 60_000) return 260;
  if (length > 16_000) return 160;
  return 90;
}

export function shouldAutoRenderPreview(length: number): boolean {
  return length <= MANUAL_PREVIEW_THRESHOLD;
}

export function previewMarkdownForWorker(previewMarkdown: string, shouldRenderPreview: boolean): string {
  return shouldRenderPreview ? previewMarkdown : "";
}

export function shouldRequestPreviewRender(
  previewMarkdown: string,
  shouldRenderPreview: boolean,
  lastRenderedPreviewMarkdown: string | null
): boolean {
  return shouldRenderPreview && previewMarkdown !== lastRenderedPreviewMarkdown;
}

export function getPreviewRenderState({
  currentMarkdown,
  debouncedMarkdown,
  manualMarkdown,
  previewVisible
}: {
  currentMarkdown: string;
  debouncedMarkdown: string;
  manualMarkdown: string;
  previewVisible: boolean;
}): PreviewRenderState {
  const autoPreviewEnabled = shouldAutoRenderPreview(currentMarkdown.length);
  const hasManualPreview = Boolean(manualMarkdown);
  const manualPreviewCurrent = hasManualPreview && manualMarkdown === currentMarkdown;
  const manualPreviewStale = !autoPreviewEnabled && hasManualPreview && !manualPreviewCurrent;

  return {
    autoPreviewEnabled,
    manualPreviewStale,
    previewMarkdown: autoPreviewEnabled ? debouncedMarkdown : manualMarkdown,
    previewPaused: previewVisible && !autoPreviewEnabled && !hasManualPreview,
    shouldRenderPreview: previewVisible && (autoPreviewEnabled || manualPreviewCurrent)
  };
}
