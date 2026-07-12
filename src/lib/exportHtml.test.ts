import { describe, expect, it } from "vitest";
import { createExportHtmlDocument } from "./exportHtml";

describe("HTML export", () => {
  it("creates a complete local HTML document from Markdown", () => {
    const html = createExportHtmlDocument("# Title\n\n| A | B |\n| --- | --- |\n| x | y |", {
      title: "Notes.md"
    });

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<title>Notes.md</title>");
    expect(html).toContain('<main class="markdown-body">');
    expect(html).toContain('<h1 id="title">');
    expect(html).toContain("<table>");
    expect(html).toContain("@media print");
  });

  it("escapes the document title and Markdown raw HTML", () => {
    const html = createExportHtmlDocument("<script>alert(1)</script>", {
      title: 'Bad <Title> "x"'
    });

    expect(html).toContain("<title>Bad &lt;Title&gt; &quot;x&quot;</title>");
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("exports YAML front matter as a styled property block", () => {
    const html = createExportHtmlDocument("---\nname: workflow-skill\ndescription: xxx\n---\n# Guide", {
      title: "Guide.md"
    });

    expect(html).toContain('class="front-matter-preview"');
    expect(html).toContain("workflow-skill");
    expect(html).toContain("description");
    expect(html).not.toContain("<hr>");
    expect(html).toContain('<h1 id="guide">Guide</h1>');
  });
});
