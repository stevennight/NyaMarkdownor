import { RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import type { TextRange } from "../lib/editorCommands";

export type SearchHighlightState = {
  matches: readonly TextRange[];
  active: TextRange | null;
};

export const setSearchHighlights = StateEffect.define<SearchHighlightState>();

const searchMatch = Decoration.mark({ class: "cm-search-match" });
const activeSearchMatch = Decoration.mark({ class: "cm-search-match cm-search-match-active" });

export const searchHighlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    let next = decorations.map(transaction.changes);

    for (const effect of transaction.effects) {
      if (effect.is(setSearchHighlights)) {
        next = buildSearchDecorations(transaction.state.doc.length, effect.value);
      }
    }

    return next;
  },
  provide: (field) => EditorView.decorations.from(field)
});

function buildSearchDecorations(docLength: number, state: SearchHighlightState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  for (const match of state.matches) {
    const from = Math.max(0, Math.min(match.from, docLength));
    const to = Math.max(from, Math.min(match.to, docLength));
    if (to <= from) continue;

    builder.add(from, to, sameRange(match, state.active) ? activeSearchMatch : searchMatch);
  }

  return builder.finish();
}

function sameRange(left: TextRange, right: TextRange | null): boolean {
  return Boolean(right && left.from === right.from && left.to === right.to);
}
