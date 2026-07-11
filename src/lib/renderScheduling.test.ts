import { describe, expect, it } from "vitest";
import {
  getPreviewRenderState,
  outlineDelayFor,
  previewDelayFor,
  previewMarkdownForWorker,
  shouldAutoRenderPreview,
  shouldRequestPreviewRender
} from "./renderScheduling";

describe("render scheduling", () => {
  it("keeps short documents highly responsive", () => {
    expect(previewDelayFor(1_000)).toBe(90);
  });

  it("backs off preview rendering for larger documents", () => {
    expect(previewDelayFor(20_000)).toBe(160);
    expect(previewDelayFor(80_000)).toBe(260);
    expect(previewDelayFor(180_000)).toBe(420);
  });

  it("backs off outline extraction for very large documents", () => {
    expect(outlineDelayFor(10_000)).toBe(120);
    expect(outlineDelayFor(140_000)).toBe(280);
    expect(outlineDelayFor(340_000)).toBe(520);
  });

  it("pauses automatic preview rendering for very large documents", () => {
    expect(shouldAutoRenderPreview(300_000)).toBe(true);
    expect(shouldAutoRenderPreview(300_001)).toBe(false);
  });

  it("does not re-render a stale manual preview while outline extraction continues", () => {
    const largeMarkdown = "x".repeat(300_001);
    const state = getPreviewRenderState({
      currentMarkdown: `${largeMarkdown}\nnew edit`,
      debouncedMarkdown: `${largeMarkdown}\nnew edit`,
      manualMarkdown: largeMarkdown,
      previewVisible: true
    });

    expect(state.autoPreviewEnabled).toBe(false);
    expect(state.manualPreviewStale).toBe(true);
    expect(state.previewMarkdown).toBe(largeMarkdown);
    expect(state.shouldRenderPreview).toBe(false);
    expect(state.previewPaused).toBe(false);
    expect(previewMarkdownForWorker(state.previewMarkdown, state.shouldRenderPreview)).toBe("");
  });

  it("renders an explicit manual preview snapshot for very large documents", () => {
    const largeMarkdown = "x".repeat(300_001);
    const state = getPreviewRenderState({
      currentMarkdown: largeMarkdown,
      debouncedMarkdown: largeMarkdown,
      manualMarkdown: largeMarkdown,
      previewVisible: true
    });

    expect(state.autoPreviewEnabled).toBe(false);
    expect(state.manualPreviewStale).toBe(false);
    expect(state.shouldRenderPreview).toBe(true);
    expect(previewMarkdownForWorker(state.previewMarkdown, state.shouldRenderPreview)).toBe(largeMarkdown);
  });

  it("does not feed hidden preview markdown into the worker", () => {
    const state = getPreviewRenderState({
      currentMarkdown: "# Draft",
      debouncedMarkdown: "# Draft",
      manualMarkdown: "",
      previewVisible: false
    });

    expect(state.shouldRenderPreview).toBe(false);
    expect(previewMarkdownForWorker(state.previewMarkdown, state.shouldRenderPreview)).toBe("");
  });

  it("skips duplicate preview work when only the outline snapshot changes", () => {
    expect(shouldRequestPreviewRender("# Draft", true, null)).toBe(true);
    expect(shouldRequestPreviewRender("# Draft", true, "# Draft")).toBe(false);
    expect(shouldRequestPreviewRender("# Draft", false, null)).toBe(false);
  });
});
