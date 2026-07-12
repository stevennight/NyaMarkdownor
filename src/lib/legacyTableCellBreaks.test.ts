import { describe, expect, it } from "vitest";
import { migrateLegacyTableCellBreaks } from "./legacyTableCellBreaks";

describe("legacy table cell breaks", () => {
  it("migrates separators in table headers and body cells", () => {
    const source = [
      "| first\u001fsecond | Note |",
      "| --- | --- |",
      "| body\u001fline | tail |",
      "| later\u001fbody | final |"
    ].join("\n");

    expect(migrateLegacyTableCellBreaks(source)).toBe([
      "| first<br>second | Note |",
      "| --- | --- |",
      "| body<br>line | tail |",
      "| later<br>body | final |"
    ].join("\n"));
  });

  it("does not reinterpret separators outside Markdown table cells", () => {
    const source = [
      "plain\u001ftext",
      "",
      "```markdown",
      "| code\u001fcell |",
      "| --- |",
      "```",
      "",
      "not | a\u001ftable"
    ].join("\n");

    expect(migrateLegacyTableCellBreaks(source)).toBe(source);
  });

  it("migrates separators in quoted Markdown table cells", () => {
    const source = [
      "> | Name | Note |",
      "> | --- | --- |",
      "> | Alice | first\u001fsecond |"
    ].join("\n");

    expect(migrateLegacyTableCellBreaks(source)).toBe([
      "> | Name | Note |",
      "> | --- | --- |",
      "> | Alice | first<br>second |"
    ].join("\n"));
  });

  it("migrates separators in nested quoted Markdown table cells", () => {
    const source = [
      "> > | Name | Note |",
      "> > | --- | --- |",
      "> > | Alice | first\u001fsecond |"
    ].join("\n");

    expect(migrateLegacyTableCellBreaks(source)).toBe([
      "> > | Name | Note |",
      "> > | --- | --- |",
      "> > | Alice | first<br>second |"
    ].join("\n"));
  });

  it("does not reinterpret literal separators in inline code", () => {
    const source = [
      "| Name | Note |",
      "| --- | --- |",
      "| Alice | `first\u001fsecond` and third\u001ffourth |"
    ].join("\n");

    expect(migrateLegacyTableCellBreaks(source)).toBe([
      "| Name | Note |",
      "| --- | --- |",
      "| Alice | `first\u001fsecond` and third<br>fourth |"
    ].join("\n"));
  });

  it("does not reinterpret table-looking content in fenced or indented code", () => {
    const source = [
      "```markdown",
      "| code\u001fcell |",
      "| --- |",
      "```not-a-close",
      "| still\u001fcode |",
      "| --- |",
      "```",
      "",
      "    | indented\u001fcode |",
      "    | --- |"
    ].join("\n");

    expect(migrateLegacyTableCellBreaks(source)).toBe(source);
  });

  it("does not reinterpret quoted table-looking content in code fences", () => {
    const source = [
      "> ```markdown",
      "> | code\u001fcell |",
      "> | --- |",
      "> ```",
      "",
      "```markdown",
      "> | outer\u001fcode |",
      "> | --- |",
      "```"
    ].join("\n");

    expect(migrateLegacyTableCellBreaks(source)).toBe(source);
  });

  it("does not reinterpret quoted indented code as a table", () => {
    const source = [
      ">     | code\u001fcell |",
      ">     | --- |"
    ].join("\n");

    expect(migrateLegacyTableCellBreaks(source)).toBe(source);
  });

  it("leaves documents without legacy separators unchanged", () => {
    const source = "| Name |\n| --- |\n| line<br>break |";
    expect(migrateLegacyTableCellBreaks(source)).toBe(source);
  });
});
