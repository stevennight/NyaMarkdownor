import { describe, expect, it } from "vitest";
import { viewMenuFocusIndex } from "./viewMenuNavigation";

describe("view menu keyboard navigation", () => {
  it("targets the first and last items directly", () => {
    expect(viewMenuFocusIndex(4, 2, -1, "first")).toBe(0);
    expect(viewMenuFocusIndex(4, 2, -1, "last")).toBe(3);
  });

  it("moves from the active item when no menu item is focused", () => {
    expect(viewMenuFocusIndex(4, 1, -1, "next")).toBe(2);
    expect(viewMenuFocusIndex(4, 1, -1, "previous")).toBe(0);
  });

  it("wraps arrow navigation from either end", () => {
    expect(viewMenuFocusIndex(4, 0, 3, "next")).toBe(0);
    expect(viewMenuFocusIndex(4, 0, 0, "previous")).toBe(3);
  });

  it("handles an invalid active index and empty menus safely", () => {
    expect(viewMenuFocusIndex(4, -1, -1, "next")).toBe(1);
    expect(viewMenuFocusIndex(0, 0, 0, "next")).toBeNull();
  });
});
