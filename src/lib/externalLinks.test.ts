import { describe, expect, it, vi } from "vitest";
import { normalizeExternalLinkHref, openExternalLink } from "./externalLinks";

describe("external links", () => {
  it("normalizes only external URL kinds that the desktop app is allowed to open", () => {
    expect(normalizeExternalLinkHref(" https://example.com/docs ")).toBe("https://example.com/docs");
    expect(normalizeExternalLinkHref("http:example.com")).toBe("http://example.com/");
    expect(normalizeExternalLinkHref("//example.com/path")).toBe("https://example.com/path");
    expect(normalizeExternalLinkHref("mailto:notes@example.com")).toBe("mailto:notes@example.com");
    expect(normalizeExternalLinkHref("javascript:alert(1)")).toBeNull();
    expect(normalizeExternalLinkHref("file:///tmp/note.md")).toBeNull();
    expect(normalizeExternalLinkHref("tel:+10000000000")).toBeNull();
    expect(normalizeExternalLinkHref("../notes/next.md")).toBeNull();
    expect(normalizeExternalLinkHref("https://example.com/\nnext")).toBeNull();
  });

  it("uses the Tauri opener in the desktop runtime", async () => {
    const openDesktopUrl = vi.fn(async () => undefined);
    const openBrowserWindow = vi.fn(() => ({}));

    await expect(openExternalLink("https://example.com/docs", {
      desktopRuntime: true,
      openDesktopUrl,
      openBrowserWindow
    })).resolves.toBe("opened");

    expect(openDesktopUrl).toHaveBeenCalledWith("https://example.com/docs");
    expect(openBrowserWindow).not.toHaveBeenCalled();
  });

  it("reports browser popup blocking without using the desktop opener", async () => {
    const openDesktopUrl = vi.fn(async () => undefined);
    const openBrowserWindow = vi.fn(() => null);

    await expect(openExternalLink("https://example.com", {
      desktopRuntime: false,
      openDesktopUrl,
      openBrowserWindow
    })).resolves.toBe("blocked");

    expect(openDesktopUrl).not.toHaveBeenCalled();
    expect(openBrowserWindow).toHaveBeenCalledWith("https://example.com/");
  });

  it("does not delegate unsupported protocols to either platform opener", async () => {
    const openDesktopUrl = vi.fn(async () => undefined);
    const openBrowserWindow = vi.fn(() => ({}));

    await expect(openExternalLink("javascript:alert(1)", {
      desktopRuntime: true,
      openDesktopUrl,
      openBrowserWindow
    })).resolves.toBe("unsupported");

    expect(openDesktopUrl).not.toHaveBeenCalled();
    expect(openBrowserWindow).not.toHaveBeenCalled();
  });

  it("surfaces desktop opener failures to the caller", async () => {
    const error = new Error("system opener unavailable");
    await expect(openExternalLink("https://example.com", {
      desktopRuntime: true,
      openDesktopUrl: async () => { throw error; }
    })).rejects.toBe(error);
  });
});
