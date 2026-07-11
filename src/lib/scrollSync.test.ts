import { describe, expect, it } from "vitest";
import { getScrollProgress, setScrollProgress, type ScrollMetrics } from "./scrollSync";

describe("scroll sync helpers", () => {
  it("returns normalized scroll progress", () => {
    expect(getScrollProgress({ scrollTop: 50, scrollHeight: 300, clientHeight: 100 })).toBe(0.25);
  });

  it("clamps impossible progress values", () => {
    expect(getScrollProgress({ scrollTop: -10, scrollHeight: 300, clientHeight: 100 })).toBe(0);
    expect(getScrollProgress({ scrollTop: 250, scrollHeight: 300, clientHeight: 100 })).toBe(1);
  });

  it("sets scrollTop from normalized progress", () => {
    const element: ScrollMetrics = { scrollTop: 0, scrollHeight: 500, clientHeight: 100 };
    setScrollProgress(element, 0.5);
    expect(element.scrollTop).toBe(200);
  });

  it("handles non-scrollable content", () => {
    const element: ScrollMetrics = { scrollTop: 30, scrollHeight: 100, clientHeight: 100 };
    expect(getScrollProgress(element)).toBe(0);
    setScrollProgress(element, 0.8);
    expect(element.scrollTop).toBe(0);
  });
});
