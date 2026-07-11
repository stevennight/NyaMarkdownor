import { describe, expect, it } from "vitest";
import { clipboardPlainLineRowsFromText, clipboardRowsForTablePaste, clipboardSpaceAlignedRowsFromText, clipboardTableRowsFromData } from "./clipboardTableRows";

describe("clipboard table row detection", () => {
  it("detects pasted Markdown tables before TSV or CSV heuristics", () => {
    expect(clipboardTableRowsFromData({
      text: [
        "| Name | Score |",
        "| --- | ---: |",
        "| Beta | 10 |"
      ].join("\n")
    })).toEqual({
      source: "markdown",
      rows: [
        ["Name", "Score"],
        ["Beta", "10"]
      ],
      markdownTable: [
        "| Name | Score |",
        "| ---- | ----: |",
        "| Beta | 10    |"
      ].join("\n")
    });
  });

  it("uses text/markdown table data when plain text is already clean TSV", () => {
    expect(clipboardTableRowsFromData({
      text: "Name\tScore\nBeta\t10",
      markdown: [
        "| Name | Score |",
        "| --- | ---: |",
        "| Beta | 10 |"
      ].join("\n")
    })).toEqual({
      source: "markdown",
      rows: [
        ["Name", "Score"],
        ["Beta", "10"]
      ],
      markdownTable: [
        "| Name | Score |",
        "| ---- | ----: |",
        "| Beta | 10    |"
      ].join("\n")
    });
  });

  it("prefers rich HTML table data over Markdown clipboard data", () => {
    expect(clipboardTableRowsFromData({
      html: "<table><tr><th>HTML</th><th>Value</th></tr><tr><td>A</td><td>1</td></tr></table>",
      markdown: [
        "| Markdown | Value |",
        "| --- | --- |",
        "| B | 2 |"
      ].join("\n")
    })?.rows).toEqual([
      ["HTML", "Value"],
      ["A", "1"]
    ]);
  });

  it("keeps safe links from rich HTML tables as Markdown links", () => {
    expect(clipboardTableRowsFromData({
      html: "<table><tr><th>Name</th><th>Link</th></tr><tr><td>Guide</td><td><a href=\"https://example.com/docs\">Docs</a></td></tr></table>"
    })).toEqual({
      source: "html",
      rows: [
        ["Name", "Link"],
        ["Guide", "[Docs](https://example.com/docs)"]
      ],
      markdownTable: [
        "| Name  | Link                             |",
        "| ----- | -------------------------------- |",
        "| Guide | [Docs](https://example.com/docs) |"
      ].join("\n")
    });
  });

  it("keeps HTML table cell breaks when building Markdown table paste data", () => {
    expect(clipboardTableRowsFromData({
      html: "<table><tr><th>Note</th></tr><tr><td>line<br>break</td></tr></table>"
    })).toEqual({
      source: "html",
      rows: [
        ["Note"],
        ["line\nbreak"]
      ],
      markdownTable: [
        "| Note          |",
        "| ------------- |",
        "| line<br>break |"
      ].join("\n")
    });
  });

  it("detects TSV grids and builds an insertable Markdown table", () => {
    expect(clipboardTableRowsFromData({ text: "Name\tScore\nBeta\t10" })).toEqual({
      source: "tsv",
      rows: [
        ["Name", "Score"],
        ["Beta", "10"]
      ],
      markdownTable: [
        "| Name | Score |",
        "| ---- | ----- |",
        "| Beta | 10    |"
      ].join("\n")
    });
  });

  it("treats browser unit-separator table payloads as TSV", () => {
    expect(clipboardTableRowsFromData({ text: "North\u001fSouth\nEast\u001fWest" })).toEqual({
      source: "tsv",
      rows: [
        ["North", "South"],
        ["East", "West"]
      ],
      markdownTable: [
        "| North | South |",
        "| ----- | ----- |",
        "| East  | West  |"
      ].join("\n")
    });
  });

  it("detects obvious CSV tables but ignores ordinary comma prose", () => {
    expect(clipboardTableRowsFromData({ text: "Name,Score\nBeta,10" })?.source).toBe("csv");
    expect(clipboardTableRowsFromData({ text: "hello, world" })).toBeNull();
    expect(clipboardTableRowsFromData({ text: "hello, world\nthis second line is prose" })).toBeNull();
    expect(clipboardTableRowsFromData({ text: "Name,Score\nBeta" })).toBeNull();
  });

  it("detects conservative space-aligned text tables", () => {
    expect(clipboardSpaceAlignedRowsFromText([
      "Name    Score    Note",
      "Beta    10       fast",
      "Alpha   2        calm"
    ].join("\n"))).toEqual([
      ["Name", "Score", "Note"],
      ["Beta", "10", "fast"],
      ["Alpha", "2", "calm"]
    ]);

    expect(clipboardTableRowsFromData({
      text: [
        "Name    Score",
        "Beta    10"
      ].join("\n")
    })).toEqual({
      source: "space",
      rows: [
        ["Name", "Score"],
        ["Beta", "10"]
      ],
      markdownTable: [
        "| Name | Score |",
        "| ---- | ----- |",
        "| Beta | 10    |"
      ].join("\n")
    });
  });

  it("keeps ordinary multiline prose on the plain-line paste path", () => {
    const prose = [
      "This has  two spaces once",
      "but this line is ordinary prose",
      "and should not become columns"
    ].join("\n");

    expect(clipboardSpaceAlignedRowsFromText(prose)).toBeNull();
    expect(clipboardRowsForTablePaste({ text: prose })?.source).toBe("lines");
  });

  it("ignores table-looking Markdown inside code examples", () => {
    expect(clipboardTableRowsFromData({
      text: [
        "```md",
        "| Not | A table |",
        "| --- | ------- |",
        "```"
      ].join("\n")
    })).toBeNull();
  });

  it("detects plain newline-separated rows for table-only paste handling", () => {
    expect(clipboardPlainLineRowsFromText("Alpha\nBeta\nGamma")).toEqual([
      ["Alpha"],
      ["Beta"],
      ["Gamma"]
    ]);
    expect(clipboardRowsForTablePaste({ text: "Alpha\nBeta\nGamma" })).toEqual({
      source: "lines",
      rows: [
        ["Alpha"],
        ["Beta"],
        ["Gamma"]
      ],
      markdownTable: null
    });
    expect(clipboardPlainLineRowsFromText("Alpha")).toBeNull();
    expect(clipboardPlainLineRowsFromText("Alpha\t2\nBeta\t3")).toBeNull();
  });

  it("cleans Markdown list markers when plain lines fill table cells", () => {
    expect(clipboardPlainLineRowsFromText([
      "- **Alpha**",
      "- [Beta](https://example.com)",
      "- `Gamma`"
    ].join("\n"))).toEqual([
      ["Alpha"],
      ["Beta"],
      ["Gamma"]
    ]);
    expect(clipboardPlainLineRowsFromText("1. Alpha\n2. Beta")).toEqual([
      ["Alpha"],
      ["Beta"]
    ]);
    expect(clipboardPlainLineRowsFromText("- [x] Done\n- [ ] Todo")).toEqual([
      ["Done"],
      ["Todo"]
    ]);
  });

  it("does not clean TSV table cells through the plain-line path", () => {
    expect(clipboardRowsForTablePaste({ text: "**Name**\tScore\n**Beta**\t10" })).toEqual({
      source: "tsv",
      rows: [
        ["**Name**", "Score"],
        ["**Beta**", "10"]
      ],
      markdownTable: [
        "| **Name** | Score |",
        "| -------- | ----- |",
        "| **Beta** | 10    |"
      ].join("\n")
    });
  });
});
