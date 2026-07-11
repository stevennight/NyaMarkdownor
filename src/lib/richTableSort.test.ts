import { CellSelection } from "@tiptap/pm/tables";
import { describe, expect, it } from "vitest";
import { richTableSortTransaction } from "./richTableSort";
import { tableState } from "./richTableSelection.testHelpers";

function firstColumnValues(state: ReturnType<typeof tableState>): string[] {
  const values: string[] = [];
  state.doc.descendants((node) => {
    if (node.type.spec.tableRole === "row") values.push(node.firstChild?.textContent ?? "");
  });
  return values;
}

describe("rich table sorting", () => {
  it("reorders only visual-table body rows using the shared natural sort rules", () => {
    const state = tableState({ rows: [["Name", "Score"], ["Zeta", "20"], ["Alpha", "3"], ["Mid", "11"]] });
    const transaction = richTableSortTransaction(state, "ascending");
    const next = state.apply(transaction!);

    expect(firstColumnValues(next)).toEqual(["Name", "Alpha", "Mid", "Zeta"]);
    expect(next.selection).toBeInstanceOf(CellSelection);
  });

  it("does not create a history entry when the visual table is already sorted", () => {
    const state = tableState({ rows: [["Name", "Score"], ["Alpha", "3"], ["Zeta", "20"]] });

    expect(richTableSortTransaction(state, "ascending")).toBeNull();
  });
});
