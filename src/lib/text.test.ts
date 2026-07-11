import { describe, expect, it } from "vitest";
import { padVisual, visualWidth } from "./text";

describe("text visual width", () => {
  it("counts CJK and emoji as wide display cells", () => {
    expect(visualWidth("abc")).toBe(3);
    expect(visualWidth("你好")).toBe(4);
    expect(visualWidth("✅")).toBe(2);
    expect(visualWidth("🧠")).toBe(2);
  });

  it("does not pad combining marks or variation selectors as visible columns", () => {
    expect(visualWidth("e\u0301")).toBe(1);
    expect(visualWidth("✍️")).toBe(2);
    expect(padVisual("✅", 4)).toBe("✅  ");
  });
});
