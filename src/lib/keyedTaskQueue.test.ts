import { describe, expect, it } from "vitest";
import { queueKeyedTask } from "./keyedTaskQueue";

describe("keyed task queue", () => {
  it("runs tasks for the same key in order", async () => {
    const queues = new Map<string, Promise<void>>();
    const started: string[] = [];
    const firstGate = deferred<void>();

    const first = queueKeyedTask(queues, "document", async () => {
      started.push("first");
      await firstGate.promise;
      return "first saved";
    });
    const second = queueKeyedTask(queues, "document", async () => {
      started.push("second");
      return "second saved";
    });

    await Promise.resolve();
    expect(started).toEqual(["first"]);

    firstGate.resolve();
    await expect(first).resolves.toBe("first saved");
    await expect(second).resolves.toBe("second saved");
    expect(started).toEqual(["first", "second"]);
  });

  it("allows saves for different keys to start independently", async () => {
    const queues = new Map<string, Promise<void>>();
    const started: string[] = [];
    const firstGate = deferred<void>();
    const secondGate = deferred<void>();

    const first = queueKeyedTask(queues, "first", async () => {
      started.push("first");
      await firstGate.promise;
    });
    const second = queueKeyedTask(queues, "second", async () => {
      started.push("second");
      await secondGate.promise;
    });

    await Promise.resolve();
    expect(started).toEqual(["first", "second"]);

    firstGate.resolve();
    secondGate.resolve();
    await Promise.all([first, second]);
  });

  it("continues after a failed task and clears an idle queue", async () => {
    const queues = new Map<string, Promise<void>>();
    const failed = queueKeyedTask(queues, "document", async () => {
      throw new Error("write failed");
    });
    const recovered = queueKeyedTask(queues, "document", async () => "saved");

    await expect(failed).rejects.toThrow("write failed");
    await expect(recovered).resolves.toBe("saved");
    await Promise.resolve();
    expect(queues.has("document")).toBe(false);
  });
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
