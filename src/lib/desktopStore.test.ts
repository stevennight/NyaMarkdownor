import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { queueDesktopStoreTextWrite, readDesktopStoreText } from "./desktopStore";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: () => Boolean((globalThis as { isTauri?: boolean }).isTauri)
}));

const invokeMock = vi.mocked(invoke);

afterEach(() => {
  invokeMock.mockReset();
  vi.unstubAllGlobals();
});

describe("desktop store", () => {
  it("degrades to unavailable outside Tauri", async () => {
    expect(await readDesktopStoreText("draft-document")).toBeNull();
    expect(await queueDesktopStoreTextWrite("draft-document", "{}")).toBe(false);
  });

  it("coalesces queued writes for the same key to the latest value", async () => {
    vi.stubGlobal("isTauri", true);
    let completeWrite: (() => void) | undefined;
    invokeMock.mockImplementation(() => new Promise<void>((resolve) => {
      completeWrite = resolve;
    }));

    const first = queueDesktopStoreTextWrite("preferences", "{\"font\":15}");
    const latest = queueDesktopStoreTextWrite("preferences", "{\"font\":16}");
    await Promise.resolve();

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("write_app_state_file", {
      name: "preferences-v1.json",
      content: "{\"font\":16}"
    });

    completeWrite?.();
    await expect(first).resolves.toBe(true);
    await expect(latest).resolves.toBe(true);
  });

  it("writes one final latest value after an in-flight write", async () => {
    vi.stubGlobal("isTauri", true);
    const completeWrites: Array<() => void> = [];
    invokeMock.mockImplementation(() => new Promise<void>((resolve) => {
      completeWrites.push(resolve);
    }));

    const first = queueDesktopStoreTextWrite("preferences", "{\"font\":15}");
    await Promise.resolve();
    const latest = queueDesktopStoreTextWrite("preferences", "{\"font\":17}");

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenLastCalledWith("write_app_state_file", {
      name: "preferences-v1.json",
      content: "{\"font\":15}"
    });

    completeWrites[0]?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(invokeMock).toHaveBeenLastCalledWith("write_app_state_file", {
      name: "preferences-v1.json",
      content: "{\"font\":17}"
    });

    completeWrites[1]?.();
    await expect(first).resolves.toBe(true);
    await expect(latest).resolves.toBe(true);
  });
});
