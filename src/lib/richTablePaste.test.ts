import { Schema, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { CellSelection, tableNodes } from "@tiptap/pm/tables";
import { describe, expect, it } from "vitest";
import { richTablePasteCapacity, richTablePasteTransaction } from "./richTablePaste";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "inline*", group: "block" },
    text: { group: "inline" },
    hardBreak: { inline: true, group: "inline", selectable: false, linebreakReplacement: true },
    ...tableNodes({ tableGroup: "block", cellContent: "paragraph+", cellAttributes: {} })
  }
});

describe("rich table paste", () => {
  it("fills a rectangular range from the active table cell", () => {
    const state = tableState(3, 3, 1, 1);
    const transaction = richTablePasteTransaction(state, [
      ["A", "B"],
      ["C", "D"]
    ]);

    expect(transaction?.doc.textContent).toContain("A");
    expect(transaction?.doc.textContent).toContain("B");
    expect(transaction?.doc.textContent).toContain("C");
    expect(transaction?.doc.textContent).toContain("D");
    expect(tableCellTexts(transaction?.doc ?? state.doc)).toEqual([
      "0:0", "0:1", "0:2",
      "1:0", "A", "B",
      "2:0", "C", "D"
    ]);
    expect(transaction?.selection).toBeInstanceOf(CellSelection);
  });

  it("keeps pasted cell line breaks as hard breaks", () => {
    const state = tableState(2, 2, 0, 0);
    const transaction = richTablePasteTransaction(state, [["Line one\nLine two"]]);
    const firstCell = firstTableCell(transaction?.doc ?? state.doc);

    expect(firstCell?.textContent).toBe("Line oneLine two");
    expect(firstCell?.firstChild?.childCount).toBe(3);
  });

  it("does not truncate data when the pasted grid exceeds the current table", () => {
    const state = tableState(2, 2, 1, 1);

    expect(richTablePasteTransaction(state, [
      ["A", "B"],
      ["C", "D"]
    ])).toBeNull();
  });

  it("reports the precise row and column expansion needed for oversized pasted grids", () => {
    const state = tableState(2, 2, 1, 1);

    expect(richTablePasteCapacity(state, [
      ["A", "B"],
      ["C", "D"]
    ])).toEqual({
      startRow: 1,
      startColumn: 1,
      additionalRows: 1,
      additionalColumns: 1
    });
  });
});

function tableState(rows: number, columns: number, row: number, column: number): EditorState {
  const table = schema.nodes.table.create(null, Array.from({ length: rows }, (_value, rowIndex) => {
    const cellType = rowIndex === 0 ? schema.nodes.table_header : schema.nodes.table_cell;
    return schema.nodes.table_row.create(null, Array.from({ length: columns }, (_cell, columnIndex) => (
      cellType.create(null, schema.nodes.paragraph.create(null, schema.text(`${rowIndex}:${columnIndex}`)))
    )));
  }));
  const doc = schema.nodes.doc.create(null, table);
  const cellPosition = tableCellPositions(doc)[row * columns + column];
  return EditorState.create({ doc, selection: CellSelection.create(doc, cellPosition) });
}

function tableCellPositions(doc: ProseMirrorNode): number[] {
  const positions: number[] = [];
  doc.descendants((node, position) => {
    if (node.type.spec.tableRole === "cell" || node.type.spec.tableRole === "header_cell") positions.push(position);
  });
  return positions;
}

function firstTableCell(doc: ProseMirrorNode): ProseMirrorNode | null {
  let cell: ProseMirrorNode | null = null;
  doc.descendants((node) => {
    if (cell || (node.type.spec.tableRole !== "cell" && node.type.spec.tableRole !== "header_cell")) return;
    cell = node;
  });
  return cell;
}

function tableCellTexts(doc: ProseMirrorNode): string[] {
  const cells: string[] = [];
  doc.descendants((node) => {
    if (node.type.spec.tableRole === "cell" || node.type.spec.tableRole === "header_cell") {
      cells.push(node.textContent);
    }
  });
  return cells;
}
