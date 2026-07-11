import { describe, expect, it } from "vitest";
import { localPathKey, sameLocalPath } from "./localPathKeys";

describe("local path keys", () => {
  it("normalizes Windows drive paths for stable local comparisons", () => {
    expect(localPathKey("D:\\Notes\\Draft.md")).toBe("d:/notes/draft.md");
    expect(localPathKey(" d:/notes/DRAFT.md ")).toBe("d:/notes/draft.md");
  });

  it("normalizes Windows UNC paths for stable local comparisons", () => {
    expect(localPathKey("\\\\Server\\Share\\Draft.md")).toBe("//server/share/draft.md");
  });

  it("keeps non-Windows-like paths case-sensitive", () => {
    expect(localPathKey("/Users/me/Notes/Draft.md")).toBe("/Users/me/Notes/Draft.md");
  });

  it("compares Windows local paths by normalized identity", () => {
    expect(sameLocalPath("D:\\Notes\\Draft.md", "d:/notes/draft.md")).toBe(true);
    expect(sameLocalPath("D:/Notes/Draft.md", "D:/Notes/Other.md")).toBe(false);
  });

  it("does not treat missing paths as the same file", () => {
    expect(sameLocalPath(null, null)).toBe(false);
    expect(sameLocalPath("D:/Notes/Draft.md", null)).toBe(false);
    expect(sameLocalPath(" ", " ")).toBe(false);
  });
});
