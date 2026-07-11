import { describe, expect, it } from "vitest";
import {
  droppedDraftImportToast,
  droppedOpenToast,
  isSupportedMarkdownDropName,
  openedFilesFromBrowserDrop,
  uniqueDroppedPaths
} from "./dropOpen";

describe("drop open helpers", () => {
  it("recognizes Markdown-like files by name or path", () => {
    expect(isSupportedMarkdownDropName("note.md")).toBe(true);
    expect(isSupportedMarkdownDropName("D:/Notes/Draft.markdown")).toBe(true);
    expect(isSupportedMarkdownDropName("D:/Notes/Draft.mdown")).toBe(true);
    expect(isSupportedMarkdownDropName("D:/Notes/Draft.mkdn")).toBe(true);
    expect(isSupportedMarkdownDropName("D:/Notes/Draft.mdwn")).toBe(true);
    expect(isSupportedMarkdownDropName("C:\\Notes\\plain.txt")).toBe(true);
    expect(isSupportedMarkdownDropName("image.png")).toBe(false);
  });

  it("deduplicates dropped paths while preserving order", () => {
    expect(uniqueDroppedPaths([" D:/a.md ", "", "D:/b.md", "D:/a.md"])).toEqual(["D:/a.md", "D:/b.md"]);
    expect(uniqueDroppedPaths(["D:/Notes/Draft.md", "d:\\notes\\DRAFT.md", "/Users/me/Draft.md", "/Users/me/draft.md"])).toEqual([
      "D:/Notes/Draft.md",
      "/Users/me/Draft.md",
      "/Users/me/draft.md"
    ]);
  });

  it("opens only supported browser-dropped files", async () => {
    const files = [
      { name: "a.md", text: async () => "# A" },
      { name: "image.png", text: async () => "not markdown" },
      { name: "b.txt", text: async () => "B" }
    ];

    await expect(openedFilesFromBrowserDrop(files)).resolves.toEqual([
      { path: null, name: "a.md", markdown: "# A", lineEnding: "lf" },
      { path: null, name: "b.txt", markdown: "B", lineEnding: "lf" }
    ]);
  });

  it("uses the same local text decoding path for browser-dropped draft files", async () => {
    const bytes = new Uint8Array([0xD6, 0xD0, 0xCE, 0xC4]);
    const files = [{
      name: "legacy.txt",
      text: async () => "garbled fallback",
      async arrayBuffer() {
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      }
    }];

    await expect(openedFilesFromBrowserDrop(files)).resolves.toEqual([
      { path: null, name: "legacy.txt", markdown: "中文", lineEnding: "lf" }
    ]);
  });

  it("retains CRLF style for browser-dropped drafts", async () => {
    const files = [{ name: "windows.md", text: async () => "a\r\nb\r\n" }];

    await expect(openedFilesFromBrowserDrop(files)).resolves.toEqual([
      { path: null, name: "windows.md", markdown: "a\nb\n", lineEnding: "crlf" }
    ]);
  });

  it("summarizes mixed drop results", () => {
    expect(droppedOpenToast(2, "Notes", 1)).toBe("Opened 2 dropped files - Opened folder Notes - 1 skipped");
    expect(droppedOpenToast(0, null, 0)).toBe("No Markdown files found");
  });

  it("summarizes browser dropped files as draft imports", () => {
    expect(droppedDraftImportToast(1, 0)).toBe("Imported 1 dropped draft");
    expect(droppedDraftImportToast(2, 1)).toBe("Imported 2 dropped drafts - 1 skipped");
    expect(droppedDraftImportToast(0, 0)).toBe("No Markdown files found");
  });
});
