import { describe, expect, it, vi } from "vitest";
import {
  createSourceEditorSyncScheduler,
  sourceEditorSyncDelayFor
} from "./sourceEditorSync";

describe("source editor sync", () => {
  it("backs off React synchronization for larger source documents", () => {
    expect(sourceEditorSyncDelayFor(1_000)).toBe(24);
    expect(sourceEditorSyncDelayFor(30_000)).toBe(48);
    expect(sourceEditorSyncDelayFor(120_000)).toBe(96);
    expect(sourceEditorSyncDelayFor(300_000)).toBe(180);
    expect(sourceEditorSyncDelayFor(600_000)).toBe(280);
  });

  it("serializes only the latest editor state in a burst", () => {
    vi.useFakeTimers();
    const onMarkdown = vi.fn();
    const onSelection = vi.fn();
    const serialize = vi.fn((state: string) => state);
    const scheduler = createSourceEditorSyncScheduler(serialize, onMarkdown, onSelection);

    scheduler.schedule("first", true);
    scheduler.schedule("latest", true);
    vi.advanceTimersByTime(24);

    expect(serialize).toHaveBeenCalledOnce();
    expect(serialize).toHaveBeenCalledWith("latest");
    expect(onMarkdown).toHaveBeenCalledWith("latest");
    expect(onSelection).toHaveBeenCalledWith("latest");
    vi.useRealTimers();
  });

  it("keeps a pending document change when a newer selection-only state arrives", () => {
    vi.useFakeTimers();
    const onMarkdown = vi.fn();
    const onSelection = vi.fn();
    const scheduler = createSourceEditorSyncScheduler(
      (state: { markdown: string }) => state.markdown,
      onMarkdown,
      onSelection
    );
    const latest = { markdown: "latest" };

    scheduler.schedule({ markdown: "typed" }, true);
    scheduler.schedule(latest, false);
    vi.advanceTimersByTime(24);

    expect(onMarkdown).toHaveBeenCalledWith("latest");
    expect(onSelection).toHaveBeenCalledWith(latest);
    vi.useRealTimers();
  });

  it("flushes Markdown without reporting a stale selection during unmount", () => {
    vi.useFakeTimers();
    const onMarkdown = vi.fn();
    const onSelection = vi.fn();
    const scheduler = createSourceEditorSyncScheduler(
      (state: string) => state,
      onMarkdown,
      onSelection
    );

    scheduler.schedule("latest", true, 180);

    expect(scheduler.flush({ reportSelection: false })).toBe(true);
    expect(onMarkdown).toHaveBeenCalledWith("latest");
    expect(onSelection).not.toHaveBeenCalled();
    vi.advanceTimersByTime(180);
    expect(onMarkdown).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("cancels stale pending editor state after an external replacement", () => {
    vi.useFakeTimers();
    const onMarkdown = vi.fn();
    const scheduler = createSourceEditorSyncScheduler(
      (state: string) => state,
      onMarkdown,
      vi.fn()
    );

    scheduler.schedule("stale", true);

    expect(scheduler.cancel()).toBe(true);
    expect(scheduler.cancel()).toBe(false);
    vi.runAllTimers();
    expect(onMarkdown).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
