import { Slice, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";

type WordListItem = {
  level: number;
  ordered: boolean;
  start: number | null;
  content: string;
};

const PARAGRAPH_PATTERN = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
const WORD_LIST_STYLE = /mso-list:\s*l\d+\s+level(\d+)/i;
const SUPPORT_LISTS_BLOCK = /<!(?:--)?\[if !supportLists\](?:--)?>([\s\S]*?)<!(?:--)?\[endif\](?:--)?>/i;
const ORDERED_MARKER = /^\(?(\d{1,9}|[a-zA-Z]|[ivxlcdmIVXLCDM]{1,8})[.)）、]$/;
const SYMBOL_FONT = /font-family:\s*["']?(?:Wingdings|Symbol)/i;

/**
 * Word writes list items as styled paragraphs whose number or bullet is a
 * hidden text run. Turn runs of those paragraphs into real nested lists so a
 * pasted Word list stays a list.
 */
export function convertWordListParagraphs(html: string): string {
  if (!/mso-list/i.test(html)) return html;

  let output = "";
  let cursor = 0;
  let pending: WordListItem[] = [];
  let pendingEnd = 0;

  const flush = () => {
    if (!pending.length) return;
    output += wordListHtml(pending);
    pending = [];
    cursor = pendingEnd;
  };

  for (const match of html.matchAll(PARAGRAPH_PATTERN)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const item = wordListItem(match[1], match[2]);

    if (!item) {
      flush();
      continue;
    }

    const between = html.slice(pending.length ? pendingEnd : cursor, start);
    if (pending.length && between.trim()) flush();
    if (!pending.length) output += html.slice(cursor, start);

    pending.push(item);
    pendingEnd = end;
  }

  flush();
  return output + html.slice(cursor);
}

function wordListItem(attributes: string, inner: string): WordListItem | null {
  const level = attributes.match(WORD_LIST_STYLE);
  if (!level) return null;

  const markerBlock = inner.match(SUPPORT_LISTS_BLOCK);
  const markerHtml = markerBlock?.[1] ?? "";
  const marker = htmlText(markerHtml);
  const ordered = !SYMBOL_FONT.test(markerHtml) && ORDERED_MARKER.test(marker);
  const number = ordered ? Number.parseInt(marker.replace(/^\(/, ""), 10) : Number.NaN;

  return {
    level: Number(level[1]),
    ordered,
    start: Number.isFinite(number) ? number : null,
    content: inner
      .replace(SUPPORT_LISTS_BLOCK, "")
      .replace(/<o:p>[\s\S]*?<\/o:p>/gi, "")
      .trim()
  };
}

function wordListHtml(items: readonly WordListItem[]): string {
  const open: Array<"ol" | "ul"> = [];
  let html = "";

  for (const item of items) {
    const tag = item.ordered ? "ol" : "ul";
    const level = Math.min(Math.max(1, item.level), open.length + 1);

    while (open.length > level) html += `</li></${open.pop()}>`;

    if (open.length === level && open[level - 1] === tag) {
      html += "</li>";
    } else {
      if (open.length === level) html += `</li></${open.pop()}>`;
      const start = item.ordered && item.start !== null && item.start !== 1 ? ` start="${item.start}"` : "";
      html += `<${tag}${start}>`;
      open.push(tag);
    }

    html += `<li>${item.content}`;
  }

  while (open.length) html += `</li></${open.pop()}>`;
  return html;
}

function htmlText(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * ProseMirror opens a pasted slice as far as it can, which merges a pasted
 * heading, code block or the first list item into the paragraph at the cursor.
 * Close the start of the slice in that case so the first block keeps its type.
 * Lists and quotes are only kept apart from top-level paragraphs; inside a list
 * item the open slice is what joins pasted items into the current list.
 */
export function richPasteSliceKeepingBlockType(slice: Slice, state: EditorState): Slice {
  const { $from } = state.selection;
  const target = $from.parent;
  if (!target.isTextblock || target.content.size === 0) return slice;

  const keepsOwnBlock = (node: ProseMirrorNode | null) => Boolean(
    node
    && node.type.name !== "paragraph"
    && node.type !== target.type
    && (node.isTextblock || $from.depth === 1)
  );
  const openStart = keepsOwnBlock(slice.content.firstChild) ? 0 : slice.openStart;
  const openEnd = keepsOwnBlock(slice.content.lastChild) ? 0 : slice.openEnd;
  if (openStart === slice.openStart && openEnd === slice.openEnd) return slice;

  return new Slice(slice.content, openStart, openEnd);
}
