import { describe, expect, it } from "vitest";
import { tableActionContextFromSelection } from "./tableActionContext";
import { findTableAtOffset } from "./tables";

const source = [
  "Intro",
  "",
  "| A |",
  "| --- |",
  "| 1 |",
  "",
  "Between",
  "",
  "| B | C |",
  "| --- | --- |",
  "| 2 | 3 |"
].join("\n");

describe("table action context", () => {
  it("uses the live selection table before a stale fallback table", () => {
    const fallback = findTableAtOffset(source, source.indexOf("| A |"));
    const secondTableOffset = source.indexOf("| 2 |");

    const context = tableActionContextFromSelection(
      source,
      { from: secondTableOffset, to: secondTableOffset },
      fallback
    );

    expect(context?.table.table.headers).toEqual(["B", "C"]);
  });

  it("falls back to the rendered active table when selection has moved into chrome", () => {
    const fallback = findTableAtOffset(source, source.indexOf("| B | C |"));

    const context = tableActionContextFromSelection(
      source,
      { from: 0, to: 0 },
      fallback
    );

    expect(context?.table.table.headers).toEqual(["B", "C"]);
  });

  it("returns null when neither selection nor fallback points at a table", () => {
    expect(tableActionContextFromSelection("plain text", { from: 0, to: 0 }, null)).toBeNull();
  });
});
