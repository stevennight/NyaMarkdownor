import { describe, expect, it } from "vitest";
import { uniqueSourceSelectionForText } from "./sourceSelectionText";

describe("source selection text", () => {
  it("maps a unique visual text selection back to Markdown source", () => {
    expect(uniqueSourceSelectionForText("# Notes\n\nA **selected phrase** appears here.", "selected phrase"))
      .toEqual({ from: 13, to: 28 });
  });

  it("does not guess when selected text occurs more than once", () => {
    expect(uniqueSourceSelectionForText("repeat and repeat", "repeat")).toBeNull();
  });

  it("does not map empty or non-source text", () => {
    expect(uniqueSourceSelectionForText("# Notes", "")).toBeNull();
    expect(uniqueSourceSelectionForText("# Notes", "Missing")).toBeNull();
  });
});
