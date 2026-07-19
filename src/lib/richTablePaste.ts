import { Fragment } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { CellSelection, TableMap, cellAround } from "@tiptap/pm/tables";

export type RichTablePasteCapacity = {
  startRow: number;
  startColumn: number;
  additionalRows: number;
  additionalColumns: number;
};

export function richTablePasteTransaction(state: EditorState, cells: readonly (readonly string[])[]): Transaction | null {
  const plan = tablePastePlan(state, cells);
  if (!plan || plan.capacity.additionalRows > 0 || plan.capacity.additionalColumns > 0) return null;

  const replacements: Array<{ position: number; value: string }> = [];
  for (let row = 0; row < cells.length; row += 1) {
    for (let column = 0; column < cells[0].length; column += 1) {
      const position = plan.tableStart + plan.map.map[(plan.capacity.startRow + row) * plan.map.width + plan.capacity.startColumn + column];
      replacements.push({ position, value: cells[row][column] });
    }
  }

  const paragraph = state.schema.nodes.paragraph;
  if (!paragraph) return null;

  const firstPosition = replacements[0]?.position;
  const lastPosition = replacements[replacements.length - 1]?.position;
  if (firstPosition === undefined || lastPosition === undefined) return null;

  const transaction = state.tr;
  for (const replacement of [...replacements].sort((left, right) => right.position - left.position)) {
    const cell = transaction.doc.nodeAt(replacement.position);
    if (!cell) return null;
    const content = tableCellContent(state, replacement.value, paragraph.name);
    if (!content) return null;
    transaction.replaceWith(replacement.position, replacement.position + cell.nodeSize, cell.copy(content));
  }

  const mappedFirstPosition = transaction.mapping.map(firstPosition, -1);
  const mappedLastPosition = transaction.mapping.map(lastPosition, -1);
  return transaction.setSelection(new CellSelection(
    transaction.doc.resolve(mappedFirstPosition),
    transaction.doc.resolve(mappedLastPosition)
  ));
}

export function richTablePasteCapacity(state: EditorState, cells: readonly (readonly string[])[]): RichTablePasteCapacity | null {
  return tablePastePlan(state, cells)?.capacity ?? null;
}

function tablePastePlan(state: EditorState, cells: readonly (readonly string[])[]): {
  capacity: RichTablePasteCapacity;
  map: TableMap;
  tableStart: number;
} | null {
  if (!cells.length || !cells[0]?.length) return null;

  const columnCount = cells[0].length;
  if (cells.some((row) => row.length !== columnCount)) return null;

  const selection = state.selection;
  const $cell = selection instanceof CellSelection ? selection.$anchorCell : cellAround(selection.$from);
  if (!$cell) return null;

  const table = $cell.node(-1);
  const tableStart = $cell.start(-1);
  const map = TableMap.get(table);
  const start = map.findCell($cell.pos - tableStart);
  const endRow = start.top + cells.length;
  const endColumn = start.left + columnCount;

  for (let row = start.top; row < Math.min(endRow, map.height); row += 1) {
    for (let column = start.left; column < Math.min(endColumn, map.width); column += 1) {
      const position = tableStart + map.map[row * map.width + column];
      const cell = state.doc.nodeAt(position);
      if (!cell || Number(cell.attrs.colspan ?? 1) !== 1 || Number(cell.attrs.rowspan ?? 1) !== 1) return null;
    }
  }

  return {
    tableStart,
    map,
    capacity: {
      startRow: start.top,
      startColumn: start.left,
      additionalRows: Math.max(0, endRow - map.height),
      additionalColumns: Math.max(0, endColumn - map.width)
    }
  };
}

function tableCellContent(state: EditorState, value: string, paragraphName: string): Fragment | null {
  const paragraph = state.schema.nodes[paragraphName];
  if (!paragraph) return null;

  const hardBreak = state.schema.nodes.hardBreak;
  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  const content = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (index > 0 && hardBreak) content.push(hardBreak.create());
    if (lines[index]) content.push(state.schema.text(lines[index]));
  }

  return Fragment.from(paragraph.create(null, Fragment.fromArray(content)));
}
