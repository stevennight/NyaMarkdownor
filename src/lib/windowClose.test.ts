import { describe, expect, it, vi } from "vitest";
import { closeWindowAfterRecovery, shouldBlockBrowserUnload } from "./windowClose";

describe("shouldBlockBrowserUnload", () => {
  it("never adds a browser unload blocker inside the desktop runtime", () => {
    expect(shouldBlockBrowserUnload(true, 3)).toBe(false);
  });

  it("only blocks browser unload when documents are dirty", () => {
    expect(shouldBlockBrowserUnload(false, 0)).toBe(false);
    expect(shouldBlockBrowserUnload(false, 1)).toBe(true);
  });
});

describe("closeWindowAfterRecovery", () => {
  it("persists recovery before approving and destroying the window", async () => {
    const calls: string[] = [];
    const close = vi.fn(async () => undefined);

    const result = await closeWindowAfterRecovery({
      persistRecovery: async () => { calls.push("recover"); },
      approveClose: () => { calls.push("approve"); },
      destroy: async () => { calls.push("destroy"); },
      close
    });

    expect(calls).toEqual(["recover", "approve", "destroy"]);
    expect(close).not.toHaveBeenCalled();
    expect(result).toEqual({ recoveryError: null, destroyError: null, usedCloseFallback: false });
  });

  it("still closes when recovery persistence fails", async () => {
    const recoveryError = new Error("state store unavailable");
    const destroy = vi.fn(async () => undefined);

    const result = await closeWindowAfterRecovery({
      persistRecovery: async () => { throw recoveryError; },
      approveClose: vi.fn(),
      destroy,
      close: vi.fn(async () => undefined)
    });

    expect(destroy).toHaveBeenCalledOnce();
    expect(result.recoveryError).toBe(recoveryError);
  });

  it("falls back to a normal close when force-destroy fails", async () => {
    const destroyError = new Error("destroy blocked");
    const close = vi.fn(async () => undefined);

    const result = await closeWindowAfterRecovery({
      persistRecovery: async () => undefined,
      approveClose: vi.fn(),
      destroy: async () => { throw destroyError; },
      close
    });

    expect(close).toHaveBeenCalledOnce();
    expect(result).toEqual({ recoveryError: null, destroyError, usedCloseFallback: true });
  });

  it("rejects only when both native close paths fail", async () => {
    const closeError = new Error("close blocked");

    await expect(closeWindowAfterRecovery({
      persistRecovery: async () => undefined,
      approveClose: vi.fn(),
      destroy: async () => { throw new Error("destroy blocked"); },
      close: async () => { throw closeError; }
    })).rejects.toBe(closeError);
  });
});
