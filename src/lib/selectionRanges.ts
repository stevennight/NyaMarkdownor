export type TextSelectionRange = {
  from: number;
  to: number;
};

export function intersectsNonEmptySelection(from: number, to: number, selections: readonly TextSelectionRange[]): boolean {
  if (to <= from) return false;

  return selections.some((selection) => {
    const selectionFrom = Math.min(selection.from, selection.to);
    const selectionTo = Math.max(selection.from, selection.to);

    return selectionTo > selectionFrom && from < selectionTo && to > selectionFrom;
  });
}
