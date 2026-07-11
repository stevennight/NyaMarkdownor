import { describe, expect, it } from "vitest";
import { richTableClipboardFormats } from "./richTableClipboard";

describe("rich table clipboard formats", () => {
  it("exports rectangular visual-table selections as CSV, TSV, and Markdown", () => {
    expect(richTableClipboardFormats([
      ["Name", "Note"],
      ["Ava", "comma, quote \" text"]
    ])).toEqual({
      csv: "Name,Note\nAva,\"comma, quote \"\" text\"",
      html: "<table><thead><tr><th>Name</th><th>Note</th></tr></thead><tbody><tr><td>Ava</td><td>comma, quote &quot; text</td></tr></tbody></table>",
      markdown: "| Name | Note |\n| --- | --- |\n| Ava | comma, quote \" text |",
      plainText: "Name\tNote\nAva\tcomma, quote \" text",
      tsv: "Name\tNote\nAva\tcomma, quote \" text"
    });
  });

  it("keeps Markdown tables structurally valid when cells contain pipes or newlines", () => {
    expect(richTableClipboardFormats([
      ["A|B", "Line one\nLine two"],
      ["slash\\value", "ok"]
    ])?.markdown).toBe("| A\\|B | Line one<br>Line two |\n| --- | --- |\n| slash\\\\value | ok |");
  });

  it("escapes table cells for rich HTML clipboard consumers", () => {
    expect(richTableClipboardFormats([
      ["<Name>", "A & B"],
      ["Line one\nLine two", "quote ' \""]
    ])?.html).toBe("<table><thead><tr><th>&lt;Name&gt;</th><th>A &amp; B</th></tr></thead><tbody><tr><td>Line one<br>Line two</td><td>quote &#39; &quot;</td></tr></tbody></table>");
  });

  it("rejects empty and non-rectangular table data", () => {
    expect(richTableClipboardFormats([])).toBeNull();
    expect(richTableClipboardFormats([["A"], ["B", "C"]])).toBeNull();
  });
});
