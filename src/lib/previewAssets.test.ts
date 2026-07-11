import { afterEach, describe, expect, it, vi } from "vitest";
import { isRemoteOrSpecialImageSource, localImageSourceForRender, resolvePreviewImagePath, rewritePreviewImageSources } from "./previewAssets";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("preview image assets", () => {
  it("resolves relative image paths beside a Windows Markdown file", () => {
    expect(resolvePreviewImagePath("images/cat.png", "D:\\notes\\today\\note.md")).toEqual({
      path: "D:\\notes\\today\\images\\cat.png",
      suffix: ""
    });
  });

  it("normalizes parent segments and keeps query/hash suffixes", () => {
    expect(resolvePreviewImagePath("../assets/cat%20one.png?raw=1#preview", "D:/notes/today/note.md")).toEqual({
      path: "D:/notes/assets/cat one.png",
      suffix: "?raw=1#preview"
    });
  });

  it("resolves POSIX document-relative paths", () => {
    expect(resolvePreviewImagePath("./assets/diagram.svg", "/home/user/notes/note.md")).toEqual({
      path: "/home/user/notes/assets/diagram.svg",
      suffix: ""
    });
  });

  it("keeps absolute local paths as local paths", () => {
    expect(resolvePreviewImagePath("C:/Users/Steve/Pictures/cat.png", "D:/notes/note.md")).toEqual({
      path: "C:\\Users\\Steve\\Pictures\\cat.png",
      suffix: ""
    });
    expect(resolvePreviewImagePath("/home/user/cat.png", "/home/user/notes/note.md")).toEqual({
      path: "/home/user/cat.png",
      suffix: ""
    });
  });

  it("resolves file URLs as local image paths", () => {
    expect(resolvePreviewImagePath("file:///C:/Users/Steve/Pictures/cat%20one.png?raw=1#preview", "D:/notes/note.md")).toEqual({
      path: "C:\\Users\\Steve\\Pictures\\cat one.png",
      suffix: "?raw=1#preview"
    });
    expect(resolvePreviewImagePath("file:///home/user/Pictures/cat.png", "/home/user/notes/note.md")).toEqual({
      path: "/home/user/Pictures/cat.png",
      suffix: ""
    });
    expect(resolvePreviewImagePath("file://server/share/cat.png", "D:/notes/note.md")).toEqual({
      path: "\\\\server\\share\\cat.png",
      suffix: ""
    });
  });

  it("does not resolve remote, protocol, network, root-relative, or document-less sources", () => {
    expect(resolvePreviewImagePath("https://example.com/cat.png", "D:/notes/note.md")).toBeNull();
    expect(resolvePreviewImagePath("data:image/png;base64,abc", "D:/notes/note.md")).toBeNull();
    expect(resolvePreviewImagePath("asset://localhost/cat.png", "D:/notes/note.md")).toBeNull();
    expect(resolvePreviewImagePath("//example.com/cat.png", "D:/notes/note.md")).toBeNull();
    expect(resolvePreviewImagePath("/images/cat.png", "D:/notes/note.md")).toEqual({
      path: "/images/cat.png",
      suffix: ""
    });
    expect(resolvePreviewImagePath("images/cat.png", null)).toBeNull();
  });

  it("recognizes remote or special image sources without misreading Windows drives", () => {
    expect(isRemoteOrSpecialImageSource("https://example.com/cat.png")).toBe(true);
    expect(isRemoteOrSpecialImageSource("blob:http://localhost/id")).toBe(true);
    expect(isRemoteOrSpecialImageSource("C:/Users/Steve/cat.png")).toBe(false);
    expect(isRemoteOrSpecialImageSource("file:///C:/Users/Steve/cat.png")).toBe(false);
  });

  it("converts only local visual-editor image sources while preserving the Markdown source value", () => {
    const converter = (path: string) => `asset://localhost/${path.replace(/\\/g, "/")}`;

    expect(localImageSourceForRender("images/cat.png?size=full", "D:\\notes\\today\\note.md", converter))
      .toBe("asset://localhost/D:/notes/today/images/cat.png?size=full");
    expect(localImageSourceForRender("https://example.com/cat.png", "D:\\notes\\today\\note.md", converter))
      .toBe("https://example.com/cat.png");
    expect(localImageSourceForRender("images/cat.png", null, converter)).toBe("images/cat.png");
  });

  it("skips DOM parsing for saved previews without image elements", () => {
    vi.stubGlobal("DOMParser", class {
      constructor() {
        throw new Error("DOMParser should not run for previews without images");
      }
    });

    const html = "<h1>Notes</h1><p>No local image to rewrite.</p>";

    expect(rewritePreviewImageSources(html, "D:/notes/Draft.md", (path) => `asset://localhost/${path}`)).toBe(html);
  });
});
