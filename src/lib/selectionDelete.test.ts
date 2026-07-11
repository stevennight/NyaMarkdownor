import { describe, expect, it } from "vitest";
import { deleteSelectionRanges } from "./selectionDelete";

describe("selection deletion", () => {
  it("deletes multiple selections in source order", () => {
    expect(deleteSelectionRanges("alpha beta gamma", [
      { from: 11, to: 16 },
      { from: 0, to: 5 }
    ])).toEqual({
      ranges: [
        { from: 0, to: 5 },
        { from: 11, to: 16 }
      ],
      markdown: " beta ",
      selection: { from: 0, to: 0 }
    });
  });

  it("merges overlapping ranges before deleting", () => {
    expect(deleteSelectionRanges("abcdef", [
      { from: 1, to: 4 },
      { from: 3, to: 5 }
    ])).toEqual({
      ranges: [{ from: 1, to: 5 }],
      markdown: "af",
      selection: { from: 1, to: 1 }
    });
  });

  it("returns null for empty selections", () => {
    expect(deleteSelectionRanges("abcdef", [{ from: 2, to: 2 }])).toBeNull();
  });
});
