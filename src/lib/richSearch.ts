import { Extension, type Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { TextRange } from "./editorCommands";
import { findTextMatches, type SearchMatch, type SearchOptions } from "./search";

export type RichSearchHighlightState = {
  matches: readonly TextRange[];
  active: TextRange | null;
};

const richSearchHighlightKey = new PluginKey<DecorationSet>("richSearchHighlight");

export const richSearchHighlightExtension = Extension.create({
  name: "richSearchHighlight",

  addProseMirrorPlugins() {
    return [new Plugin<DecorationSet>({
      key: richSearchHighlightKey,
      state: {
        init: () => DecorationSet.empty,
        apply(transaction, decorations) {
          const update = transaction.getMeta(richSearchHighlightKey) as RichSearchHighlightState | undefined;
          if (update) return buildRichSearchDecorations(transaction.doc, update);
          return decorations.map(transaction.mapping, transaction.doc);
        }
      },
      props: {
        decorations: (state) => richSearchHighlightKey.getState(state) ?? DecorationSet.empty
      }
    })];
  }
});

export function setRichSearchHighlights(editor: Editor | null, state: RichSearchHighlightState): void {
  if (!editor || editor.isDestroyed) return;
  editor.view.dispatch(editor.state.tr.setMeta(richSearchHighlightKey, state));
}

export function findRichTextMatches(
  document: ProseMirrorNode,
  query: string,
  options: SearchOptions,
  limit = 10000
): SearchMatch[] {
  if (!query || limit <= 0) return [];

  const matches: SearchMatch[] = [];
  let runStart = 0;
  let runEnd = 0;
  let runText = "";

  const flushRun = () => {
    if (!runText || matches.length >= limit) return;
    const remaining = limit - matches.length;
    for (const match of findTextMatches(runText, query, options, remaining)) {
      matches.push({ from: runStart + match.from, to: runStart + match.to });
    }
    runText = "";
  };

  document.descendants((node, position) => {
    if (!node.isText || !node.text || matches.length >= limit) return;

    if (runText && position !== runEnd) flushRun();
    if (!runText) runStart = position;
    runText += node.text;
    runEnd = position + node.nodeSize;
  });
  flushRun();

  return matches;
}

function buildRichSearchDecorations(
  document: ProseMirrorNode,
  state: RichSearchHighlightState
): DecorationSet {
  const decorations: Decoration[] = [];

  for (const match of state.matches) {
    const from = Math.max(0, Math.min(match.from, document.content.size));
    const to = Math.max(from, Math.min(match.to, document.content.size));
    if (to <= from) continue;

    decorations.push(Decoration.inline(from, to, {
      class: sameRange(match, state.active)
        ? "rich-search-match rich-search-match-active"
        : "rich-search-match"
    }));
  }

  return DecorationSet.create(document, decorations);
}

function sameRange(left: TextRange, right: TextRange | null): boolean {
  return Boolean(right && left.from === right.from && left.to === right.to);
}
