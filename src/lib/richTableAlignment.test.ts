import { describe, expect, it } from "vitest";
import { richTableColumnAlignmentTransaction } from "./richTableAlignment";
import { tableState } from "./richTableSelection.testHelpers";

describe("rich table column alignment", () => {
  it("updates every cell in the current visual-table column", () => {
    const state = tableState();
    const transaction = richTableColumnAlignmentTransaction(state, "right");
    const next = state.apply(transaction!);
    const alignments: Array<string | null> = [];

    next.doc.descendants((node) => {
      if (node.type.spec.tableRole === "cell") alignments.push(node.attrs.align ?? null);
    });

    expect(alignments).toEqual(["right", null, "right", null]);
  });

  it("clears visual-table column alignment without changing other columns", () => {
    const state = tableState({ firstColumnAlignment: "center", secondColumnAlignment: "left" });
    const transaction = richTableColumnAlignmentTransaction(state, null);
    const next = state.apply(transaction!);
    const alignments: Array<string | null> = [];

    next.doc.descendants((node) => {
      if (node.type.spec.tableRole === "cell") alignments.push(node.attrs.align ?? null);
    });

    expect(alignments).toEqual([null, "left", null, "left"]);
  });
});
