import { describe, expect, it } from "vitest";
import { applyTextChange } from "./editorCommands";
import {
  applyTableBodySelection,
  applyTableCellNavigation,
  applyTableCellLineBreak,
  applyTableColumnBodySelection,
  applyTableColumnSelection,
  applyTableContentSelection,
  applyTableCsvPaste,
  applyTableDocumentCommand,
  applyTableRowsPaste,
  applyTableRowSelection,
  applyTableSelectionCommand,
  applySelectedTableCellsClear,
  applySelectedTableCellsPaste,
  applyTableTsvPaste,
  insertTableAtSelection,
  selectAdjacentTableCell,
  selectTableCellInMarkdownTable,
  selectTableRowInMarkdownTable
} from "./tableDocumentCommands";

describe("table document commands", () => {
  it("inserts a default Markdown table and selects the first header", () => {
    const edit = applyTableDocumentCommand("Before\nAfter", { from: 6, to: 6 }, "insert")!;

    expect(edit.markdown).toContain("| Column 1 | Column 2 | Column 3 |");
    expect(edit.markdown).toBe([
      "Before",
      "",
      "| Column 1 | Column 2 | Column 3 |",
      "| -------- | -------- | -------- |",
      "|          |          |          |",
      "|          |          |          |",
      "After"
    ].join("\n"));
    expect(edit.markdown.slice(edit.selection.from, edit.selection.to)).toBe("Column 1");
    expect(edit.change?.from).toBe(6);
    expect(edit.change?.to).toBe(6);
    expect(edit.change?.insert).toContain("| Column 1 | Column 2 | Column 3 |");
    expect(applyTextChange("Before\nAfter", edit.change!)).toBe(edit.markdown);
  });

  it("inserts a sized Markdown table and clamps unsafe dimensions", () => {
    const edit = insertTableAtSelection("", { from: 0, to: 0 }, { columns: 4, bodyRows: 1 });

    expect(edit.markdown).toBe([
      "| Column 1 | Column 2 | Column 3 | Column 4 |",
      "| -------- | -------- | -------- | -------- |",
      "|          |          |          |          |"
    ].join("\n"));
    expect(edit.markdown.slice(edit.selection.from, edit.selection.to)).toBe("Column 1");

    const clamped = insertTableAtSelection("", { from: 0, to: 0 }, { columns: 99, bodyRows: -4 });
    expect(clamped.markdown.split("\n")).toHaveLength(2);
    expect(clamped.markdown).toContain("Column 12");
    expect(clamped.markdown).not.toContain("Column 13");
  });

  it("converts selected TSV text into a Markdown table instead of discarding it", () => {
    const source = [
      "Intro",
      "Name\tScore",
      "Beta\t10",
      "Tail"
    ].join("\n");
    const from = source.indexOf("Name");
    const to = source.indexOf("\nTail");
    const edit = insertTableAtSelection(source, { from, to }, { columns: 5, bodyRows: 5 });

    expect(edit.markdown).toBe([
      "Intro",
      "| Name | Score |",
      "| ---- | ----- |",
      "| Beta | 10    |",
      "Tail"
    ].join("\n"));
    expect(edit.markdown.slice(edit.selection.from, edit.selection.to)).toBe("Beta");
    expect(applyTextChange(source, edit.change!)).toBe(edit.markdown);
  });

  it("normalizes a selected Markdown table when inserting a table over it", () => {
    const source = [
      "Intro",
      "| Name | Score |",
      "| --- | ---: |",
      "| Beta | 10 |",
      "Tail"
    ].join("\n");
    const from = source.indexOf("| Name");
    const to = source.indexOf("\nTail");
    const edit = insertTableAtSelection(source, { from, to });

    expect(edit.markdown).toBe([
      "Intro",
      "| Name | Score |",
      "| ---- | ----: |",
      "| Beta | 10    |",
      "Tail"
    ].join("\n"));
    expect(edit.markdown.slice(edit.selection.from, edit.selection.to)).toBe("Beta");
  });

  it("normalizes a table at the cursor", () => {
    const source = "| A | B |\n| --- | --- |\n| long | x |";
    const edit = applyTableDocumentCommand(source, { from: source.indexOf("long"), to: source.indexOf("long") }, "normalize")!;

    expect(edit.markdown).toBe("| A    | B   |\n| ---- | --- |\n| long | x   |");
    expect(edit.markdown.slice(edit.selection.from, edit.selection.to)).toBe("long");
    expect(edit.change).toEqual({
      from: 0,
      to: source.length,
      insert: edit.markdown
    });
    expect(applyTextChange(source, edit.change!)).toBe(edit.markdown);
  });

  it("does not run table commands on table-looking code fences", () => {
    const source = [
      "```md",
      "| A | B |",
      "| --- | --- |",
      "| x | y |",
      "```"
    ].join("\n");

    expect(applyTableDocumentCommand(source, { from: source.indexOf("x"), to: source.indexOf("x") }, "normalize")).toBeNull();
    expect(applyTableSelectionCommand(source, { from: source.indexOf("x"), to: source.indexOf("x") }, "select-table")).toBeNull();
  });

  it("does not run table commands on table-looking indented code", () => {
    const source = [
      "    | A | B |",
      "    | --- | --- |",
      "    | x | y |"
    ].join("\n");

    expect(applyTableDocumentCommand(source, { from: source.indexOf("x"), to: source.indexOf("x") }, "normalize")).toBeNull();
    expect(applyTableSelectionCommand(source, { from: source.indexOf("x"), to: source.indexOf("x") }, "select-table")).toBeNull();
  });

  it("adds rows and columns based on the cursor table", () => {
    const source = "| A | B |\n| --- | --- |\n| x | y |";
    const rowEdit = applyTableDocumentCommand(source, { from: source.indexOf("x"), to: source.indexOf("x") }, "add-row")!;
    expect(rowEdit.markdown).toContain("|     |     |");
    expectSelectedEmptyCell(rowEdit.markdown, rowEdit.selection);

    const colEdit = applyTableDocumentCommand(source, { from: source.indexOf("y"), to: source.indexOf("y") }, "add-column")!;
    expect(colEdit.markdown).toContain("| A   | B   | Column 3 |");
    expectSelectedEmptyCell(colEdit.markdown, colEdit.selection);
  });

  it("adds rows before the active data row and columns before the active column", () => {
    const source = [
      "| A | B |",
      "| --- | --- |",
      "| x | y |",
      "| p | q |"
    ].join("\n");
    const rowEdit = applyTableDocumentCommand(source, { from: source.indexOf("p"), to: source.indexOf("p") }, "add-row-before")!;

    expect(rowEdit.markdown).toBe([
      "| A   | B   |",
      "| --- | --- |",
      "| x   | y   |",
      "|     |     |",
      "| p   | q   |"
    ].join("\n"));
    expectSelectedEmptyCell(rowEdit.markdown, rowEdit.selection);
    expect(rowEdit.selection.to).toBeLessThan(rowEdit.markdown.indexOf("| p"));

    const colEdit = applyTableDocumentCommand(source, { from: source.indexOf("B"), to: source.indexOf("B") }, "add-column-before")!;
    expect(colEdit.markdown).toBe([
      "| A   | Column 2 | B   |",
      "| --- | -------- | --- |",
      "| x   |          | y   |",
      "| p   |          | q   |"
    ].join("\n"));
    expect(colEdit.markdown.slice(colEdit.selection.from, colEdit.selection.to)).toBe("Column 2");
  });

  it("aligns the column under the cursor", () => {
    const source = "| A | B |\n| --- | --- |\n| x | y |";
    const edit = applyTableDocumentCommand(source, { from: source.indexOf("y"), to: source.indexOf("y") }, "align-column-right")!;

    expect(edit.markdown).toBe("| A   | B    |\n| --- | ---: |\n| x   | y    |");
    expect(edit.markdown.slice(edit.selection.from, edit.selection.to)).toBe("y");
  });

  it("moves the active data row and keeps the moved row selected", () => {
    const source = "| A | B |\n| --- | --- |\n| x | y |\n| p | q |";
    const edit = applyTableDocumentCommand(source, { from: source.indexOf("p"), to: source.indexOf("p") }, "move-row-up")!;

    expect(edit.markdown).toBe("| A   | B   |\n| --- | --- |\n| p   | q   |\n| x   | y   |");
    expect(edit.markdown.slice(edit.selection.from, edit.selection.to)).toBe("p");
    expect(applyTextChange(source, edit.change!)).toBe(edit.markdown);
    expect(applyTableDocumentCommand(source, { from: source.indexOf("x"), to: source.indexOf("x") }, "move-row-up")).toBeNull();
  });

  it("moves the active column and preserves alignment with cells", () => {
    const source = "| A | B | C |\n| :--- | :---: | ---: |\n| x | y | z |";
    const edit = applyTableDocumentCommand(source, { from: source.indexOf("B"), to: source.indexOf("B") }, "move-column-right")!;

    expect(edit.markdown).toBe("| A    | C    | B     |\n| :--- | ---: | :---: |\n| x    | z    | y     |");
    expect(edit.markdown.slice(edit.selection.from, edit.selection.to)).toBe("B");
    expect(applyTextChange(source, edit.change!)).toBe(edit.markdown);
    expect(applyTableDocumentCommand(source, { from: source.indexOf("A"), to: source.indexOf("A") }, "move-column-left")).toBeNull();
  });

  it("duplicates the active data row and keeps the duplicate selected", () => {
    const source = "| A | B |\n| --- | --- |\n| x | y |\n| p | q |";
    const edit = applyTableDocumentCommand(source, { from: source.indexOf("x"), to: source.indexOf("x") }, "duplicate-row")!;

    expect(edit.markdown).toBe("| A   | B   |\n| --- | --- |\n| x   | y   |\n| x   | y   |\n| p   | q   |");
    expect(edit.markdown.slice(edit.selection.from, edit.selection.to)).toBe("x");
    expect(edit.selection.from).toBe(edit.markdown.indexOf("x", edit.markdown.indexOf("x") + 1));
    expect(applyTextChange(source, edit.change!)).toBe(edit.markdown);
    expect(applyTableDocumentCommand(source, { from: source.indexOf("---"), to: source.indexOf("---") }, "duplicate-row")).toBeNull();
  });

  it("duplicates the active column with alignment and keeps the duplicate selected", () => {
    const source = "| A | B |\n| :--- | ---: |\n| x | y |";
    const edit = applyTableDocumentCommand(source, { from: source.indexOf("B"), to: source.indexOf("B") }, "duplicate-column")!;

    expect(edit.markdown).toBe("| A    | B    | B    |\n| :--- | ---: | ---: |\n| x    | y    | y    |");
    expect(edit.markdown.slice(edit.selection.from, edit.selection.to)).toBe("B");
    expect(edit.selection.from).toBe(edit.markdown.indexOf("B", edit.markdown.indexOf("B") + 1));
    expect(applyTextChange(source, edit.change!)).toBe(edit.markdown);
  });

  it("deletes the active table with a scoped edit", () => {
    const source = [
      "Intro",
      "",
      "| A | B |",
      "| --- | --- |",
      "| x | y |",
      "Tail"
    ].join("\n");
    const edit = applyTableDocumentCommand(source, { from: source.indexOf("x"), to: source.indexOf("x") }, "delete-table")!;

    expect(edit.markdown).toBe("Intro\n\nTail");
    expect(edit.selection.from).toBe(source.indexOf("| A"));
    expect(edit.selection.to).toBe(edit.selection.from);
    expect(edit.change).toEqual({
      from: source.indexOf("| A"),
      to: source.indexOf("Tail"),
      insert: ""
    });
    expect(applyTextChange(source, edit.change!)).toBe(edit.markdown);
  });

  it("sorts the active column and keeps the selected data row selected", () => {
    const source = "| Name | Score |\n| --- | ---: |\n| Beta | 10 |\n| Alpha | 2 |\n| Gamma | 30 |";
    const edit = applyTableDocumentCommand(source, { from: source.indexOf("10"), to: source.indexOf("10") }, "sort-column-asc")!;

    expect(edit.markdown).toBe([
      "| Name  | Score |",
      "| ----- | ----: |",
      "| Alpha | 2     |",
      "| Beta  | 10    |",
      "| Gamma | 30    |"
    ].join("\n"));
    expect(edit.markdown.slice(edit.selection.from, edit.selection.to)).toBe("10");
    expect(applyTextChange(source, edit.change!)).toBe(edit.markdown);
  });

  it("keeps the active header selected when sorting from a header cell", () => {
    const source = "| Name | Score |\n| --- | ---: |\n| Beta | 10 |\n| Alpha | 2 |\n| Gamma | 30 |";
    const edit = applyTableDocumentCommand(source, { from: source.indexOf("Score"), to: source.indexOf("Score") }, "sort-column-desc")!;

    expect(edit.markdown).toBe([
      "| Name  | Score |",
      "| ----- | ----: |",
      "| Gamma | 30    |",
      "| Beta  | 10    |",
      "| Alpha | 2     |"
    ].join("\n"));
    expect(edit.markdown.slice(edit.selection.from, edit.selection.to)).toBe("Score");
  });

  it("selects adjacent table cells for tab navigation", () => {
    const source = "| A | B |\n| --- | --- |\n| x | y |";
    const next = selectAdjacentTableCell(source, source.indexOf("x"), "next")!;
    expect(source.slice(next.from, next.to)).toBe("y");

    const previous = selectAdjacentTableCell(source, source.indexOf("y"), "previous")!;
    expect(source.slice(previous.from, previous.to)).toBe("x");
  });

  it("clamps direct table cell selection to the nearest real column", () => {
    const source = "| A | B |\n| --- | --- |\n| x | y |";

    const tooFarRight = selectTableCellInMarkdownTable(source, 0, 2, 99)!;
    expect(source.slice(tooFarRight.from, tooFarRight.to)).toBe("y");

    const tooFarLeft = selectTableCellInMarkdownTable(source, 0, 2, -99)!;
    expect(source.slice(tooFarLeft.from, tooFarLeft.to)).toBe("x");
  });

  it("selects an empty table cell as a visible cell range", () => {
    const source = "| A | B |\n| --- | --- |\n| x |   |";
    const emptyCellCursor = source.indexOf("   |");
    const selection = applyTableSelectionCommand(source, { from: emptyCellCursor, to: emptyCellCursor }, "select-cell")!;

    expect(selection.to).toBeGreaterThan(selection.from);
    expect(source.slice(selection.from, selection.to)).not.toContain("|");
    expect(source.slice(selection.from, selection.to).trim()).toBe("");

    const edit = applySelectedTableCellsPaste(source, [selection], [["y"]])!;
    expect(edit.markdown).toBe("| A   | B   |\n| --- | --- |\n| x   | y   |");
    expect(edit.markdown.slice(edit.selection.from, edit.selection.to)).toBe("y");
  });

  it("selects the active table cell, row, or whole table", () => {
    const source = [
      "Intro",
      "",
      "| A | B |",
      "| --- | --- |",
      "| x | y |",
      "",
      "Tail"
    ].join("\n");
    const cursor = source.indexOf("y");

    const cell = applyTableSelectionCommand(source, { from: cursor, to: cursor }, "select-cell")!;
    expect(source.slice(cell.from, cell.to)).toBe("y");

    const row = applyTableSelectionCommand(source, { from: cursor, to: cursor }, "select-row")!;
    expect(source.slice(row.from, row.to)).toBe("| x | y |");

    const table = applyTableSelectionCommand(source, { from: cursor, to: cursor }, "select-table")!;
    expect(source.slice(table.from, table.to)).toBe([
      "| A | B |",
      "| --- | --- |",
      "| x | y |"
    ].join("\n"));
  });

  it("selects whole table content as cell ranges without the delimiter row", () => {
    const source = [
      "Intro",
      "",
      "| Name | Score |",
      "| --- | ---: |",
      "| Beta | 10 |",
      "| Alpha | 2 |",
      "",
      "Tail"
    ].join("\n");
    const cursor = source.indexOf("10");
    const selection = applyTableContentSelection(source, { from: cursor, to: cursor })!;

    expect(selection.mainIndex).toBe(3);
    expect(selection.ranges.map((range) => source.slice(range.from, range.to).trim())).toEqual([
      "Name",
      "Score",
      "Beta",
      "10",
      "Alpha",
      "2"
    ]);
    expect(selection.ranges.some((range) => source.slice(range.from, range.to).includes("|"))).toBe(false);
    expect(selection.ranges.some((range) => source.slice(range.from, range.to).includes("---"))).toBe(false);
  });

  it("selects only table body cells without header or delimiter rows", () => {
    const source = [
      "Intro",
      "",
      "| Name | Score |",
      "| --- | ---: |",
      "| Beta | 10 |",
      "| Alpha | 2 |",
      "",
      "Tail"
    ].join("\n");
    const cursor = source.indexOf("10");
    const selection = applyTableBodySelection(source, { from: cursor, to: cursor })!;

    expect(selection.mainIndex).toBe(1);
    expect(selection.ranges.map((range) => source.slice(range.from, range.to).trim())).toEqual([
      "Beta",
      "10",
      "Alpha",
      "2"
    ]);
    expect(selection.ranges.some((range) => source.slice(range.from, range.to).includes("Name"))).toBe(false);
    expect(selection.ranges.some((range) => source.slice(range.from, range.to).includes("---"))).toBe(false);
  });

  it("does not select a table body when the table has no data rows", () => {
    const source = "| A | B |\n| --- | --- |";

    expect(applyTableBodySelection(source, { from: source.indexOf("A"), to: source.indexOf("A") })).toBeNull();
  });

  it("does not select the delimiter row as table content", () => {
    const source = "| A | B |\n| --- | --- |\n| x | y |";
    const cursor = source.indexOf("---");

    expect(applyTableSelectionCommand(source, { from: cursor, to: cursor }, "select-row")).toBeNull();
  });

  it("selects a row from raw table markdown", () => {
    const source = [
      "Intro",
      "| A | B |",
      "| --- | --- |",
      "| x | y |",
      "| p | q |"
    ].join("\n");
    const tableStart = source.indexOf("| A");
    const tableMarkdown = source.slice(tableStart);
    const range = selectTableRowInMarkdownTable(tableMarkdown, tableStart, 3)!;

    expect(source.slice(range.from, range.to)).toBe("| p | q |");
    expect(selectTableRowInMarkdownTable(tableMarkdown, tableStart, 1)).toBeNull();
  });

  it("selects the active table column as multiple cell ranges", () => {
    const source = [
      "| Name | Score |",
      "| --- | ---: |",
      "| Beta | 10 |",
      "| Alpha | 2 |"
    ].join("\n");
    const cursor = source.indexOf("10");
    const selection = applyTableColumnSelection(source, { from: cursor, to: cursor })!;

    expect(selection.mainIndex).toBe(1);
    expect(selection.ranges.map((range) => source.slice(range.from, range.to).trim())).toEqual([
      "Score",
      "10",
      "2"
    ]);
  });

  it("selects only table column body cells without the header", () => {
    const source = [
      "| Name | Score |",
      "| --- | ---: |",
      "| Beta | 10 |",
      "| Alpha | 2 |"
    ].join("\n");
    const cursor = source.indexOf("10");
    const selection = applyTableColumnBodySelection(source, { from: cursor, to: cursor })!;

    expect(selection.mainIndex).toBe(0);
    expect(selection.ranges.map((range) => source.slice(range.from, range.to).trim())).toEqual([
      "10",
      "2"
    ]);
  });

  it("selects a target column body for inspector actions", () => {
    const source = [
      "| Name | Score |",
      "| --- | ---: |",
      "| Beta | 10 |",
      "| Alpha | 2 |"
    ].join("\n");
    const selection = applyTableColumnBodySelection(source, { from: source.indexOf("Name"), to: source.indexOf("Name") }, 0)!;

    expect(selection.ranges.map((range) => source.slice(range.from, range.to).trim())).toEqual([
      "Beta",
      "Alpha"
    ]);
  });

  it("does not select a column body when the table has no data rows", () => {
    const source = "| A | B |\n| --- | --- |";

    expect(applyTableColumnBodySelection(source, { from: source.indexOf("A"), to: source.indexOf("A") })).toBeNull();
  });

  it("selects the active table row as cell ranges without pipe syntax", () => {
    const source = [
      "| Name | Score | Note |",
      "| --- | ---: | --- |",
      "| Beta | 10 | fast |",
      "| Alpha | 2 | calm |"
    ].join("\n");
    const cursor = source.indexOf("10");
    const selection = applyTableRowSelection(source, { from: cursor, to: cursor })!;

    expect(selection.mainIndex).toBe(1);
    expect(selection.ranges.map((range) => source.slice(range.from, range.to).trim())).toEqual([
      "Beta",
      "10",
      "fast"
    ]);
    expect(selection.ranges.some((range) => source.slice(range.from, range.to).includes("|"))).toBe(false);
  });

  it("selects pipe-light table rows with escaped trailing pipes", () => {
    const source = [
      "Name | Note",
      "--- | ---",
      "Alpha | ends with pipe\\|",
      "Beta | ok"
    ].join("\n");
    const selection = applyTableRowSelection(source, { from: source.indexOf("Alpha"), to: source.indexOf("Alpha") })!;

    expect(selection.ranges.map((range) => source.slice(range.from, range.to).trim())).toEqual([
      "Alpha",
      "ends with pipe\\|"
    ]);
    expect(selection.mainIndex).toBe(0);
  });

  it("selects the table header as cell ranges", () => {
    const source = [
      "| Name | Score | Note |",
      "| --- | ---: | --- |",
      "| Beta | 10 | fast |",
      "| Alpha | 2 | calm |"
    ].join("\n");
    const selection = applyTableRowSelection(source, { from: source.indexOf("10"), to: source.indexOf("10") }, 0)!;

    expect(selection.ranges.map((range) => source.slice(range.from, range.to).trim())).toEqual([
      "Name",
      "Score",
      "Note"
    ]);
    expect(selection.mainIndex).toBe(1);
  });

  it("selects a target data row as cell ranges for inspector actions", () => {
    const source = [
      "| Name | Score | Note |",
      "| --- | ---: | --- |",
      "| Beta | 10 | fast |",
      "| Alpha | 2 | calm |"
    ].join("\n");
    const selection = applyTableRowSelection(source, { from: source.indexOf("Name"), to: source.indexOf("Name") }, 3)!;

    expect(selection.ranges.map((range) => source.slice(range.from, range.to).trim())).toEqual([
      "Alpha",
      "2",
      "calm"
    ]);
  });

  it("pastes across a selected table row cell range", () => {
    const source = [
      "| Name | Score | Note |",
      "| --- | ---: | --- |",
      "| Beta | 10 | fast |",
      "| Alpha | 2 | calm |"
    ].join("\n");
    const selection = applyTableRowSelection(source, { from: source.indexOf("10"), to: source.indexOf("10") })!;
    const edit = applySelectedTableCellsPaste(source, selection.ranges, [["Gamma", "30", "steady"]])!;

    expect(edit.markdown).toBe([
      "| Name  | Score | Note   |",
      "| ----- | ----: | ------ |",
      "| Gamma | 30    | steady |",
      "| Alpha | 2     | calm   |"
    ].join("\n"));
    expect(edit.markdown.slice(edit.selection.from, edit.selection.to)).toBe("steady");
  });

  it("clears a selected table row cell range without deleting delimiters", () => {
    const source = [
      "| Name | Score | Note |",
      "| --- | ---: | --- |",
      "| Beta | 10 | fast |",
      "| Alpha | 2 | calm |"
    ].join("\n");
    const selection = applyTableRowSelection(source, { from: source.indexOf("10"), to: source.indexOf("10") })!;
    const edit = applySelectedTableCellsClear(source, selection.ranges)!;

    expect(edit.markdown).toBe([
      "| Name  | Score | Note |",
      "| ----- | ----: | ---- |",
      "|       |       |      |",
      "| Alpha | 2     | calm |"
    ].join("\n"));
  });

  it("pastes vertical data into selected table column cells", () => {
    const source = [
      "| Name | Score |",
      "| --- | ---: |",
      "| Beta | 10 |",
      "| Alpha | 2 |"
    ].join("\n");
    const cursor = source.indexOf("10");
    const selection = applyTableColumnSelection(source, { from: cursor, to: cursor })!;
    const edit = applySelectedTableCellsPaste(source, selection.ranges, [
      ["Points"],
      ["11"],
      ["3"]
    ])!;

    expect(edit.markdown).toBe([
      "| Name  | Points |",
      "| ----- | -----: |",
      "| Beta  | 11     |",
      "| Alpha | 3      |"
    ].join("\n"));
    expect(edit.markdown.slice(edit.selection.from, edit.selection.to)).toBe("3");
  });

  it("pastes rectangular data into selected table cells", () => {
    const source = [
      "| A | B | C |",
      "| --- | --- | --- |",
      "| a1 | b1 | c1 |",
      "| a2 | b2 | c2 |"
    ].join("\n");
    const ranges = [
      fullCellRange(source, "b1"),
      fullCellRange(source, "c1"),
      fullCellRange(source, "b2"),
      fullCellRange(source, "c2")
    ];
    const edit = applySelectedTableCellsPaste(source, ranges, [
      ["B1", "C1"],
      ["B2", "C2"]
    ])!;

    expect(edit.markdown).toBe([
      "| A   | B   | C   |",
      "| --- | --- | --- |",
      "| a1  | B1  | C1  |",
      "| a2  | B2  | C2  |"
    ].join("\n"));
    expect(edit.markdown.slice(edit.selection.from, edit.selection.to)).toBe("C2");
  });

  it("pastes plain scalar text into selected table cells", () => {
    const source = [
      "| Name | Score |",
      "| --- | ---: |",
      "| Beta | 10 |",
      "| Alpha | 2 |"
    ].join("\n");
    const selection = applyTableColumnSelection(source, { from: source.indexOf("10"), to: source.indexOf("10") })!;
    const edit = applySelectedTableCellsPaste(source, selection.ranges, [["not ranked"]])!;

    expect(edit.markdown).toBe([
      "| Name  | not ranked |",
      "| ----- | ---------: |",
      "| Beta  | not ranked |",
      "| Alpha | not ranked |"
    ].join("\n"));
  });

  it("treats table selections with only adjacent whitespace as table cells", () => {
    const source = [
      "Intro",
      "",
      "| Name | Score |",
      "| --- | ---: |",
      "| Beta | 10 |",
      "",
      "Tail"
    ].join("\n");
    const from = source.indexOf("\n\n| Name") + 1;
    const to = source.indexOf("Tail");
    const edit = applySelectedTableCellsPaste(source, [{ from, to }], [["X"]])!;

    expect(edit.markdown).toBe([
      "Intro",
      "",
      "| X   | X    |",
      "| --- | ---: |",
      "| X   | X    |",
      "",
      "Tail"
    ].join("\n"));
    expect(edit.markdown.slice(edit.selection.from, edit.selection.to)).toBe("X");
  });

  it("does not treat selections with real text outside a table as table cells", () => {
    const source = [
      "Intro",
      "",
      "| Name | Score |",
      "| --- | ---: |",
      "| Beta | 10 |",
      "",
      "Tail"
    ].join("\n");
    const to = source.indexOf("Tail");

    expect(applySelectedTableCellsPaste(source, [{ from: 0, to }], [["X"]])).toBeNull();
  });

  it("pastes comma text into a single selected table cell as plain text", () => {
    const source = [
      "| Name | Note |",
      "| --- | --- |",
      "| Beta | old |"
    ].join("\n");
    const edit = applySelectedTableCellsPaste(source, [fullCellRange(source, "old")], [["hello, world"]])!;

    expect(edit.markdown).toBe([
      "| Name | Note         |",
      "| ---- | ------------ |",
      "| Beta | hello, world |"
    ].join("\n"));
    expect(edit.markdown.slice(edit.selection.from, edit.selection.to)).toBe("hello, world");
  });

  it("lets grid paste at one selected cell expand from the cursor cell", () => {
    const source = "| A | B |\n| --- | --- |\n| x | y |";
    const cell = fullCellRange(source, "y");

    const selectedCellsEdit = applySelectedTableCellsPaste(source, [cell], [["Y", "Z"], ["Q", "R"]])!;
    expect(selectedCellsEdit.markdown).toBe([
      "| A   | B   | Column 3 |",
      "| --- | --- | -------- |",
      "| x   | Y   | Z        |",
      "|     | Q   | R        |"
    ].join("\n"));
    expect(selectedCellsEdit.markdown.slice(selectedCellsEdit.selection.from, selectedCellsEdit.selection.to)).toBe("R");

    const edit = applyTableTsvPaste(source, cell, "Y\tZ\nQ\tR")!;
    expect(edit.markdown).toBe([
      "| A   | B   | Column 3 |",
      "| --- | --- | -------- |",
      "| x   | Y   | Z        |",
      "|     | Q   | R        |"
    ].join("\n"));
  });

  it("keeps blank spreadsheet rows when grid paste expands a table", () => {
    const source = "| A | B |\n| --- | --- |\n| x | y |";
    const cell = fullCellRange(source, "y");
    const edit = applyTableTsvPaste(source, cell, "Y\tZ\n\t\nQ\tR")!;

    expect(edit.markdown).toBe([
      "| A   | B   | Column 3 |",
      "| --- | --- | -------- |",
      "| x   | Y   | Z        |",
      "|     |     |          |",
      "|     | Q   | R        |"
    ].join("\n"));
    expect(edit.markdown.slice(edit.selection.from, edit.selection.to)).toBe("R");
  });

  it("expands oversized grid paste from the top-left selected table cell", () => {
    const source = "| A | B |\n| --- | --- |\n| x | y |";
    const selection = applyTableRowSelection(source, { from: source.indexOf("x"), to: source.indexOf("x") })!;
    const edit = applySelectedTableCellsPaste(source, selection.ranges, [
      ["X", "Y", "Z"],
      ["P", "Q", "R"]
    ])!;

    expect(edit.markdown).toBe([
      "| A   | B   | Column 3 |",
      "| --- | --- | -------- |",
      "| X   | Y   | Z        |",
      "| P   | Q   | R        |"
    ].join("\n"));
    expect(edit.markdown.slice(edit.selection.from, edit.selection.to)).toBe("R");
  });

  it("expands oversized vertical paste from the first selected column cell", () => {
    const source = [
      "| Name | Score |",
      "| --- | ---: |",
      "| Beta | 10 |",
      "| Alpha | 2 |"
    ].join("\n");
    const selection = applyTableColumnBodySelection(source, { from: source.indexOf("10"), to: source.indexOf("10") })!;
    const edit = applySelectedTableCellsPaste(source, selection.ranges, [
      ["11"],
      ["3"],
      ["8"]
    ])!;

    expect(edit.markdown).toBe([
      "| Name  | Score |",
      "| ----- | ----: |",
      "| Beta  | 11    |",
      "| Alpha | 3     |",
      "|       | 8     |"
    ].join("\n"));
    expect(edit.markdown.slice(edit.selection.from, edit.selection.to)).toBe("8");
  });

  it("fills an existing table from single-column line rows at the cursor cell", () => {
    const source = "| A | B |\n| --- | --- |\n| x | y |";
    const edit = applyTableRowsPaste(source, { from: source.indexOf("y"), to: source.indexOf("y") }, [
      ["Y"],
      ["Q"],
      ["R"]
    ])!;

    expect(edit.markdown).toBe([
      "| A   | B   |",
      "| --- | --- |",
      "| x   | Y   |",
      "|     | Q   |",
      "|     | R   |"
    ].join("\n"));
    expect(edit.markdown.slice(edit.selection.from, edit.selection.to)).toBe("R");
  });

  it("clears selected table cells without deleting table pipe structure", () => {
    const source = [
      "| Name | Score |",
      "| --- | ---: |",
      "| Beta | 10 |",
      "| Alpha | 2 |"
    ].join("\n");
    const selection = applyTableColumnSelection(source, { from: source.indexOf("10"), to: source.indexOf("10") })!;
    const edit = applySelectedTableCellsClear(source, selection.ranges)!;

    expect(edit.markdown).toBe([
      "| Name  |      |",
      "| ----- | ---: |",
      "| Beta  |      |",
      "| Alpha |      |"
    ].join("\n"));
    expectSelectedEmptyCell(edit.markdown, edit.selection);
    expect(applyTextChange(source, edit.change!)).toBe(edit.markdown);
  });

  it("clears a single selected table cell", () => {
    const source = [
      "| Name | Score |",
      "| --- | ---: |",
      "| Beta | 10 |"
    ].join("\n");
    const edit = applySelectedTableCellsClear(source, [fullCellRange(source, "10")])!;

    expect(edit.markdown).toBe([
      "| Name | Score |",
      "| ---- | ----: |",
      "| Beta |       |"
    ].join("\n"));
    expectSelectedEmptyCell(edit.markdown, edit.selection);
  });

  it("clears an exact whole-cell content selection", () => {
    const source = [
      "| Name | Score |",
      "| --- | ---: |",
      "| **Beta** | 10 |"
    ].join("\n");
    const from = source.indexOf("**Beta**");
    const edit = applySelectedTableCellsClear(source, [{ from, to: from + "**Beta**".length }])!;

    expect(edit.markdown).toBe([
      "| Name | Score |",
      "| ---- | ----: |",
      "|      | 10    |"
    ].join("\n"));
    expectSelectedEmptyCell(edit.markdown, edit.selection);
  });

  it("does not clear partial text selections inside table cells", () => {
    const source = [
      "| Name | Score |",
      "| --- | ---: |",
      "| **Beta** | 10 |"
    ].join("\n");
    const beta = source.indexOf("Beta");

    expect(applySelectedTableCellsClear(source, [{ from: beta, to: beta + "Beta".length }])).toBeNull();
  });

  it("adds a new row when tabbing forward from the final table cell", () => {
    const source = "| A | B |\n| --- | --- |\n| x | y |";
    const edit = applyTableCellNavigation(source, { from: source.indexOf("y"), to: source.indexOf("y") }, "next")!;

    expect(edit.markdown).toBe("| A   | B   |\n| --- | --- |\n| x   | y   |\n|     |     |");
    expectSelectedEmptyCell(edit.markdown, edit.selection);
    expect(edit.selection.from).toBe(edit.markdown.lastIndexOf("\n") + 2);
  });

  it("inserts serialized line breaks inside table cells without rebuilding the table", () => {
    const source = "| A | B |\n| --- | --- |\n| Alpha | Beta |";
    const from = source.indexOf("Beta") + 2;
    const edit = applyTableCellLineBreak(source, { from, to: from })!;

    expect(edit.markdown).toBe("| A | B |\n| --- | --- |\n| Alpha | Be<br>ta |");
    expect(edit.change).toEqual({ from, to: from, insert: "<br>" });
    expect(edit.selection).toEqual({ from: from + 4, to: from + 4 });
  });

  it("replaces selected table cell text with a serialized line break", () => {
    const source = "| A | B |\n| --- | --- |\n| Alpha | Beta |";
    const from = source.indexOf("Beta");
    const edit = applyTableCellLineBreak(source, { from, to: from + "Beta".length })!;

    expect(edit.markdown).toBe("| A | B |\n| --- | --- |\n| Alpha | <br> |");
    expect(edit.selection).toEqual({ from: from + 4, to: from + 4 });
  });

  it("does not insert serialized line breaks outside editable table cells", () => {
    const source = "| A | B |\n| --- | --- |\n| Alpha | Beta |";

    expect(applyTableCellLineBreak(source, { from: source.indexOf("---"), to: source.indexOf("---") })).toBeNull();
    expect(applyTableCellLineBreak("plain text", { from: 2, to: 2 })).toBeNull();
  });

  it("fills an existing table from pasted TSV at the cursor cell", () => {
    const source = "| A | B |\n| --- | --- |\n| x | y |";
    const edit = applyTableTsvPaste(source, { from: source.indexOf("y"), to: source.indexOf("y") }, "Y\tZ\nQ\tR")!;

    expect(edit.markdown).toBe([
      "| A   | B   | Column 3 |",
      "| --- | --- | -------- |",
      "| x   | Y   | Z        |",
      "|     | Q   | R        |"
    ].join("\n"));
    expect(edit.markdown.slice(edit.selection.from, edit.selection.to)).toBe("R");
  });

  it("treats a paste cursor after the trailing row pipe as the last table cell", () => {
    const source = "| A | B |\n| --- | --- |\n| x | y |";
    const trailingPipeCursor = source.length;
    const edit = applyTableTsvPaste(source, { from: trailingPipeCursor, to: trailingPipeCursor }, "Y\tZ")!;

    expect(edit.markdown).toBe([
      "| A   | B   | Column 3 |",
      "| --- | --- | -------- |",
      "| x   | Y   | Z        |"
    ].join("\n"));
    expect(edit.markdown.slice(edit.selection.from, edit.selection.to)).toBe("Z");
  });

  it("selects the last table cell when the cursor is after the trailing row pipe", () => {
    const source = "| A | B |\n| --- | --- |\n| x | y |";
    const selection = applyTableSelectionCommand(source, { from: source.length, to: source.length }, "select-cell")!;

    expect(source.slice(selection.from, selection.to)).toBe("y");
  });

  it("fills an existing table from pasted CSV at the cursor cell", () => {
    const source = "| A | B |\n| --- | --- |\n| x | y |";
    const edit = applyTableCsvPaste(source, { from: source.indexOf("y"), to: source.indexOf("y") }, "Y,Z\nQ,R")!;

    expect(edit.markdown).toBe([
      "| A   | B   | Column 3 |",
      "| --- | --- | -------- |",
      "| x   | Y   | Z        |",
      "|     | Q   | R        |"
    ].join("\n"));
    expect(edit.markdown.slice(edit.selection.from, edit.selection.to)).toBe("R");
  });

  it("does not split ordinary comma text into table cells", () => {
    const source = "| A | B |\n| --- | --- |\n| x | y |";
    expect(applyTableCsvPaste(source, { from: source.indexOf("y"), to: source.indexOf("y") }, "hello, world")).toBeNull();
  });

  it("fills an existing table from parsed HTML table rows", () => {
    const source = "| A | B |\n| --- | --- |\n| x | y |";
    const edit = applyTableRowsPaste(source, { from: source.indexOf("y"), to: source.indexOf("y") }, [
      ["Y", "Z"],
      ["Q", "R"]
    ])!;

    expect(edit.markdown).toBe([
      "| A   | B   | Column 3 |",
      "| --- | --- | -------- |",
      "| x   | Y   | Z        |",
      "|     | Q   | R        |"
    ].join("\n"));
    expect(edit.markdown.slice(edit.selection.from, edit.selection.to)).toBe("R");
  });

  it("can paste TSV into the header row and fill data rows below it", () => {
    const source = "| A | B |\n| --- | --- |\n| x | y |";
    const edit = applyTableTsvPaste(source, { from: source.indexOf("A"), to: source.indexOf("A") }, "Name\tCount\nAlpha\t2")!;

    expect(edit.markdown).toBe([
      "| Name  | Count |",
      "| ----- | ----- |",
      "| Alpha | 2     |"
    ].join("\n"));
    expect(edit.markdown.slice(edit.selection.from, edit.selection.to)).toBe("2");
  });
});

function fullCellRange(markdown: string, cellText: string): { from: number; to: number } {
  const cellStart = markdown.indexOf(cellText);
  if (cellStart < 0) throw new Error(`Missing cell text: ${cellText}`);

  const lineStart = markdown.lastIndexOf("\n", cellStart) + 1;
  const nextLineStart = markdown.indexOf("\n", cellStart);
  const lineEnd = nextLineStart === -1 ? markdown.length : nextLineStart;
  const pipeBefore = markdown.lastIndexOf("|", cellStart);
  const pipeAfter = markdown.indexOf("|", cellStart + cellText.length);

  if (pipeBefore < lineStart || pipeAfter < 0 || pipeAfter > lineEnd) {
    throw new Error(`Cell text is not inside a simple pipe table cell: ${cellText}`);
  }

  return { from: pipeBefore + 1, to: pipeAfter };
}

function expectSelectedEmptyCell(markdown: string, range: { from: number; to: number }): void {
  const selected = markdown.slice(range.from, range.to);
  expect(range.to).toBeGreaterThan(range.from);
  expect(selected).not.toContain("|");
  expect(selected.trim()).toBe("");
}
