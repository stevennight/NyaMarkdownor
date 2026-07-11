import { describe, expect, it } from "vitest";
import { isLocalMarkdownLinkHref, resolveLocalMarkdownLinkPath, resolveLocalMarkdownLinkTarget } from "./localMarkdownLinks";

describe("local Markdown links", () => {
  it("recognizes local Markdown file hrefs", () => {
    expect(isLocalMarkdownLinkHref("next.md")).toBe(true);
    expect(isLocalMarkdownLinkHref("../notes/Next%20Note.markdown#intro")).toBe(true);
    expect(isLocalMarkdownLinkHref("../notes/Archive.mdown#intro")).toBe(true);
    expect(isLocalMarkdownLinkHref("../notes/Journal.mkdn")).toBe(true);
    expect(isLocalMarkdownLinkHref("D:/notes/next.txt")).toBe(true);
    expect(isLocalMarkdownLinkHref("file:///D:/notes/next.md#intro")).toBe(true);
  });

  it("ignores anchors, remote URLs, special protocols, and non-Markdown files", () => {
    expect(isLocalMarkdownLinkHref("#intro")).toBe(false);
    expect(isLocalMarkdownLinkHref("https://example.com/next.md")).toBe(false);
    expect(isLocalMarkdownLinkHref("mailto:test@example.com")).toBe(false);
    expect(isLocalMarkdownLinkHref("image.png")).toBe(false);
  });

  it("resolves document-relative links against the current Markdown file", () => {
    expect(resolveLocalMarkdownLinkPath("../shared/Next%20Note.md#intro", "D:/notes/today/current.md")).toBe("D:/notes/shared/Next Note.md");
    expect(resolveLocalMarkdownLinkPath("sibling.md?raw=1", "D:\\notes\\today\\current.md")).toBe("D:\\notes\\today\\sibling.md");
  });

  it("keeps heading anchors when resolving local Markdown link targets", () => {
    expect(resolveLocalMarkdownLinkTarget("../shared/Next%20Note.md#Heading%201", "D:/notes/today/current.md")).toEqual({
      path: "D:/notes/shared/Next Note.md",
      anchorIds: ["Heading 1", "heading-1"]
    });
    expect(resolveLocalMarkdownLinkTarget("sibling.md?raw=1#already-slugged", "D:\\notes\\today\\current.md")).toEqual({
      path: "D:\\notes\\today\\sibling.md",
      anchorIds: ["already-slugged"]
    });
  });

  it("returns absolute local Markdown paths directly", () => {
    expect(resolveLocalMarkdownLinkPath("C:/Users/Steve/Notes/next.md", "D:/notes/current.md")).toBe("C:\\Users\\Steve\\Notes\\next.md");
    expect(resolveLocalMarkdownLinkPath("/home/user/notes/next.md", "/home/user/current.md")).toBe("/home/user/notes/next.md");
  });

  it("resolves file URL Markdown links as local paths", () => {
    expect(resolveLocalMarkdownLinkTarget("file:///D:/notes/Next%20Note.md#Heading%201", "D:/notes/current.md")).toEqual({
      path: "D:\\notes\\Next Note.md",
      anchorIds: ["Heading 1", "heading-1"]
    });
    expect(resolveLocalMarkdownLinkPath("file:///home/user/notes/next.md", "/home/user/current.md")).toBe("/home/user/notes/next.md");
  });

  it("cannot resolve relative links without a saved document path", () => {
    expect(resolveLocalMarkdownLinkPath("next.md", null)).toBeNull();
  });
});
