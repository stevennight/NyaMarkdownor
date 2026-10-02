import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";
import { joinBackward } from "@tiptap/pm/commands";
import { TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";

type Dispatch = ((transaction: Transaction) => void) | undefined;

const LIST_ITEM_TYPES = new Set(["listItem", "taskItem"]);

type ListItemCursor = {
  $from: ResolvedPos;
  item: ProseMirrorNode;
  itemDepth: number;
  itemIndex: number;
  list: ProseMirrorNode;
  listDepth: number;
  blockIndexInItem: number;
};

function listItemCursorAtTextblockStart(state: EditorState): ListItemCursor | null {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) return null;

  const $from = selection.$from;
  if ($from.parentOffset !== 0 || !$from.parent.isTextblock || $from.depth < 3) return null;

  const itemDepth = $from.depth - 1;
  const item = $from.node(itemDepth);
  if (!LIST_ITEM_TYPES.has(item.type.name)) return null;

  const listDepth = itemDepth - 1;
  return {
    $from,
    item,
    itemDepth,
    itemIndex: $from.index(listDepth),
    list: $from.node(listDepth),
    listDepth,
    blockIndexInItem: $from.index(itemDepth)
  };
}

function isEmptyListItem(item: ProseMirrorNode): boolean {
  return item.childCount === 1 && item.firstChild?.isTextblock === true && item.firstChild.content.size === 0;
}

function isNestedList(cursor: ListItemCursor): boolean {
  return cursor.listDepth > 0 && LIST_ITEM_TYPES.has(cursor.$from.node(cursor.listDepth - 1).type.name);
}

/**
 * Backspace at the start of a list item keeps the list intact:
 * - in a later paragraph of an item, merge the text into the block before it;
 * - at the start of a non-first item, fold the item into the previous one as a
 *   continuation paragraph, so following items keep their list and numbering;
 * - an empty middle item is removed and the cursor moves to the previous item.
 * The first item and an empty last item fall through to the default lift.
 */
export function richListBackspace(state: EditorState, dispatch?: Dispatch): boolean {
  const cursor = listItemCursorAtTextblockStart(state);
  if (!cursor) return false;

  const { $from, item, itemDepth, itemIndex, list, listDepth, blockIndexInItem } = cursor;
  if (blockIndexInItem > 0) return joinBackward(state, dispatch);
  if (itemIndex === 0) return false;

  const previous = list.child(itemIndex - 1);
  if (previous.type !== item.type) return false;

  const itemPos = $from.before(itemDepth);
  const previousPos = itemPos - previous.nodeSize;

  if (isEmptyListItem(item)) {
    if (itemIndex === list.childCount - 1) return false;
    if (dispatch) {
      const transaction = state.tr.delete(itemPos, itemPos + item.nodeSize);
      transaction.setSelection(TextSelection.near(transaction.doc.resolve(itemPos - 1), -1));
      dispatch(transaction.scrollIntoView());
    }
    return true;
  }

  let merged: ProseMirrorNode;
  try {
    merged = previous.type.createChecked(previous.attrs, previous.content.append(item.content), previous.marks);
  } catch {
    return false;
  }

  if (dispatch) {
    const transaction = state.tr;
    // A list item with two paragraphs can only be written as a loose Markdown list.
    if (list.attrs.markdownLoose === false) {
      transaction.setNodeMarkup($from.before(listDepth), undefined, { ...list.attrs, markdownLoose: true });
    }
    transaction.replaceWith(previousPos, itemPos + item.nodeSize, merged);
    transaction.setSelection(TextSelection.create(transaction.doc, previousPos + 1 + previous.content.size + 1));
    dispatch(transaction.scrollIntoView());
  }
  return true;
}

/**
 * Enter in an empty middle item of a top-level ordered list ends the list there
 * and continues the numbering of the items that follow the new paragraph.
 */
export function richOrderedListExitEmptyItem(state: EditorState, dispatch?: Dispatch): boolean {
  const cursor = listItemCursorAtTextblockStart(state);
  if (!cursor || cursor.blockIndexInItem !== 0 || !isEmptyListItem(cursor.item)) return false;

  const { $from, list, listDepth, itemIndex } = cursor;
  if (list.type.name !== "orderedList" || isNestedList(cursor)) return false;
  if (itemIndex === 0 || itemIndex >= list.childCount - 1) return false;

  const paragraphType = state.schema.nodes.paragraph;
  if (!paragraphType) return false;

  if (dispatch) {
    const before: ProseMirrorNode[] = [];
    const after: ProseMirrorNode[] = [];
    list.forEach((child, _offset, index) => {
      if (index < itemIndex) before.push(child);
      if (index > itemIndex) after.push(child);
    });

    const start = Number(list.attrs.start ?? 1);
    const listPos = $from.before(listDepth);
    const leading = list.type.create(list.attrs, before, list.marks);
    const paragraph = paragraphType.create();
    const trailing = list.type.create({ ...list.attrs, start: start + itemIndex }, after, list.marks);
    const transaction = state.tr.replaceWith(listPos, listPos + list.nodeSize, [leading, paragraph, trailing]);
    transaction.setSelection(TextSelection.create(transaction.doc, listPos + leading.nodeSize + 1));
    dispatch(transaction.scrollIntoView());
  }
  return true;
}
