export type LatestTaskScheduler<T> = {
  schedule: (task: T) => void;
};

export function createLatestTaskScheduler<T>(
  run: (task: T) => void,
  scheduleFlush: (flush: () => void) => void = (flush) => globalThis.setTimeout(flush, 0)
): LatestTaskScheduler<T> {
  let pendingTask: T | undefined;
  let flushScheduled = false;

  const flush = () => {
    flushScheduled = false;
    const task = pendingTask;
    pendingTask = undefined;
    if (task !== undefined) run(task);
  };

  return {
    schedule(task) {
      pendingTask = task;
      if (flushScheduled) return;
      flushScheduled = true;
      scheduleFlush(flush);
    }
  };
}
