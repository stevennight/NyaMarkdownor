import { parseIndentedBlocks, type MarkdownLexerConfiguration, type MarkdownToken } from "@tiptap/core";

// Tiptap's task-list tokenizer, except that a nested task list is no longer the
// only thing kept from an item's nested content: blocks after it (for example a
// continuation paragraph below the sub-tasks) are parsed instead of dropped.

const TASK_ITEM_PATTERN = /^(\s*)([-+*])\s+\[([ xX])\]\s+(.*)$/;

function taskItemConfig(lexer: MarkdownLexerConfiguration, customNestedParser: (content: string) => unknown[] | undefined) {
  return {
    itemPattern: TASK_ITEM_PATTERN,
    extractItemData: (match: RegExpMatchArray) => ({
      indentLevel: match[1].length,
      mainContent: match[4],
      checked: match[3].toLowerCase() === "x"
    }),
    createToken: (data: { mainContent: string; indentLevel: number; checked: boolean }, nestedTokens?: unknown[]) => ({
      type: "taskItem",
      raw: "",
      mainContent: data.mainContent,
      indentLevel: data.indentLevel,
      checked: data.checked,
      text: data.mainContent,
      tokens: lexer.inlineTokens(data.mainContent),
      nestedTokens
    }),
    customNestedParser
  };
}

export const taskListMarkdownTokenizer = {
  name: "taskList",
  level: "block" as const,
  start(src: string) {
    const index = src.match(/^\s*[-+*]\s+\[([ xX])\]\s+/)?.index;
    return index !== undefined ? index : -1;
  },
  tokenize(src: string, _tokens: MarkdownToken[], lexer: MarkdownLexerConfiguration) {
    const parseNestedContent = (content: string): unknown[] => {
      const nested = parseIndentedBlocks(content, taskItemConfig(lexer, parseNestedContent), lexer);
      if (!nested) return lexer.blockTokens(content);

      const tokens: unknown[] = [{ type: "taskList", raw: nested.raw, items: nested.items }];
      const rest = content.slice(nested.raw.length);
      if (rest.trim()) tokens.push(...lexer.blockTokens(rest.replace(/^\n+/, "")));
      return tokens;
    };

    const result = parseIndentedBlocks(src, taskItemConfig(lexer, parseNestedContent), lexer);
    if (!result) return undefined;
    return { type: "taskList", raw: result.raw, items: result.items } as unknown as MarkdownToken;
  }
};
