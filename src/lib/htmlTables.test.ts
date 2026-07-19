import { describe, expect, it } from "vitest";
import { htmlTableToRows } from "./htmlTables";

describe("HTML table paste helpers", () => {
  it("ignores non-table HTML", () => {
    expect(htmlTableToRows("<p>Alpha</p>")).toBeNull();
  });

  it("does not extract a table from mixed HTML content", () => {
    expect(htmlTableToRows("<p>Before</p><table><tr><td>A</td></tr></table><p>After</p>")).toBeNull();
    expect(htmlTableToRows("<table><tr><td>A</td></tr></table><table><tr><td>B</td></tr></table>")).toBeNull();
  });

  it("allows clipboard comments and empty wrappers around a table", () => {
    expect(htmlTableToRows("<!--StartFragment--><div><table><tr><td>A</td></tr></table></div><!--EndFragment-->")).toEqual([
      ["A"]
    ]);
  });

  it("parses simple HTML tables without relying on a browser DOMParser", () => {
    expect(htmlTableToRows("<table><tr><th>Name</th><th>Score</th></tr><tr><td>Beta</td><td>10</td></tr></table>")).toEqual([
      ["Name", "Score"],
      ["Beta", "10"]
    ]);
  });

  it("decodes basic entities and repeated colspan cells in the fallback parser", () => {
    expect(htmlTableToRows("<table><tr><td colspan=\"2\">A&amp;B</td><td>Tail<br>line</td></tr></table>")).toEqual([
      ["A&B", "A&B", "Tail\nline"]
    ]);
  });

  it("carries rowspan cells through later rows in the fallback parser", () => {
    expect(htmlTableToRows([
      "<table>",
      "<tr><th rowspan=\"2\">Name</th><th>Q1</th></tr>",
      "<tr><td>10</td></tr>",
      "</table>"
    ].join(""))).toEqual([
      ["Name", "Q1"],
      ["Name", "10"]
    ]);
  });

  it("decodes numeric entities in fallback cell text", () => {
    expect(htmlTableToRows("<table><tr><td>&#72;&#x69;</td><td>&#160;A</td></tr></table>")).toEqual([
      ["Hi", "A"]
    ]);
  });

  it("converts safe HTML links in table cells to Markdown links", () => {
    expect(htmlTableToRows([
      "<table><tr><th>Name</th><th>Link</th></tr>",
      "<tr><td>Guide</td><td><a href=\"https://example.com/docs\">Docs</a></td></tr>",
      "<tr><td>Mail</td><td><a href=\"mailto:hello@example.com\">hello@example.com</a></td></tr>",
      "</table>"
    ].join(""))).toEqual([
      ["Name", "Link"],
      ["Guide", "[Docs](https://example.com/docs)"],
      ["Mail", "[hello@example.com](mailto:hello@example.com)"]
    ]);
  });

  it("drops unsafe HTML link destinations while keeping the label", () => {
    expect(htmlTableToRows("<table><tr><td><a href=\"javascript:alert(1)\">Bad</a></td></tr></table>")).toEqual([
      ["Bad"]
    ]);
  });

  it("wraps HTML link destinations with spaces or parentheses safely", () => {
    expect(htmlTableToRows("<table><tr><td><a href=\"https://example.com/a path_(v2)\">A]B</a></td></tr></table>")).toEqual([
      ["[A\\]B](<https://example.com/a path_(v2)>)"]
    ]);
  });
});
