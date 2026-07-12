import { describe, expect, it } from "vitest";
import { markdownFrontMatterSyntaxRanges } from "./markdownFrontMatterPlugin";

describe("Markdown front matter source styling", () => {
  it("identifies YAML delimiters, property keys, and header lines", () => {
    const markdown = "---\nname: workflow-skill\ndescription: xxx\n---\n# Body";
    const ranges = markdownFrontMatterSyntaxRanges(markdown);

    expect(ranges.filter((range) => range.kind === "line")).toHaveLength(4);
    expect(ranges.filter((range) => range.kind === "line").map((range) => range.lineRole))
      .toEqual(["start", "middle", "middle", "end"]);
    expect(ranges.filter((range) => range.kind === "delimiter").map((range) => markdown.slice(range.from, range.to)))
      .toEqual(["---", "---"]);
    expect(ranges.filter((range) => range.kind === "key").map((range) => markdown.slice(range.from, range.to)))
      .toEqual(["name", "description"]);
  });

  it("supports TOML keys without styling ordinary thematic breaks", () => {
    const toml = "+++\nname = 'workflow-skill'\n+++\n# Body";
    expect(markdownFrontMatterSyntaxRanges(toml).filter((range) => range.kind === "key")
      .map((range) => toml.slice(range.from, range.to))).toEqual(["name"]);
    expect(markdownFrontMatterSyntaxRanges("--------\nname: workflow-skill\n--------")).toEqual([]);
  });

  it("marks both edges of an empty YAML block", () => {
    const ranges = markdownFrontMatterSyntaxRanges("---\n---\n# Body");

    expect(ranges.filter((range) => range.kind === "line")).toEqual([
      { from: 0, to: 3, kind: "line", lineRole: "start" },
      { from: 4, to: 7, kind: "line", lineRole: "end" }
    ]);
  });

  it("keeps CRLF bytes and the document body outside source styling ranges", () => {
    const ranges = markdownFrontMatterSyntaxRanges("---\r\nname: x\r\n---\r\n# Body");

    expect(ranges.filter((range) => range.kind === "line")).toEqual([
      { from: 0, to: 3, kind: "line", lineRole: "start" },
      { from: 5, to: 12, kind: "line", lineRole: "middle" },
      { from: 14, to: 17, kind: "line", lineRole: "end" }
    ]);
    expect(ranges.filter((range) => range.kind === "key")).toEqual([
      { from: 5, to: 9, kind: "key" }
    ]);
  });
});
