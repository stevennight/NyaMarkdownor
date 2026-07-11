import { describe, expect, it } from "vitest";
import {
  defaultPaneLayout,
  normalizePaneLayout,
  paneLayoutCssVariables,
  resizeEditorPreviewPaneLayout,
  resizeTablePaneLayout
} from "./paneLayout";

describe("pane layout", () => {
  it("normalizes missing and malformed pane layouts", () => {
    expect(normalizePaneLayout(null)).toEqual(defaultPaneLayout);
    expect(normalizePaneLayout({ editorRatio: Number.NaN, tableWidth: "wide" })).toEqual(defaultPaneLayout);
  });

  it("clamps persisted pane layout values", () => {
    expect(normalizePaneLayout({ editorRatio: 0.1, tableWidth: 100 })).toEqual({
      editorRatio: 0.32,
      tableWidth: 240
    });
    expect(normalizePaneLayout({ editorRatio: 0.9, tableWidth: 900 })).toEqual({
      editorRatio: 0.68,
      tableWidth: 420
    });
  });

  it("resizes the editor/preview split from pointer deltas", () => {
    expect(resizeEditorPreviewPaneLayout(defaultPaneLayout, 120, 800).editorRatio).toBe(0.65);
    expect(resizeEditorPreviewPaneLayout(defaultPaneLayout, -300, 800).editorRatio).toBe(0.32);
  });

  it("resizes the table pane from the handle to its left", () => {
    expect(resizeTablePaneLayout(defaultPaneLayout, -40).tableWidth).toBe(340);
    expect(resizeTablePaneLayout(defaultPaneLayout, 200).tableWidth).toBe(240);
  });

  it("serializes layout variables for low-churn CSS updates", () => {
    expect(paneLayoutCssVariables({ editorRatio: 0.62, tableWidth: 333 })).toEqual({
      "--editor-pane-grow": "620",
      "--preview-pane-grow": "380",
      "--table-pane-width": "333px"
    });
  });
});
