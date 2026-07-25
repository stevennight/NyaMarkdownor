import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginEditorInput,
  commitEditorInput,
  markStartupMilestone,
  performanceDiagnosticsSnapshot,
  recordPerformanceDuration,
  resetPerformanceDiagnostics
} from "./performanceDiagnostics";

describe("performance diagnostics", () => {
  beforeEach(() => {
    resetPerformanceDiagnostics();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("records startup milestones once", () => {
    markStartupMilestone("app-committed");
    const first = performanceDiagnosticsSnapshot().startupMs["app-committed"];
    markStartupMilestone("app-committed");

    expect(first).toBeTypeOf("number");
    expect(performanceDiagnosticsSnapshot().startupMs["app-committed"]).toBe(first);
  });

  it("summarizes bounded operation samples", () => {
    for (let value = 1; value <= 250; value += 1) {
      recordPerformanceDuration("recovery-persist", value);
    }

    expect(performanceDiagnosticsSnapshot().operations["recovery-persist"]).toEqual({
      count: 200,
      latestMs: 250,
      maxMs: 250,
      p50Ms: 150,
      p95Ms: 240
    });
  });

  it("records input commit and next-frame latency", () => {
    let frame: (() => void) | undefined;
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
      frame = callback;
      return 1;
    });
    const now = vi.spyOn(globalThis.performance, "now")
      .mockReturnValueOnce(10)
      .mockReturnValueOnce(14)
      .mockReturnValueOnce(22);

    beginEditorInput("source");
    commitEditorInput("source");
    frame?.();

    expect(performanceDiagnosticsSnapshot().input.source).toMatchObject({
      commit: { count: 1, latestMs: 4 },
      nextFrame: { count: 1, latestMs: 12 }
    });
    now.mockRestore();
  });

  it("exposes a local snapshot API without document data", () => {
    recordPerformanceDuration("recovery-persist", 12.5);

    expect(globalThis.__NYA_PERFORMANCE__?.snapshot().operations["recovery-persist"].latestMs).toBe(12.5);
  });
});
