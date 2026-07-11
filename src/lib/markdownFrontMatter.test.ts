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

  it("does not mistake an unclosed thematic break for front matter", () => {
    expect(splitMarkdownFrontMatter("---\n# Body")).toEqual({ frontMatter: "", body: "---\n# Body" });
  });
});
