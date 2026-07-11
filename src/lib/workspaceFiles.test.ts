import { describe, expect, it } from "vitest";
import { filterWorkspaceFiles, limitWorkspaceFilesForSidebar, sortWorkspaceFiles, sortWorkspaceFilesByModified, suggestedWorkspaceNewMarkdownPath, workspaceFileDepth } from "./workspaceFiles";

describe("workspace files", () => {
  it("sorts files by relative path in a stable, human-friendly order", () => {
    const files = [
      { path: "D:/notes/z.md", relativePath: "z.md" },
      { path: "D:/notes/a/10.md", relativePath: "a/10.md" },
      { path: "D:/notes/a/2.md", relativePath: "a/2.md" }
    ];

    expect(sortWorkspaceFiles(files).map((file) => file.relativePath)).toEqual([
      "a/2.md",
      "a/10.md",
      "z.md"
    ]);
  });

  it("computes display depth from workspace-relative paths", () => {
    expect(workspaceFileDepth("note.md")).toBe(0);
    expect(workspaceFileDepth("folder/note.md")).toBe(1);
    expect(workspaceFileDepth("a\\b\\note.md")).toBe(2);
  });

  it("sorts files by recent modification with path as a stable tie-breaker", () => {
    const files = [
      { path: "D:/notes/z.md", relativePath: "z.md", modifiedMs: 10 },
      { path: "D:/notes/a/10.md", relativePath: "a/10.md", modifiedMs: 30 },
      { path: "D:/notes/a/2.md", relativePath: "a/2.md", modifiedMs: 30 }
    ];

    expect(sortWorkspaceFilesByModified(files).map((file) => file.relativePath)).toEqual([
      "a/2.md",
      "a/10.md",
      "z.md"
    ]);
  });

  it("filters files by name and path terms without changing list order", () => {
    const files = [
      { name: "Inbox.md", relativePath: "Inbox.md" },
      { name: "Project Plan.md", relativePath: "work/Project Plan.md" },
      { name: "Project Log.md", relativePath: "archive/Project Log.md" }
    ];

    expect(filterWorkspaceFiles(files, "project work").map((file) => file.relativePath)).toEqual([
      "work/Project Plan.md"
    ]);
    expect(filterWorkspaceFiles(files, "project").map((file) => file.relativePath)).toEqual([
      "work/Project Plan.md",
      "archive/Project Log.md"
    ]);
  });

  it("limits sidebar rendering while preserving matched file counts", () => {
    const files = Array.from({ length: 6 }, (_item, index) => ({ name: `${index}.md` }));

    expect(limitWorkspaceFilesForSidebar(files, 3)).toEqual({
      files: files.slice(0, 3),
      totalCount: 6,
      hiddenCount: 3,
      limited: true
    });
    expect(limitWorkspaceFilesForSidebar(files, 10)).toEqual({
      files,
      totalCount: 6,
      hiddenCount: 0,
      limited: false
    });
  });

  it("suggests a unique new Markdown path using names from the whole workspace", () => {
    const files = [
      { name: "Untitled.md", relativePath: "Untitled.md" },
      { name: "Untitled 2.md", relativePath: "Untitled 2.md" },
      { name: "Untitled 3.md", relativePath: "drafts/Untitled 3.md" }
    ];

    expect(suggestedWorkspaceNewMarkdownPath("D:\\notes", files)).toBe("D:\\notes\\Untitled 4.md");
    expect(suggestedWorkspaceNewMarkdownPath("/home/me/notes/", [])).toBe("/home/me/notes/Untitled.md");
  });

  it("also avoids names from open tabs before the workspace refreshes", () => {
    const files = [
      { name: "Untitled.md", relativePath: "Untitled.md" }
    ];

    expect(suggestedWorkspaceNewMarkdownPath("D:/notes", files, ["Untitled 2.md", "Untitled 3.md"])).toBe("D:/notes/Untitled 4.md");
  });
});
