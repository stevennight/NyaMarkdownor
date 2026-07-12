import { describe, expect, it } from "vitest";
import {
  diskReviewVersionKey,
  inactiveDiskReviewCandidates,
  shouldPromptForDiskReview,
  tabMatchesDiskReviewCandidate
} from "./diskReview";

describe("disk review tab candidates", () => {
  it("prompts each tab once for a detected disk version", () => {
    const firstVersion = { modifiedMs: 10, size: 5 };
    const firstKey = diskReviewVersionKey("other", firstVersion);

    expect(firstKey).toBe("other\u000010\u00005");
    expect(shouldPromptForDiskReview(undefined, "other", firstVersion)).toBe(true);
    expect(shouldPromptForDiskReview(firstKey ?? undefined, "other", firstVersion)).toBe(false);
    expect(shouldPromptForDiskReview(firstKey ?? undefined, "other", { modifiedMs: 11, size: 5 })).toBe(true);
    expect(shouldPromptForDiskReview(firstKey ?? undefined, "another", firstVersion)).toBe(true);
    expect(shouldPromptForDiskReview(undefined, "other", null)).toBe(false);
  });

  it("checks inactive disk-backed tabs without polling drafts or the active tab", () => {
    expect(inactiveDiskReviewCandidates([
      tab("active", "D:/notes/active.md"),
      tab("draft", null),
      tab("other", "D:/notes/other.md", { modifiedMs: 10, size: 5 })
    ], "active")).toEqual([{
      tabId: "other",
      filePath: "D:/notes/other.md",
      knownStats: { modifiedMs: 10, size: 5 },
      lastSavedMarkdown: "# other"
    }]);
  });

  it("keeps the scan bounded for performance", () => {
    expect(inactiveDiskReviewCandidates([
      tab("a", "D:/a.md"),
      tab("b", "D:/b.md"),
      tab("c", "D:/c.md")
    ], "missing", 2).map((candidate) => candidate.tabId)).toEqual(["a", "b"]);
  });

  it("can rotate a bounded scan so later tabs are not starved", () => {
    const tabs = ["a", "b", "c", "d", "e"].map((id) => tab(id, `D:/${id}.md`));

    expect(inactiveDiskReviewCandidates(tabs, "missing", 2, 0).map((candidate) => candidate.tabId)).toEqual(["a", "b"]);
    expect(inactiveDiskReviewCandidates(tabs, "missing", 2, 2).map((candidate) => candidate.tabId)).toEqual(["c", "d"]);
    expect(inactiveDiskReviewCandidates(tabs, "missing", 2, 4).map((candidate) => candidate.tabId)).toEqual(["e", "a"]);
  });

  it("rejects stale async results after a tab is rebound or edited", () => {
    const candidate = inactiveDiskReviewCandidates([
      tab("other", "D:/notes/other.md", { modifiedMs: 10, size: 5 })
    ], "active")[0];

    expect(tabMatchesDiskReviewCandidate(tab("other", "d:\\notes\\OTHER.md", { modifiedMs: 10, size: 5 }), candidate)).toBe(true);
    expect(tabMatchesDiskReviewCandidate(tab("other", "D:/notes/renamed.md", { modifiedMs: 10, size: 5 }), candidate)).toBe(false);
    expect(tabMatchesDiskReviewCandidate(tab("other", "D:/notes/other.md", { modifiedMs: 11, size: 5 }), candidate)).toBe(false);
    expect(tabMatchesDiskReviewCandidate({ ...tab("other", "D:/notes/other.md", { modifiedMs: 10, size: 5 }), document: { ...tab("other", "D:/notes/other.md", { modifiedMs: 10, size: 5 }).document, lastSavedMarkdown: "# changed" } }, candidate)).toBe(false);
  });
});

function tab(id: string, filePath: string | null, fileStats: { modifiedMs: number; size: number } | null = null) {
  return {
    id,
    document: {
      filePath,
      fileStats,
      lastSavedMarkdown: `# ${id}`
    }
  };
}
