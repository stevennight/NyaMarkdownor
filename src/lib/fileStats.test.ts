import { describe, expect, it } from "vitest";
import { diskChangeKind, diskContentChangedSinceLastSave, diskNeedsReview, fileChangedOnDisk, sameFileStats } from "./fileStats";

describe("file stats helpers", () => {
  it("matches identical file stats", () => {
    expect(sameFileStats({ modifiedMs: 10, size: 42 }, { modifiedMs: 10, size: 42 })).toBe(true);
  });

  it("detects changed modified time or size", () => {
    expect(fileChangedOnDisk({ modifiedMs: 10, size: 42 }, { modifiedMs: 11, size: 42 })).toBe(true);
    expect(fileChangedOnDisk({ modifiedMs: 10, size: 42 }, { modifiedMs: 10, size: 43 })).toBe(true);
  });

  it("does not claim conflict when either side is unknown", () => {
    expect(fileChangedOnDisk(null, { modifiedMs: 10, size: 42 })).toBe(false);
    expect(fileChangedOnDisk({ modifiedMs: 10, size: 42 }, null)).toBe(false);
  });

  it("requires review when a saved disk file has no trusted stats baseline or can no longer be verified", () => {
    const opened = { modifiedMs: 10, size: 42 };

    expect(diskNeedsReview(null, null)).toBe(true);
    expect(diskNeedsReview(null, opened)).toBe(true);
    expect(diskNeedsReview(opened, null)).toBe(true);
    expect(diskNeedsReview(opened, opened)).toBe(false);
    expect(diskNeedsReview(opened, { modifiedMs: 11, size: 42 })).toBe(true);
  });

  it("distinguishes metadata-only touches from disk content changes", () => {
    expect(diskContentChangedSinceLastSave("# Draft", "# Draft")).toBe(false);
    expect(diskContentChangedSinceLastSave("# Draft", "# Draft\n\nExternal edit")).toBe(true);
  });

  it("classifies disk changes by metadata and content", () => {
    const opened = { modifiedMs: 10, size: 42 };
    const touched = { modifiedMs: 11, size: 42 };

    expect(diskChangeKind(opened, opened, "# Draft", "# Draft")).toBe("none");
    expect(diskChangeKind(opened, touched, "# Draft", "# Draft")).toBe("metadata-only");
    expect(diskChangeKind(opened, touched, "# Draft", "# Changed")).toBe("content");
  });
});
