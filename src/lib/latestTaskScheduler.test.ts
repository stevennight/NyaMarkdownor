import { describe, expect, it, vi } from "vitest";
import { createLatestTaskScheduler } from "./latestTaskScheduler";

describe("latest task scheduler", () => {
  it("uses the platform timer without depending on a browser window", () => {
    vi.useFakeTimers();
    const handled: string[] = [];
    const scheduler = createLatestTaskScheduler((task: string) => handled.push(task));

    scheduler.schedule("latest");
    vi.runAllTimers();

    expect(handled).toEqual(["latest"]);
    vi.useRealTimers();
  });

  it("runs only the newest task queued before the next turn", () => {
    const flushes: Array<() => void> = [];
    const handled: string[] = [];
    const scheduler = createLatestTaskScheduler((task: string) => handled.push(task), (flush) => flushes.push(flush));

    scheduler.schedule("first");
    scheduler.schedule("second");
    scheduler.schedule("latest");

    expect(flushes).toHaveLength(1);
    flushes.shift()?.();
    expect(handled).toEqual(["latest"]);
  });

  it("schedules a later batch after the previous task has run", () => {
    const flushes: Array<() => void> = [];
    const handled: number[] = [];
    const scheduler = createLatestTaskScheduler((task: number) => handled.push(task), (flush) => flushes.push(flush));

    scheduler.schedule(1);
    flushes.shift()?.();
    scheduler.schedule(2);
    scheduler.schedule(3);
    flushes.shift()?.();

    expect(handled).toEqual([1, 3]);
  });
});
