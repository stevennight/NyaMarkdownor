import type { PaneLayout } from "../types";

const MIN_EDITOR_RATIO = 0.32;
const MAX_EDITOR_RATIO = 0.68;
const MIN_TABLE_WIDTH = 240;
const MAX_TABLE_WIDTH = 420;

export const defaultPaneLayout: PaneLayout = {
  editorRatio: 0.5,
  tableWidth: 300
};

export function normalizePaneLayout(value: unknown): PaneLayout {
  if (!value || typeof value !== "object") return defaultPaneLayout;
  const layout = value as Partial<PaneLayout>;

  return {
    editorRatio: clampRatio(layout.editorRatio),
    tableWidth: clampTableWidth(layout.tableWidth)
  };
}

export function resizeEditorPreviewPaneLayout(layout: PaneLayout, deltaPx: number, pairWidthPx: number): PaneLayout {
  if (!Number.isFinite(pairWidthPx) || pairWidthPx <= 0) return normalizePaneLayout(layout);

  return {
    ...layout,
    editorRatio: clampRatio(layout.editorRatio + deltaPx / pairWidthPx)
  };
}

export function resizeTablePaneLayout(layout: PaneLayout, deltaPx: number): PaneLayout {
  return {
    ...layout,
    tableWidth: clampTableWidth(layout.tableWidth - deltaPx)
  };
}

export function paneLayoutCssVariables(layout: PaneLayout): Record<string, string> {
  const normalized = normalizePaneLayout(layout);
  return {
    "--editor-pane-grow": String(Math.round(normalized.editorRatio * 1000)),
    "--preview-pane-grow": String(Math.round((1 - normalized.editorRatio) * 1000)),
    "--table-pane-width": `${normalized.tableWidth}px`
  };
}

function clampRatio(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return defaultPaneLayout.editorRatio;
  return roundToHundredth(Math.min(MAX_EDITOR_RATIO, Math.max(MIN_EDITOR_RATIO, value)));
}

function clampTableWidth(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return defaultPaneLayout.tableWidth;
  return Math.min(MAX_TABLE_WIDTH, Math.max(MIN_TABLE_WIDTH, Math.round(value)));
}

function roundToHundredth(value: number): number {
  return Math.round(value * 100) / 100;
}
