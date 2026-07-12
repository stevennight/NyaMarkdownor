import { describe, expect, it } from "vitest";
import { splitMarkdownFrontMatter, withMarkdownFrontMatter } from "./markdownFrontMatter";

describe("Markdown front matter", () => {
  it("separates and restores YAML front matter without changing its bytes", () => {
    const markdown = "---\r\ntitle: Draft\r\ntags:\r\n  - notes\r\n---\r\n# Body\r\n";
    const parts = splitMarkdownFrontMatter(markdown);

    expect(parts).toEqual({
      frontMatter: "---\r\ntitle: Draft\r\ntags:\r\n  - notes\r\n---\r\n",
      body: "# Body\r\n"
    });
    expect(withMarkdownFrontMatter(parts.frontMatter, parts.body)).toBe(markdown);
  });

  it("supports TOML front matter", () => {
    expect(splitMarkdownFrontMatter("+++\ntitle = 'Draft'\n+++\n# Body")).toEqual({
      frontMatter: "+++\ntitle = 'Draft'\n+++\n",
      body: "# Body"
    });
  });

  it("supports an empty front matter block and a closing delimiter at EOF", () => {
    expect(splitMarkdownFrontMatter("---\n---\n# Body")).toEqual({
      frontMatter: "---\n---\n",
      body: "# Body"
    });
    const frontMatterOnly = splitMarkdownFrontMatter("---\nname: workflow-skill\n---");
    expect(frontMatterOnly).toEqual({
      frontMatter: "---\nname: workflow-skill\n---",
      body: ""
    });
    expect(withMarkdownFrontMatter(frontMatterOnly.frontMatter, "# Body")).toBe(
      "---\nname: workflow-skill\n---\n# Body"
    );
  });

  it("does not mistake an unclosed thematic break for front matter", () => {
    expect(splitMarkdownFrontMatter("---\n# Body")).toEqual({ frontMatter: "", body: "---\n# Body" });
  });

  it("does not treat arbitrary long thematic breaks as front matter delimiters", () => {
    const markdown = "--------\nname: workflow-skill\ndescription: xxx\n--------\n# Body";

    expect(splitMarkdownFrontMatter(markdown)).toEqual({ frontMatter: "", body: markdown });
  });

  it("only recognizes front matter at the first line of the document", () => {
    const markdown = "Intro\n---\nname: workflow-skill\n---\n";

    expect(splitMarkdownFrontMatter(markdown)).toEqual({ frontMatter: "", body: markdown });
  });
});
