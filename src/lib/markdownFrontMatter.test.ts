import { describe, expect, it } from "vitest";
import {
  markdownFrontMatterEditor,
  promoteMarkdownFrontMatter,
  splitMarkdownFrontMatter,
  updateMarkdownFrontMatterContent,
  withMarkdownFrontMatter
} from "./markdownFrontMatter";

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

  it("promotes newly completed visual-editor front matter out of the document body", () => {
    expect(promoteMarkdownFrontMatter("", "---\nname: n\n---\n# Body")).toEqual({
      frontMatter: "---\nname: n\n---\n",
      body: "# Body",
      promoted: true
    });
    expect(promoteMarkdownFrontMatter("", "Intro\n---\nname: n\n---")).toEqual({
      frontMatter: "",
      body: "Intro\n---\nname: n\n---",
      promoted: false
    });
  });

  it("does not promote a second front matter block when one already exists", () => {
    expect(promoteMarkdownFrontMatter("---\ntitle: Existing\n---\n", "---\nname: body\n---")).toEqual({
      frontMatter: "---\ntitle: Existing\n---\n",
      body: "---\nname: body\n---",
      promoted: false
    });
  });

  it("builds a visual-editor model without exposing the delimiters", () => {
    expect(markdownFrontMatterEditor("---\r\nname: workflow-skill\r\ndescription: xxx\r\n---\r\n")).toEqual({
      delimiter: "---",
      format: "YAML",
      content: "name: workflow-skill\r\ndescription: xxx",
      lineEnding: "\r\n",
      trailingLineEnding: true
    });
    expect(markdownFrontMatterEditor("+++\nname = 'Draft'\n+++")).toEqual({
      delimiter: "+++",
      format: "TOML",
      content: "name = 'Draft'",
      lineEnding: "\n",
      trailingLineEnding: false
    });
  });

  it("updates only front matter content while preserving its envelope", () => {
    expect(updateMarkdownFrontMatterContent(
      "---\r\nname: old\r\n---\r\n",
      "name: new\ndescription: changed"
    )).toBe("---\r\nname: new\r\ndescription: changed\r\n---\r\n");
    expect(updateMarkdownFrontMatterContent("---\n---\n", "name: added"))
      .toBe("---\nname: added\n---\n");
    expect(updateMarkdownFrontMatterContent("---\nname: removed\n---\n", ""))
      .toBe("---\n---\n");
    expect(updateMarkdownFrontMatterContent("not front matter", "name: ignored"))
      .toBe("not front matter");
  });
});
