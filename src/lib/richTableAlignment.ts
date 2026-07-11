import type { EditorState, Transaction } from "@tiptap/pm/state";
import { richTableSelectionFor } from "./richTableSelection";

export type RichTableColumnAlignment = "left" | "center" | "right" | null;

export function richTableColumnAlignmentTransaction(
  state: EditorState,
  alignment: RichTableColumnAlignment
): Transaction | null {
  const selection = richTableSelectionFor(state, "select-column");
  if (!selection) return null;

  const transaction = state.tr.setSelection(selection);
  selection.forEachCell((cell, position) => {
    transaction.setNodeMarkup(position, undefined, { ...cell.attrs, align: alignment });
  });
  return transaction;
}
