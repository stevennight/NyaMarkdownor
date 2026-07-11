import { describe, expect, it } from "vitest";
import { getSelectionSummary, hasNonEmptySelection, hasStructuredTableSelection, markdownFromSelectionRanges, selectionRangesOrWholeDocument, shouldHandleSmartCopy } from "./selectionCopy";

describe("smart copy policy", () => {
  it("only intercepts copy when enabled and text is selected", () => {
    expect(shouldHandleSmartCopy(true, true)).toBe(true);
    expect(shouldHandleSmartCopy(true, false)).toBe(false);
    expect(shouldHandleSmartCopy(false, true)).toBe(false);
  });
});

describe("selection copy helpers", () => {
  it("joins multiple source selections in document order", () => {
    const markdown = "alpha\nbeta\ngamma";

    expect(markdownFromSelectionRanges(markdown, [
      { from: markdown.indexOf("gamma"), to: markdown.length },
      { from: 0, to: "alpha".length }
    ])).toBe("alpha\ngamma");
  });

  it("merges overlapping and adjacent source selections before copying", () => {
    const markdown = "abcdef";
    const ranges = [
      { from: 2, to: 5 },
      { from: 0, to: 3 },
      { from: 5, to: 6 }
    ];

    expect(markdownFromSelectionRanges(markdown, ranges)).toBe("abcdef");
    expect(selectionRangesOrWholeDocument(ranges, markdown.length)).toEqual([{ from: 0, to: 6 }]);
    expect(getSelectionSummary(ranges, markdown.length)).toEqual({
      rangeCount: 1,
      charCount: 6
    });
  });

  it("copies structured table selections as clean Markdown tables", () => {
    const markdown = [
      "| Name | Score | Note |",
      "| --- | ---: | --- |",
      "| Beta | 10 | fast |",
      "| Alpha | 2 | calm |"
    ].join("\n");

    expect(markdownFromSelectionRanges(markdown, [
      fullCellRange(markdown, "Score"),
      fullCellRange(markdown, "10"),
      fullCellRange(markdown, "2")
    ])).toBe([
      "| Score |",
      "| ----: |",
      "| 10    |",
      "| 2     |"
    ].join("\n"));
  });

  it("falls back to the whole document when there is no non-empty selection", () => {
    const markdown = "alpha";

    expect(markdownFromSelectionRanges(markdown, [{ from: 2, to: 2 }])).toBe(markdown);
    expect(selectionRangesOrWholeDocument([{ from: 2, to: 2 }], markdown.length)).toEqual([{ from: 0, to: markdown.length }]);
    expect(hasNonEmptySelection([{ from: 2, to: 2 }], markdown.length)).toBe(false);
  });

  it("summarizes multi-range selections after clamping and sorting", () => {
    expect(getSelectionSummary([
      { from: 10, to: 14 },
      { from: 2, to: 2 },
      { from: 8, to: 4 },
      { from: -3, to: 1 }
    ], 12)).toEqual({
      rangeCount: 3,
      charCount: 7
    });
  });

  it("labels selected table columns and column bodies", () => {
    const markdown = [
      "| Name | Score |",
      "| --- | ---: |",
      "| Beta | 10 |",
      "| Alpha | 2 |"
    ].join("\n");

    expect(getSelectionSummary([
      fullCellRange(markdown, "Score"),
      fullCellRange(markdown, "10"),
      fullCellRange(markdown, "2")
    ], markdown).tableLabel).toBe("Table column selected: 3 cells");

    expect(getSelectionSummary([
      fullCellRange(markdown, "10"),
      fullCellRange(markdown, "2")
    ], markdown).tableLabel).toBe("Table column body selected: 2 cells");
  });

  it("labels selected table rows, bodies, and whole tables", () => {
    const markdown = [
      "Intro",
      "",
      "| Name | Score |",
      "| --- | ---: |",
      "| Beta | 10 |",
      "| Alpha | 2 |",
      "",
      "Tail"
    ].join("\n");

    expect(getSelectionSummary([
      fullCellRange(markdown, "Beta"),
      fullCellRange(markdown, "10")
    ], markdown).tableLabel).toBe("Table row selected: 2 cells");

    expect(getSelectionSummary([
      fullCellRange(markdown, "Beta"),
      fullCellRange(markdown, "10"),
      fullCellRange(markdown, "Alpha"),
      fullCellRange(markdown, "2")
    ], markdown).tableLabel).toBe("Table body selected: 4 cells");

    const tableStart = markdown.indexOf("| Name");
    const tableEnd = markdown.indexOf("\n\nTail");
    expect(getSelectionSummary([{ from: tableStart, to: tableEnd }], markdown).tableLabel).toBe("Table selected: 6 cells");
  });

  it("labels and copies table selections that include only adjacent whitespace", () => {
    const markdown = [
      "Intro",
      "",
      "| Name | Score |",
      "| --- | ---: |",
      "| Beta | 10 |",
      "",
      "Tail"
    ].join("\n");
    const from = markdown.indexOf("\n\n| Name") + 1;
    const to = markdown.indexOf("Tail");

    expect(getSelectionSummary([{ from, to }], markdown).tableLabel).toBe("Table selected: 4 cells");
    expect(markdownFromSelectionRanges(markdown, [{ from, to }])).toBe([
      "| Name | Score |",
      "| ---- | ----: |",
      "| Beta | 10    |"
    ].join("\n"));
  });

  it("keeps selections with real text outside a table as ordinary selections", () => {
    const markdown = [
      "Intro",
      "",
      "| Name | Score |",
      "| --- | ---: |",
      "| Beta | 10 |",
      "",
      "Tail"
    ].join("\n");
    const to = markdown.indexOf("Tail");
    const summary = getSelectionSummary([{ from: 0, to }], markdown);

    expect(summary.tableLabel).toBeUndefined();
    expect(markdownFromSelectionRanges(markdown, [{ from: 0, to }])).toBe(markdown.slice(0, to));
  });

  it("labels pipe-light table rows with escaped trailing pipes", () => {
    const markdown = [
      "Name | Note",
      "--- | ---",
      "Alpha | ends with pipe\\|"
    ].join("\n");

    expect(getSelectionSummary([
      sourceRange(markdown, "Alpha"),
      sourceRange(markdown, "ends with pipe\\|")
    ], markdown).tableLabel).toBe("Table body selected: 2 cells");
  });

  it("labels rectangular and sparse table cell selections", () => {
    const markdown = [
      "| A | B | C | D |",
      "| --- | --- | --- | --- |",
      "| a1 | b1 | c1 | d1 |",
      "| a2 | b2 | c2 | d2 |"
    ].join("\n");

    expect(getSelectionSummary([
      fullCellRange(markdown, "b1"),
      fullCellRange(markdown, "c1"),
      fullCellRange(markdown, "b2"),
      fullCellRange(markdown, "c2")
    ], markdown).tableLabel).toBe("Table range selected: 2x2 cells");

    expect(getSelectionSummary([
      fullCellRange(markdown, "b1"),
      fullCellRange(markdown, "d2")
    ], markdown).tableLabel).toBe("Table cells selected: 2 cells");
  });

  it("keeps partial text selections inside table cells as ordinary text selections", () => {
    const markdown = [
      "| Name | Score |",
      "| --- | ---: |",
      "| **Beta** | 10 |"
    ].join("\n");
    const beta = markdown.indexOf("Beta");

    expect(getSelectionSummary([{ from: beta, to: beta + "Beta".length }], markdown)).toEqual({
      rangeCount: 1,
      charCount: 4
    });
  });

  it("summarizes selected empty table cells as structured table selections", () => {
    const markdown = [
      "| Name | Score |",
      "| --- | ---: |",
      "| Beta |      |"
    ].join("\n");
    const summary = getSelectionSummary([emptyCellRange(markdown, "| Beta")], markdown);

    expect(summary.tableLabel).toBe("Table column body selected: 1 cells");
    expect(hasStructuredTableSelection(summary)).toBe(true);
  });

  it("distinguishes structured table selections from ordinary selections for table-only commands", () => {
    const markdown = [
      "| Name | Score |",
      "| --- | ---: |",
      "| **Beta** | 10 |"
    ].join("\n");
    const beta = markdown.indexOf("Beta");

    expect(hasStructuredTableSelection(getSelectionSummary([fullCellRange(markdown, "10")], markdown))).toBe(true);
    expect(hasStructuredTableSelection(getSelectionSummary([sourceRange(markdown, "**Beta**")], markdown))).toBe(true);
    expect(hasStructuredTableSelection(getSelectionSummary([{ from: beta, to: beta + "Beta".length }], markdown))).toBe(false);
  });
});

function sourceRange(markdown: string, text: string): { from: number; to: number } {
  const from = markdown.indexOf(text);
  if (from < 0) throw new Error(`Missing source text: ${text}`);
  return { from, to: from + text.length };
}

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

function emptyCellRange(markdown: string, rowText: string): { from: number; to: number } {
  const rowStart = markdown.indexOf(rowText);
  if (rowStart < 0) throw new Error(`Missing row text: ${rowText}`);
  const rowEnd = markdown.indexOf("\n", rowStart);
  const lineEnd = rowEnd === -1 ? markdown.length : rowEnd;
  const pipeAfterPreviousCell = markdown.indexOf("|", rowStart + rowText.length);
  const pipeAfterEmptyCell = markdown.indexOf("|", pipeAfterPreviousCell + 1);

  if (pipeAfterPreviousCell < rowStart || pipeAfterEmptyCell < 0 || pipeAfterEmptyCell > lineEnd) {
    throw new Error(`Missing empty trailing cell in row: ${rowText}`);
  }

  return { from: pipeAfterPreviousCell + 1, to: pipeAfterEmptyCell };
}
