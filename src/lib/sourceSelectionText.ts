import type { TextRange } from "./editorCommands";

export function uniqueSourceSelectionForText(source: string, selectedText: string): TextRange | null {
  if (!selectedText) return null;

  const from = source.indexOf(selectedText);
  if (from < 0 || source.indexOf(selectedText, from + 1) >= 0) return null;

  return { from, to: from + selectedText.length };
}
