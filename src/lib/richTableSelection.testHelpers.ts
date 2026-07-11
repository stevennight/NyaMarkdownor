import { Schema } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { tableNodes } from "@tiptap/pm/tables";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    text: { group: "inline" },
    paragraph: { content: "inline*", group: "block" },
    ...tableNodes({ tableGroup: "block", cellContent: "paragraph+", cellAttributes: { align: { default: null } } })
  }
});

export function tableState(options: {
  firstColumnAlignment?: string | null;
  rows?: readonly (readonly string[])[];
  secondColumnAlignment?: string | null;
} = {}): EditorState {
  const paragraph = (text: string) => schema.nodes.paragraph.create(null, schema.text(text));
  const cell = (text: string, column: number) => schema.nodes.table_cell.create({
    align: column === 0 ? options.firstColumnAlignment ?? null : column === 1 ? options.secondColumnAlignment ?? null : null
  }, paragraph(text));
  const row = (values: readonly string[]) => schema.nodes.table_row.create(null, values.map(cell));
  const rows = options.rows ?? [["A", "B"], ["C", "D"]] as const;
  const doc = schema.nodes.doc.create(null, [schema.nodes.table.create(null, rows.map(row))]);
  let firstCellPosition = -1;
  doc.descendants((node, position) => {
    if (firstCellPosition < 0 && node.type === schema.nodes.table_cell) firstCellPosition = position;
  });
  return EditorState.create({ doc, selection: TextSelection.create(doc, firstCellPosition + 2) });
}
