import { describe, expect, it } from "vitest";
import { centeredScrollTop, getScrollProgress, setScrollProgress, type ScrollMetrics } from "./scrollSync";

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

  it("centers targets below and above the current viewport", () => {
    const viewport = { top: 100, bottom: 500 };

    expect(centeredScrollTop(200, viewport, { top: 700, bottom: 720 })).toBe(610);
    expect(centeredScrollTop(610, viewport, { top: -100, bottom: -80 })).toBe(220);
  });

  it("clamps centered scroll positions at the top", () => {
    expect(centeredScrollTop(30, { top: 100, bottom: 500 }, { top: 20, bottom: 40 })).toBe(0);
  });
});
