import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { splitMarkdownFrontMatter } from "../lib/markdownFrontMatter";

const frontMatterLine = Decoration.line({ class: "cm-front-matter-line" });
const frontMatterDelimiter = Decoration.mark({ class: "cm-front-matter-delimiter" });
const frontMatterKey = Decoration.mark({ class: "cm-front-matter-key" });

export type MarkdownFrontMatterSyntaxRange = {
  from: number;
  to: number;
  kind: "line" | "delimiter" | "key";
};

export const markdownFrontMatterMarks = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildFrontMatterDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged) this.decorations = buildFrontMatterDecorations(update.view);
    }
  },
  {
    decorations: (value) => value.decorations
  }
);

export function markdownFrontMatterSyntaxRanges(markdown: string): MarkdownFrontMatterSyntaxRange[] {
  const { frontMatter } = splitMarkdownFrontMatter(markdown);
  if (!frontMatter) return [];

  const delimiter = frontMatter.startsWith("+++") ? "+++" : "---";
  const keyPattern = delimiter === "+++"
    ? /^([ \t]*)([A-Za-z_][A-Za-z0-9_.-]*)(?=[ \t]*=)/
    : /^([ \t]*)([A-Za-z_][A-Za-z0-9_.-]*)(?=[ \t]*:)/;
  const ranges: MarkdownFrontMatterSyntaxRange[] = [];
  let lineStart = 0;

  while (lineStart < frontMatter.length) {
    const newlineIndex = frontMatter.indexOf("\n", lineStart);
    const rawLineEnd = newlineIndex === -1 ? frontMatter.length : newlineIndex;
    const lineEnd = rawLineEnd > lineStart && frontMatter[rawLineEnd - 1] === "\r"
      ? rawLineEnd - 1
      : rawLineEnd;
    const line = frontMatter.slice(lineStart, lineEnd);
    ranges.push({ from: lineStart, to: lineEnd, kind: "line" });

    if (line === delimiter) {
      ranges.push({ from: lineStart, to: lineEnd, kind: "delimiter" });
    } else {
      const key = line.match(keyPattern);
      if (key) {
        const keyFrom = lineStart + key[1].length;
        ranges.push({ from: keyFrom, to: keyFrom + key[2].length, kind: "key" });
      }
    }

    if (newlineIndex === -1) break;
    lineStart = newlineIndex + 1;
  }

  return ranges;
}

function buildFrontMatterDecorations(view: EditorView): DecorationSet {
  const decorations = markdownFrontMatterSyntaxRanges(view.state.doc.toString()).map((range) => {
    if (range.kind === "line") return frontMatterLine.range(range.from);
    if (range.kind === "delimiter") return frontMatterDelimiter.range(range.from, range.to);
    return frontMatterKey.range(range.from, range.to);
  });

  return Decoration.set(decorations, true);
}
