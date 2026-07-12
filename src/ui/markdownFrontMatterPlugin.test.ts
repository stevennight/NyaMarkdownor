import { describe, expect, it } from "vitest";
import { markdownFrontMatterSyntaxRanges } from "./markdownFrontMatterPlugin";

describe("Markdown front matter source styling", () => {
  it("identifies YAML delimiters, property keys, and header lines", () => {
    const markdown = "---\nname: workflow-skill\ndescription: xxx\n---\n# Body";
    const ranges = markdownFrontMatterSyntaxRanges(markdown);

    expect(ranges.filter((range) => range.kind === "line")).toHaveLength(4);
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
});
