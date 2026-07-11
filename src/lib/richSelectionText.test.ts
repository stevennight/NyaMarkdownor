import { describe, expect, it } from "vitest";
import { uniqueRichTextSelectionForText } from "./richSelectionText";

describe("rich selection text", () => {
  it("maps a unique selected text fragment to its rich document range", () => {
    expect(uniqueRichTextSelectionForText([
      { from: 5, to: 13, text: "Heading!" },
      { from: 16, to: 29, text: "Selected text" }
    ], "Selected")).toEqual({ from: 16, to: 24 });
  });

  it("does not guess when the text occurs more than once", () => {
    expect(uniqueRichTextSelectionForText([
      { from: 1, to: 5, text: "same" },
      { from: 8, to: 12, text: "same" }
    ], "same")).toBeNull();
  });

  it("does not map text that repeats inside one node", () => {
    expect(uniqueRichTextSelectionForText([
      { from: 1, to: 10, text: "one one" }
    ], "one")).toBeNull();
  });
});
