import { describe, expect, it } from "vitest";
import {
  createDroppedImageTextEdit,
  droppedImageMarkdown,
  droppedImageToast,
  isSupportedImageDropName,
  markdownImageForPath,
  relativeMarkdownImagePath,
  SUPPORTED_IMAGE_DROP_EXTENSIONS
} from "./localImageDrop";

describe("local image drop helpers", () => {
  it("recognizes common local image files", () => {
    expect(isSupportedImageDropName("photo.png")).toBe(true);
    expect(isSupportedImageDropName("D:/Notes/diagram.SVG")).toBe(true);
    expect(isSupportedImageDropName("C:\\Notes\\image.avif")).toBe(true);
    expect(isSupportedImageDropName("note.md")).toBe(false);
  });

  it("keeps picker extensions aligned with drop detection", () => {
    expect(SUPPORTED_IMAGE_DROP_EXTENSIONS.every((extension) => isSupportedImageDropName(`image.${extension}`))).toBe(true);
  });

  it("builds a same-folder Markdown image reference", () => {
    expect(markdownImageForPath("D:/Notes/pic.png", "D:/Notes/doc.md")).toBe("![pic](pic.png)");
  });

  it("builds an encoded child relative Markdown image reference", () => {
    expect(markdownImageForPath("D:/Notes/assets/pic 1(草稿).png", "D:/Notes/doc.md"))
      .toBe("![pic 1(草稿)](assets/pic%201%28%E8%8D%89%E7%A8%BF%29.png)");
  });

  it("builds a parent relative Markdown image reference", () => {
    expect(relativeMarkdownImagePath("D:/assets/pic.png", "D:/Notes/articles/doc.md")).toBe("../../assets/pic.png");
  });

  it("returns null when Windows roots differ", () => {
    expect(relativeMarkdownImagePath("E:/assets/pic.png", "D:/Notes/doc.md")).toBeNull();
  });

  it("creates multi-image Markdown while counting skipped paths", () => {
    expect(droppedImageMarkdown([
      "D:/Notes/assets/a.png",
      "D:/Notes/assets/b.webp",
      "D:/Notes/assets/readme.md"
    ], "D:/Notes/doc.md")).toEqual({
      markdown: "![a](assets/a.png)\n![b](assets/b.webp)",
      insertedCount: 2,
      skippedCount: 1
    });
  });

  it("skips image references for unsaved documents", () => {
    expect(droppedImageMarkdown(["D:/Notes/assets/a.png"], null)).toEqual({
      markdown: "",
      insertedCount: 0,
      skippedCount: 1
    });
  });

  it("creates a scoped insertion edit at the current selection", () => {
    expect(createDroppedImageTextEdit("before\nafter", { from: 7, to: 7 }, "![pic](pic.png)")).toEqual({
      markdown: "before\n![pic](pic.png)\nafter",
      change: { from: 7, to: 7, insert: "![pic](pic.png)\n" },
      selection: { from: 23, to: 23 }
    });
  });

  it("keeps image drop toasts specific", () => {
    expect(droppedImageToast(1, 0)).toBe("Inserted 1 image reference");
    expect(droppedImageToast(2, 1)).toBe("Inserted 2 image references - 1 skipped");
    expect(droppedImageToast(0, 1)).toBe("1 skipped");
  });
});
