import { describe, expect, it } from "vitest";
import type { MarkdownTable } from "../types";
import {
  buildMarkdownTable,
  csvToMarkdownTable,
  deleteColumn,
  deleteRow,
  duplicateColumn,
  duplicateRow,
  fillTableCells,
  findTableAtOffset,
  insertColumn,
  insertRow,
  markdownTableTextToMarkdownTable,
  markdownTableTextToRows,
  moveColumn,
  moveRow,
  parseMarkdownTable,
  parseCsvRows,
  parseTsvRows,
  rowsToMarkdownTable,
  setColumnAlignment,
  sortTableRows,
  tableToTsv,
  tsvToMarkdownTable,
  updateTableCell
} from "./tables";

describe("Markdown table utilities", () => {
  it("parses and rebuilds a table without forcing alignment markers", () => {
    const table = parseMarkdownTable([
      "| Name | Count |",
      "| --- | ---: |",
      "| Alpha | 2 |"
    ]);

    expect(table).toEqual({
      headers: ["Name", "Count"],
      aligns: ["none", "right"],
      rows: [["Alpha", "2"]]
    });

    expect(buildMarkdownTable(table!)).toBe([
      "| Name  | Count |",
      "| ----- | ----: |",
      "| Alpha | 2     |"
    ].join("\n"));
  });

  it("aligns generated tables using escaped cell width", () => {
    const table: MarkdownTable = {
      headers: ["Expression", "Value"],
      aligns: ["none", "none"],
      rows: [
        ["a|b", "1"],
        ["line\nbreak", "2"]
      ]
    };

    expect(buildMarkdownTable(table)).toBe([
      "| Expression    | Value |",
      "| ------------- | ----- |",
      "| a\\|b          | 1     |",
      "| line<br>break | 2     |"
    ].join("\n"));
  });

  it("round-trips cells where a literal backslash sits before a pipe", () => {
    const table: MarkdownTable = {
      headers: ["Pattern", "Meaning"],
      aligns: ["none", "none"],
      rows: [
        ["path\\|pipe", "one slash before pipe"],
        ["path\\\\|pipe", "two slashes before pipe"]
      ]
    };
    const markdown = buildMarkdownTable(table);

    expect(markdown).toBe([
      "| Pattern        | Meaning                 |",
      "| -------------- | ----------------------- |",
      "| path\\\\\\|pipe   | one slash before pipe   |",
      "| path\\\\\\\\\\|pipe | two slashes before pipe |"
    ].join("\n"));
    expect(parseMarkdownTable(markdown.split("\n"))).toEqual(table);
  });

  it("aligns generated tables with emoji and CJK display widths", () => {
    const table: MarkdownTable = {
      headers: ["Icon", "Label"],
      aligns: ["none", "none"],
      rows: [
        ["✅", "done"],
        ["中", "wide"]
      ]
    };

    expect(buildMarkdownTable(table)).toBe([
      "| Icon | Label |",
      "| ---- | ----- |",
      "| ✅   | done  |",
      "| 中   | wide  |"
    ].join("\n"));
  });

  it("keeps escaped trailing pipes in final cells without requiring a closing row pipe", () => {
    const table = parseMarkdownTable([
      "Name | Note",
      "--- | ---",
      "Alpha | ends with pipe\\|"
    ]);

    expect(table).toEqual({
      headers: ["Name", "Note"],
      aligns: ["none", "none"],
      rows: [["Alpha", "ends with pipe|"]]
    });
    expect(buildMarkdownTable(table!)).toBe([
      "| Name  | Note             |",
      "| ----- | ---------------- |",
      "| Alpha | ends with pipe\\| |"
    ].join("\n"));
  });

  it("recognizes table separators after even numbers of backslashes", () => {
    const table = parseMarkdownTable([
      "Path\\\\| Value",
      "--- | ---",
      "C:\\\\| ok"
    ]);

    expect(table?.headers).toEqual(["Path\\\\", "Value"]);
    expect(table?.rows).toEqual([["C:\\\\", "ok"]]);
  });

  it("finds the table around the cursor and returns byte offsets for replacement", () => {
    const markdown = [
      "# Demo",
      "",
      "| A | B |",
      "| --- | --- |",
      "| x | y |",
      "",
      "tail"
    ].join("\n");

    const offset = markdown.indexOf("x");
    const block = findTableAtOffset(markdown, offset);

    expect(block?.startLine).toBe(2);
    expect(block?.endLine).toBe(4);
    expect(markdown.slice(block!.startOffset, block!.endOffset)).toBe([
      "| A | B |",
      "| --- | --- |",
      "| x | y |",
      ""
    ].join("\n"));
  });

  it("keeps the optimized table lookup equivalent after code context is known", () => {
    const markdown = [
      "# Demo",
      "",
      "| A | B |",
      "| --- | --- |",
      "| x | y |",
      "",
      "tail"
    ].join("\n");
    const offset = markdown.indexOf("x");

    expect(findTableAtOffset(markdown, offset, {
      assumeNonCodeLine: true,
      deferLineNumberCalculation: true
    })).toEqual(findTableAtOffset(markdown, offset));
  });

  it("maps a cursor after the trailing row pipe to the last table cell", () => {
    const markdown = "| A | B |\n| --- | --- |\n| x | y |";
    const block = findTableAtOffset(markdown, markdown.length);

    expect(block?.position).toEqual({ row: 2, col: 1 });
  });

  it("does not treat the blank line after a table as part of the active table", () => {
    const markdown = [
      "| A | B |",
      "| --- | --- |",
      "| x | y |",
      "",
      "tail"
    ].join("\n");

    expect(findTableAtOffset(markdown, markdown.indexOf("tail") - 1)).toBeNull();
  });

  it("ignores table-looking text inside fenced code blocks", () => {
    const markdown = [
      "```md",
      "| Not | A table |",
      "| --- | ------- |",
      "| x   | y       |",
      "```",
      "",
      "| Real | Table |",
      "| ---- | ----- |",
      "| yes  | ok    |"
    ].join("\n");

    expect(findTableAtOffset(markdown, markdown.indexOf("Not"))).toBeNull();
    expect(findTableAtOffset(markdown, markdown.indexOf("yes"))?.table.headers).toEqual(["Real", "Table"]);
  });

  it("ignores table-looking text inside tilde fenced code blocks", () => {
    const markdown = [
      "~~~~",
      "| Not | A table |",
      "| --- | ------- |",
      "~~~~"
    ].join("\n");

    expect(findTableAtOffset(markdown, markdown.indexOf("Not"))).toBeNull();
  });

  it("ignores table-looking indented code blocks", () => {
    const markdown = [
      "    | Not | A table |",
      "    | --- | ------- |",
      "    | x   | y       |",
      "",
      "| Real | Table |",
      "| ---- | ----- |",
      "| yes  | ok    |"
    ].join("\n");

    expect(findTableAtOffset(markdown, markdown.indexOf("Not"))).toBeNull();
    expect(findTableAtOffset(markdown, markdown.indexOf("yes"))?.table.headers).toEqual(["Real", "Table"]);
  });

  it("does not absorb adjacent indented code into a table range", () => {
    const markdown = [
      "| A | B |",
      "| --- | --- |",
      "| x | y |",
      "    | code | sample |"
    ].join("\n");
    const block = findTableAtOffset(markdown, markdown.indexOf("x"));

    expect(block?.endLine).toBe(2);
    expect(markdown.slice(block!.startOffset, block!.endOffset)).toBe([
      "| A | B |",
      "| --- | --- |",
      "| x | y |",
      ""
    ].join("\n"));
  });

  it("supports structured row and column operations", () => {
    const table = parseMarkdownTable([
      "| A | B |",
      "| --- | --- |",
      "| x | y |"
    ])!;

    const withRow = insertRow(table, 1);
    expect(withRow.rows).toEqual([["x", "y"], ["", ""]]);

    const withColumn = insertColumn(withRow, 1);
    expect(withColumn.headers).toEqual(["A", "Column 2", "B"]);
    expect(withColumn.rows[0]).toEqual(["x", "", "y"]);

    const edited = updateTableCell(withColumn, 0, 1, "middle");
    expect(edited.rows[0]).toEqual(["x", "middle", "y"]);

    expect(deleteRow(edited, 1).rows).toEqual([["x", "middle", "y"]]);
    expect(deleteColumn(edited, 1).headers).toEqual(["A", "B"]);
  });

  it("moves rows and columns without mutating the source table", () => {
    const table: MarkdownTable = {
      headers: ["A", "B", "C"],
      aligns: ["left", "center", "right"],
      rows: [
        ["a1", "b1", "c1"],
        ["a2", "b2", "c2"]
      ]
    };

    const movedRow = moveRow(table, 1, -1);
    expect(movedRow.rows).toEqual([
      ["a2", "b2", "c2"],
      ["a1", "b1", "c1"]
    ]);

    const movedColumn = moveColumn(table, 1, 1);
    expect(movedColumn.headers).toEqual(["A", "C", "B"]);
    expect(movedColumn.aligns).toEqual(["left", "right", "center"]);
    expect(movedColumn.rows[0]).toEqual(["a1", "c1", "b1"]);

    expect(table.headers).toEqual(["A", "B", "C"]);
    expect(table.rows[0]).toEqual(["a1", "b1", "c1"]);
  });

  it("duplicates rows and columns without mutating the source table", () => {
    const table: MarkdownTable = {
      headers: ["A", "B"],
      aligns: ["left", "right"],
      rows: [
        ["a1", "b1"],
        ["a2", "b2"]
      ]
    };

    const withDuplicatedRow = duplicateRow(table, 0);
    expect(withDuplicatedRow.rows).toEqual([
      ["a1", "b1"],
      ["a1", "b1"],
      ["a2", "b2"]
    ]);

    const withDuplicatedColumn = duplicateColumn(table, 1);
    expect(withDuplicatedColumn.headers).toEqual(["A", "B", "B"]);
    expect(withDuplicatedColumn.aligns).toEqual(["left", "right", "right"]);
    expect(withDuplicatedColumn.rows).toEqual([
      ["a1", "b1", "b1"],
      ["a2", "b2", "b2"]
    ]);

    expect(table.headers).toEqual(["A", "B"]);
    expect(table.rows).toEqual([
      ["a1", "b1"],
      ["a2", "b2"]
    ]);
  });

  it("sorts table data rows numerically while preserving headers, alignment, and source rows", () => {
    const table: MarkdownTable = {
      headers: ["Name", "Score"],
      aligns: ["none", "right"],
      rows: [
        ["Beta", "10"],
        ["Alpha", "2"],
        ["Gamma", "1,200"],
        ["Missing", "N/A"],
        ["Empty", ""]
      ]
    };

    expect(sortTableRows(table, 1, "ascending")).toEqual({
      headers: ["Name", "Score"],
      aligns: ["none", "right"],
      rows: [
        ["Alpha", "2"],
        ["Beta", "10"],
        ["Gamma", "1,200"],
        ["Missing", "N/A"],
        ["Empty", ""]
      ]
    });

    expect(sortTableRows(table, 1, "descending").rows).toEqual([
      ["Gamma", "1,200"],
      ["Beta", "10"],
      ["Alpha", "2"],
      ["Missing", "N/A"],
      ["Empty", ""]
    ]);

    expect(table.rows).toEqual([
      ["Beta", "10"],
      ["Alpha", "2"],
      ["Gamma", "1,200"],
      ["Missing", "N/A"],
      ["Empty", ""]
    ]);
  });

  it("sorts table data rows naturally after stripping inline Markdown", () => {
    const table: MarkdownTable = {
      headers: ["Task"],
      aligns: ["none"],
      rows: [
        ["Item 10"],
        ["**alpha**"],
        ["Item 2"],
        ["[Beta](https://example.com)"]
      ]
    };

    expect(sortTableRows(table, 0, "ascending").rows).toEqual([
      ["**alpha**"],
      ["[Beta](https://example.com)"],
      ["Item 2"],
      ["Item 10"]
    ]);
  });

  it("sorts unpadded and localized date cells chronologically", () => {
    const table: MarkdownTable = {
      headers: ["Title", "Due"],
      aligns: ["none", "none"],
      rows: [
        ["Release", "2026-07-10"],
        ["Draft", "2026-7-2"],
        ["Plan", "2026年1月5日"],
        ["Archive", "2025/12/31"],
        ["Invalid", "2026-02-31"],
        ["Empty", ""]
      ]
    };

    expect(sortTableRows(table, 1, "ascending").rows).toEqual([
      ["Archive", "2025/12/31"],
      ["Plan", "2026年1月5日"],
      ["Draft", "2026-7-2"],
      ["Release", "2026-07-10"],
      ["Invalid", "2026-02-31"],
      ["Empty", ""]
    ]);

    expect(sortTableRows(table, 1, "descending").rows).toEqual([
      ["Release", "2026-07-10"],
      ["Draft", "2026-7-2"],
      ["Plan", "2026年1月5日"],
      ["Archive", "2025/12/31"],
      ["Invalid", "2026-02-31"],
      ["Empty", ""]
    ]);
  });

  it("builds parser-compatible alignment markers for compact columns", () => {
    const table: MarkdownTable = {
      headers: ["A", "B", "C", "D"],
      aligns: ["left", "center", "right", "none"],
      rows: [["1", "2", "3", "4"]]
    };

    const markdown = buildMarkdownTable(table);
    expect(markdown).toBe([
      "| A    | B     | C    | D   |",
      "| :--- | :---: | ---: | --- |",
      "| 1    | 2     | 3    | 4   |"
    ].join("\n"));
    expect(parseMarkdownTable(markdown.split("\n"))?.aligns).toEqual(["left", "center", "right", "none"]);
  });

  it("updates one column alignment without mutating the source table", () => {
    const table = parseMarkdownTable([
      "| A | B |",
      "| --- | --- |",
      "| x | y |"
    ])!;
    const aligned = setColumnAlignment(table, 1, "right");

    expect(table.aligns).toEqual(["none", "none"]);
    expect(aligned.aligns).toEqual(["none", "right"]);
  });

  it("round-trips spreadsheet TSV through Markdown table and TSV copy", () => {
    const markdown = tsvToMarkdownTable("Name\tCount\nAlpha\t2\nBeta\t3");
    expect(markdown).toBe([
      "| Name  | Count |",
      "| ----- | ----- |",
      "| Alpha | 2     |",
      "| Beta  | 3     |"
    ].join("\n"));

    const table = parseMarkdownTable(markdown!.split("\n"))!;
    expect(tableToTsv(table)).toBe("Name\tCount\nAlpha\t2\nBeta\t3");
  });

  it("builds Markdown tables from already parsed row data", () => {
    expect(rowsToMarkdownTable([
      ["Name", "Count"],
      ["Alpha", "2"]
    ])).toBe([
      "| Name  | Count |",
      "| ----- | ----- |",
      "| Alpha | 2     |"
    ].join("\n"));
  });

  it("builds one-column Markdown tables from explicit row data", () => {
    expect(rowsToMarkdownTable([
      ["Note"],
      ["line\nbreak"]
    ])).toBe([
      "| Note          |",
      "| ------------- |",
      "| line<br>break |"
    ].join("\n"));
  });

  it("extracts rows from pasted Markdown table text", () => {
    const source = [
      "",
      "| Name | Count |",
      "| --- | ---: |",
      "| Alpha | 2 |",
      ""
    ].join("\n");

    expect(markdownTableTextToRows(source)).toEqual([
      ["Name", "Count"],
      ["Alpha", "2"]
    ]);
    expect(markdownTableTextToMarkdownTable(source)).toBe([
      "| Name  | Count |",
      "| ----- | ----: |",
      "| Alpha | 2     |"
    ].join("\n"));
  });

  it("does not convert table-looking code examples when pasting Markdown table text", () => {
    expect(markdownTableTextToRows([
      "```md",
      "| Not | A table |",
      "| --- | ------- |",
      "| x   | y       |",
      "```"
    ].join("\n"))).toBeNull();

    expect(markdownTableTextToMarkdownTable([
      "    | Not | A table |",
      "    | --- | ------- |",
      "    | x   | y       |"
    ].join("\n"))).toBeNull();
  });

  it("finds real pasted Markdown tables after skipped code examples", () => {
    const source = [
      "```md",
      "| Not | A table |",
      "| --- | ------- |",
      "```",
      "",
      "| Real | Table |",
      "| ---- | ----- |",
      "| yes  | ok    |"
    ].join("\n");

    expect(markdownTableTextToRows(source)).toEqual([
      ["Real", "Table"],
      ["yes", "ok"]
    ]);
  });

  it("does not treat ordinary pipe text as a pasted Markdown table", () => {
    expect(markdownTableTextToRows("alpha | beta")).toBeNull();
  });

  it("parses quoted TSV cells from spreadsheets", () => {
    expect(parseTsvRows("\"A\tcell\"\tB\n\"line\nbreak\"\t\"quoted \"\"text\"\"\"")).toEqual([
      ["A\tcell", "B"],
      ["line\nbreak", "quoted \"text\""]
    ]);
  });

  it("preserves whitespace protected by CSV and TSV quotes", () => {
    expect(parseTsvRows("Name\tNote\nAlpha\t\"  padded  \"")).toEqual([
      ["Name", "Note"],
      ["Alpha", "  padded  "]
    ]);
    expect(parseCsvRows("Name,Note\n Alpha , \"  padded  \" ")).toEqual([
      ["Name", "Note"],
      ["Alpha", "  padded  "]
    ]);
  });

  it("preserves intentional blank rows inside TSV and CSV clipboard data", () => {
    expect(parseTsvRows("\nName\tNote\n\t\nAlpha\tReady\n\n")).toEqual([
      ["Name", "Note"],
      ["", ""],
      ["Alpha", "Ready"]
    ]);
    expect(parseCsvRows("\nName,Note\n,\nAlpha,Ready\n\n")).toEqual([
      ["Name", "Note"],
      ["", ""],
      ["Alpha", "Ready"]
    ]);
  });

  it("does not treat all-blank delimited clipboard text as table rows", () => {
    expect(parseTsvRows("\t\n\t\n")).toEqual([]);
    expect(parseCsvRows(",\n,\n")).toEqual([]);
  });

  it("parses quoted CSV cells and converts obvious CSV tables", () => {
    expect(parseCsvRows("Name,Notes\nAlpha,\"line\nbreak\"\nBeta,\"quoted \"\"text\"\"\"")).toEqual([
      ["Name", "Notes"],
      ["Alpha", "line\nbreak"],
      ["Beta", "quoted \"text\""]
    ]);

    expect(csvToMarkdownTable("Name,Count\nAlpha,2")).toBe([
      "| Name  | Count |",
      "| ----- | ----- |",
      "| Alpha | 2     |"
    ].join("\n"));
  });

  it("does not turn ordinary comma prose into a Markdown table", () => {
    expect(csvToMarkdownTable("hello, world")).toBeNull();
    expect(csvToMarkdownTable("hello, world\nthis second line is prose")).toBeNull();
    expect(csvToMarkdownTable("Name,Score\nBeta")).toBeNull();
  });

  it("fills existing table cells from TSV and expands rows and columns", () => {
    const table = parseMarkdownTable([
      "| A | B |",
      "| --- | --- |",
      "| x | y |"
    ])!;

    const filled = fillTableCells(table, 2, 1, parseTsvRows("Y\tZ\nQ\tR"));

    expect(filled.headers).toEqual(["A", "B", "Column 3"]);
    expect(filled.rows).toEqual([
      ["x", "Y", "Z"],
      ["", "Q", "R"]
    ]);
    expect(table.headers).toEqual(["A", "B"]);
  });
});
