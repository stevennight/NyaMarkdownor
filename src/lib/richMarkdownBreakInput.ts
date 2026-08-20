import { InputRule, type InputRuleMatch } from "@tiptap/core";
import type { NodeType, ResolvedPos } from "@tiptap/pm/model";

const RICH_MARKDOWN_BREAK_INPUT = /<br\s*\/?>$/i;

export function findRichMarkdownBreakInput(text: string): InputRuleMatch | null {
  const match = RICH_MARKDOWN_BREAK_INPUT.exec(text);
  if (!match || isEscapedCharacter(text, match.index)) return null;

  return {
    index: match.index,
    text: match[0],
    data: { raw: match[0] }
  };
}

export function createRichMarkdownBreakInputRule(
  protectedInlineType: NodeType,
  hardBreakType: NodeType
): InputRule {
  return new InputRule({
    find: findRichMarkdownBreakInput,
    handler: ({ state, range, match }) => {
      const raw = typeof match.data?.raw === "string" ? match.data.raw : match[0];
      const inTableCell = isInsideTableCell(state.doc.resolve(range.to));
      const type = inTableCell ? hardBreakType : protectedInlineType;
      const attrs = inTableCell
        ? { markdownMarker: "<br>" }
        : { raw, kind: "html", label: "" };

      state.tr.replaceWith(range.from, range.to, type.create(attrs));
    }
  });
}

function isInsideTableCell(position: ResolvedPos): boolean {
  for (let depth = position.depth; depth > 0; depth -= 1) {
    const tableRole = position.node(depth).type.spec.tableRole;
    if (tableRole === "cell" || tableRole === "header_cell") return true;
  }

  return false;
}

function isEscapedCharacter(text: string, index: number): boolean {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}
