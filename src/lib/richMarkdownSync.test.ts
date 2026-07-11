import { describe, expect, it, vi } from "vitest";
import { createRichMarkdownSyncScheduler, richMarkdownSyncDelayFor } from "./richMarkdownSync";

describe("rich Markdown sync scheduler", () => {
  it("backs off serialization for larger visual documents", () => {
    expect(richMarkdownSyncDelayFor(1_000)).toBe(96);
    expect(richMarkdownSyncDelayFor(30_000)).toBe(140);
    expect(richMarkdownSyncDelayFor(120_000)).toBe(240);
    expect(richMarkdownSyncDelayFor(260_000)).toBe(420);
  });

  it("serializes only the newest edit in a burst", () => {
    vi.useFakeTimers();
    const onMarkdown = vi.fn();
    const scheduler = createRichMarkdownSyncScheduler(onMarkdown, 90);
    const firstSerialize = vi.fn(() => "first");
    const latestSerialize = vi.fn(() => "latest");

    scheduler.schedule(firstSerialize);
    scheduler.schedule(latestSerialize);
    vi.advanceTimersByTime(90);

    expect(firstSerialize).not.toHaveBeenCalled();
    expect(latestSerialize).toHaveBeenCalledOnce();
    expect(onMarkdown).toHaveBeenCalledWith("latest", "input");
    vi.useRealTimers();
  });

  it("flushes a pending edit immediately and prevents a second emission", () => {
    vi.useFakeTimers();
    const onMarkdown = vi.fn();
    const scheduler = createRichMarkdownSyncScheduler(onMarkdown, 90);

    scheduler.schedule(() => "latest");

    expect(scheduler.flush()).toBe(true);
    expect(scheduler.flush()).toBe(false);
    vi.advanceTimersByTime(90);
    expect(onMarkdown).toHaveBeenCalledTimes(1);
    expect(onMarkdown).toHaveBeenCalledWith("latest", "input");
    vi.useRealTimers();
  });

  it("discards a stale scheduled serialization when external content replaces it", () => {
    vi.useFakeTimers();
    const onMarkdown = vi.fn();
    const scheduler = createRichMarkdownSyncScheduler(onMarkdown, 90);

    scheduler.schedule(() => "stale");

    expect(scheduler.cancel()).toBe(true);
    expect(scheduler.cancel()).toBe(false);
    vi.advanceTimersByTime(90);
    expect(onMarkdown).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("keeps the history action associated with the latest pending serialization", () => {
    vi.useFakeTimers();
    const onMarkdown = vi.fn();
    const scheduler = createRichMarkdownSyncScheduler(onMarkdown, 90);

    scheduler.schedule(() => "typed", "input");
    scheduler.schedule(() => "undone", "undo");
    vi.advanceTimersByTime(90);

    expect(onMarkdown).toHaveBeenCalledWith("undone", "undo");
    vi.useRealTimers();
  });

  it("uses the requested large-document delay while keeping flush immediate", () => {
    vi.useFakeTimers();
    const onMarkdown = vi.fn();
    const scheduler = createRichMarkdownSyncScheduler(onMarkdown, 90);

    scheduler.schedule(() => "large", "input", 420);
    vi.advanceTimersByTime(419);
    expect(onMarkdown).not.toHaveBeenCalled();
    expect(scheduler.flush()).toBe(true);
    expect(onMarkdown).toHaveBeenCalledWith("large", "input");
    vi.useRealTimers();
  });
});
