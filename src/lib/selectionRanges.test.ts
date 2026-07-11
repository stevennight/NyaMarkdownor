import { describe, expect, it } from "vitest";
import { intersectsNonEmptySelection } from "./selectionRanges";

describe("selection ranges", () => {
  it("detects overlap with a non-empty selection", () => {
    expect(intersectsNonEmptySelection(10, 12, [{ from: 8, to: 11 }])).toBe(true);
    expect(intersectsNonEmptySelection(10, 12, [{ from: 11, to: 20 }])).toBe(true);
  });

  it("does not treat adjacent or empty selections as overlap", () => {
    expect(intersectsNonEmptySelection(10, 12, [{ from: 12, to: 18 }])).toBe(false);
    expect(intersectsNonEmptySelection(10, 12, [{ from: 10, to: 10 }])).toBe(false);
  });

  it("supports reversed and multiple selections", () => {
    expect(intersectsNonEmptySelection(10, 12, [{ from: 30, to: 20 }, { from: 13, to: 9 }])).toBe(true);
  });
});
