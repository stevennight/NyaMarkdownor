import { describe, expect, it } from "vitest";
import { displayMarkdownDocumentName, suggestedMarkdownCopyName, suggestedMarkdownCopyTarget, suggestedMarkdownDiskVersionName, suggestedMarkdownNameFromContent, suggestedMarkdownSaveAsTarget, suggestedUntitledMarkdownName } from "./fileNames";

describe("file name helpers", () => {
  it("suggests copy names while preserving Markdown-like extensions", () => {
    expect(suggestedMarkdownCopyName("Notes.md")).toBe("Notes copy.md");
    expect(suggestedMarkdownCopyName("Book.markdown")).toBe("Book copy.markdown");
    expect(suggestedMarkdownCopyName("Archive.mdown")).toBe("Archive copy.mdown");
    expect(suggestedMarkdownCopyName("Journal.mkdn")).toBe("Journal copy.mkdn");
    expect(suggestedMarkdownCopyName("plain.txt")).toBe("plain copy.txt");
  });

  it("falls back to Markdown for extensionless names", () => {
    expect(suggestedMarkdownCopyName("Draft")).toBe("Draft copy.md");
    expect(suggestedMarkdownCopyName("")).toBe("Untitled copy.md");
  });

  it("suggests saved-document Save As targets in the current folder", () => {
    expect(suggestedMarkdownSaveAsTarget({
      fileName: "Notes.md",
      filePath: "D:/notes/projects/Notes.md",
      markdown: "# Better Name"
    })).toBe("D:/notes/projects/Notes.md");
    expect(suggestedMarkdownSaveAsTarget({
      fileName: "Untitled.md",
      filePath: null,
      markdown: "# Better Name"
    })).toBe("Better Name.md");
  });

  it("suggests saved-document copy targets beside the current file", () => {
    expect(suggestedMarkdownCopyTarget({
      fileName: "Notes.md",
      filePath: "D:/notes/projects/Notes.md",
      markdown: "# Better Name"
    })).toBe("D:/notes/projects/Notes copy.md");
    expect(suggestedMarkdownCopyTarget({
      fileName: "Book.markdown",
      filePath: "D:\\notes\\Book.markdown",
      markdown: ""
    })).toBe("D:\\notes\\Book copy.markdown");
    expect(suggestedMarkdownCopyTarget({
      fileName: "Untitled.md",
      filePath: null,
      markdown: "# Better Name"
    })).toBe("Better Name copy.md");
  });

  it("suggests unbound disk snapshot names while preserving Markdown-like extensions", () => {
    expect(suggestedMarkdownDiskVersionName("Notes.md")).toBe("Notes disk.md");
    expect(suggestedMarkdownDiskVersionName("Book.markdown")).toBe("Book disk.markdown");
    expect(suggestedMarkdownDiskVersionName("Journal.mdwn")).toBe("Journal disk.mdwn");
    expect(suggestedMarkdownDiskVersionName("plain.txt")).toBe("plain disk.txt");
    expect(suggestedMarkdownDiskVersionName("Draft")).toBe("Draft disk.md");
  });

  it("suggests stable untitled draft names without colliding with open drafts", () => {
    expect(suggestedUntitledMarkdownName([])).toBe("Untitled.md");
    expect(suggestedUntitledMarkdownName(["Untitled.md"])).toBe("Untitled 2.md");
    expect(suggestedUntitledMarkdownName(["Untitled.md", "Untitled 2.md", "Untitled 4.txt"])).toBe("Untitled 3.md");
    expect(suggestedUntitledMarkdownName(["Project.md", "untitled_2.markdown"])).toBe("Untitled.md");
  });

  it("derives draft display names from Markdown headings and body text", () => {
    expect(suggestedMarkdownNameFromContent("# Project Plan\n\nBody")).toBe("Project Plan.md");
    expect(suggestedMarkdownNameFromContent("- first useful line")).toBe("first useful line.md");
    expect(suggestedMarkdownNameFromContent("# 中文 标题")).toBe("中文 标题.md");
  });

  it("derives draft names from the document body instead of front matter properties", () => {
    expect(suggestedMarkdownNameFromContent([
      "---",
      "name: workflow-skill",
      "description: xxx",
      "---",
      "# Workflow Guide"
    ].join("\n"))).toBe("Workflow Guide.md");
  });

  it("derives draft names from shortcut reference links in titles", () => {
    expect(suggestedMarkdownNameFromContent([
      "# [Project Plan]",
      "",
      "[Project Plan]: ./plan.md"
    ].join("\n"))).toBe("Project Plan.md");
    expect(suggestedMarkdownNameFromContent([
      "[Inbox Note]",
      "",
      "[Inbox Note]: ./inbox.md"
    ].join("\n"))).toBe("Inbox Note.md");
  });

  it("sanitizes derived draft names for local filesystems", () => {
    expect(suggestedMarkdownNameFromContent("# Bad: <Name> / Draft?")).toBe("Bad Name Draft.md");
    expect(suggestedMarkdownNameFromContent("   ")).toBeNull();
  });

  it("uses derived names only for untitled drafts", () => {
    expect(displayMarkdownDocumentName({
      fileName: "Untitled.md",
      filePath: null,
      markdown: "# Better Name"
    })).toBe("Better Name.md");

    expect(displayMarkdownDocumentName({
      fileName: "Saved.md",
      filePath: "D:/notes/Saved.md",
      markdown: "# Better Name"
    })).toBe("Saved.md");
  });
});
