import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import { EMPTY_FORMAT_STATE, type BlockStyle, type FormatState } from "./formatState";

/**
 * Formatting at `position` in the source editor, read from the Markdown syntax
 * tree so it costs a tree walk rather than a document scan per keystroke.
 */
export function sourceFormatStateAt(state: EditorState, position: number): FormatState {
  const tree = syntaxTree(state);
  const pos = Math.max(0, Math.min(position, state.doc.length));
  const line = state.doc.lineAt(pos);
  const indent = /^\s*/.exec(line.text)?.[0].length ?? 0;
  const result: FormatState = { ...EMPTY_FORMAT_STATE };

  let listSeen = false;
  for (let node: SyntaxNode | null = tree.resolveInner(line.from + indent, 1); node; node = node.parent) {
    const name = node.name;
    const heading = /^(?:ATX|Setext)Heading(\d)$/.exec(name);
    if (heading) result.block = `heading-${heading[1]}` as BlockStyle;
    else if (name === "FencedCode" || name === "CodeBlock") result.block = "code-block";
    else if (name === "Blockquote") result.blockquote = true;
    else if (name === "ListItem" && !listSeen) {
      listSeen = true;
      const kind = node.parent?.name;
      if (node.getChild("Task")) result.taskList = true;
      else if (kind === "BulletList") result.bulletList = true;
      else if (kind === "OrderedList") result.orderedList = true;
    }
  }

  const inlineSide = pos > line.from ? -1 : 1;
  for (let node: SyntaxNode | null = tree.resolveInner(pos, inlineSide); node; node = node.parent) {
    switch (node.name) {
      case "StrongEmphasis":
        result.bold = true;
        break;
      case "Emphasis":
        result.italic = true;
        break;
      case "Strikethrough":
        result.strike = true;
        break;
      case "InlineCode":
        result.code = true;
        break;
      case "Link":
      case "Autolink":
        result.link = true;
        break;
    }
  }

  return result;
}
