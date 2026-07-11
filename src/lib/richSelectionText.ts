import type { TextRange } from "./editorCommands";

export type RichTextSegment = TextRange & {
  text: string;
};

export function uniqueRichTextSelectionForText(
  segments: readonly RichTextSegment[],
  selectedText: string
): TextRange | null {
  if (!selectedText) return null;

  let match: TextRange | null = null;
  for (const segment of segments) {
    const index = segment.text.indexOf(selectedText);
    if (index < 0) continue;
    if (match || segment.text.indexOf(selectedText, index + 1) >= 0) return null;
    match = {
      from: segment.from + index,
      to: segment.from + index + selectedText.length
    };
  }

  return match;
}
