import { describe, expect, it } from "vitest";
import { activeRichHeadingIndexAtPosition, richHeadingPositionAtIndex } from "./richOutlineNavigation";

describe("rich outline navigation", () => {
  it("returns the nearest visual heading at or above the selection", () => {
    const positions = [1, 42, 96, 180];

    expect(activeRichHeadingIndexAtPosition(positions, 0)).toBeNull();
    expect(activeRichHeadingIndexAtPosition(positions, 1)).toBe(0);
    expect(activeRichHeadingIndexAtPosition(positions, 70)).toBe(1);
    expect(activeRichHeadingIndexAtPosition(positions, 999)).toBe(3);
  });

  it("handles empty heading sets and invalid cursor positions", () => {
    expect(activeRichHeadingIndexAtPosition([], 10)).toBeNull();
    expect(activeRichHeadingIndexAtPosition([1], Number.NaN)).toBeNull();
  });

  it("resolves a visual heading index without leaking invalid positions", () => {
    expect(richHeadingPositionAtIndex([1, 42, 96], 1)).toBe(42);
    expect(richHeadingPositionAtIndex([1, 42, 96], -1)).toBeNull();
    expect(richHeadingPositionAtIndex([1, 42, 96], 3)).toBeNull();
    expect(richHeadingPositionAtIndex([1, Number.NaN], 1)).toBeNull();
  });
});
