import { describe, expect, it } from "vitest";
import { findMatchIndexAtSelection, findNextMatchIndex, findTextMatches, getSelectionAfterReplace, replaceAllText, replaceTextRange } from "./search";

describe("search helpers", () => {
  it("finds literal matches with case sensitivity options", () => {
    expect(findTextMatches("Alpha alpha", "alpha", { caseSensitive: false, wholeWord: false })).toEqual([
      { from: 0, to: 5 },
      { from: 6, to: 11 }
    ]);

    expect(findTextMatches("Alpha alpha", "alpha", { caseSensitive: true, wholeWord: false })).toEqual([
      { from: 6, to: 11 }
    ]);
  });

  it("can restrict matches to whole words", () => {
    expect(findTextMatches("cat scatter cat_ cat", "cat", { caseSensitive: false, wholeWord: true })).toEqual([
      { from: 0, to: 3 },
      { from: 17, to: 20 }
    ]);
  });

  it("wraps next and previous match lookup", () => {
    const matches = findTextMatches("one two one", "one", { caseSensitive: false, wholeWord: false });
    expect(findNextMatchIndex(matches, 1, "next")).toBe(1);
    expect(findNextMatchIndex(matches, 11, "next")).toBe(0);
    expect(findNextMatchIndex(matches, 8, "previous")).toBe(0);
    expect(findNextMatchIndex(matches, 0, "previous")).toBe(1);
  });

  it("detects whether the current selection is a match", () => {
    const matches = findTextMatches("one two one", "one", { caseSensitive: false, wholeWord: false });
    expect(findMatchIndexAtSelection(matches, { from: 8, to: 11 })).toBe(1);
    expect(findMatchIndexAtSelection(matches, { from: 4, to: 7 })).toBe(-1);
  });

  it("replaces one range or every match", () => {
    expect(replaceTextRange("hello world", { from: 6, to: 11 }, "markdown")).toBe("hello markdown");
    expect(replaceAllText("one two one", "one", "1", { caseSensitive: false, wholeWord: true })).toEqual({
      text: "1 two 1",
      count: 2
    });
  });

  it("selects the next match after replacing the current one", () => {
    expect(getSelectionAfterReplace("alpha beta alpha", "alpha", "omega", { from: 0, to: 5 }, { caseSensitive: false, wholeWord: true })).toEqual({
      from: 11,
      to: 16
    });
  });
});
