import { describe, expect, it } from "vitest";
import {
  markdownRangeToClipboardPayload,
  markdownRangesToClipboardPayload,
  markdownRangesToTableCsv,
  markdownRangesToTableMarkdown,
  markdownRangesToTableTsv,
  markdownTableSliceToCsv,
  markdownTableSliceToClipboardPayload,
  markdownTableSliceToMarkdown,
  markdownTableSliceToTsv,
  markdownToHtmlFragment,
  markdownToPlain,
  referenceLabelsFromMarkdown,
  renderMarkdown
} from "./markdown";
import { parseMarkdownTable } from "./tables";

describe("Markdown rendering and clean copy", () => {
  it("renders Markdown with raw HTML escaped", () => {
    const rendered = renderMarkdown("# Hi\n\n<script>alert(1)</script>");

    expect(rendered.html).toContain('<h1 id="hi">');
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).toContain("&lt;script&gt;");
  });

  it("renders stable heading ids for preview anchors", () => {
    const rendered = renderMarkdown("# Intro\n\n## 中文 标题\n\n# Intro");

    expect(rendered.html).toContain('<h1 id="intro">');
    expect(rendered.html).toContain('<h2 id="中文-标题">');
    expect(rendered.html).toContain('<h1 id="intro-1">');
    expect(rendered.headings.map((heading) => heading.id)).toEqual(["intro", "中文-标题", "intro-1"]);
  });

  it("keeps standard front matter out of preview, outline, and clean text", () => {
    const markdown = [
      "---",
      "name: workflow-skill",
      "description: xxx",
      "---",
      "",
      "# Workflow",
      "",
      "Body",
      "",
      "- [ ] Step"
    ].join("\n");
    const rendered = renderMarkdown(markdown);

    expect(rendered.html).not.toContain("workflow-skill");
    expect(rendered.html).not.toContain("description");
    expect(rendered.html).toContain('<h1 id="workflow">Workflow</h1>');
    expect(rendered.html).toContain('data-task-line="9"');
    expect(rendered.headings).toEqual([{ level: 1, text: "Workflow", line: 5, id: "workflow" }]);
  });

  it("does not treat selected thematic-break fragments as document front matter", () => {
    const fragment = "---\nSelected text\n---";

    expect(markdownToHtmlFragment(fragment)).toContain("Selected text");
  });

  it("extracts Setext headings for outline navigation", () => {
    const rendered = renderMarkdown([
      "Setext One",
      "===",
      "",
      "Setext Two",
      "---",
      "",
      "```",
      "Not a heading",
      "---",
      "```"
    ].join("\n"));

    expect(rendered.html).toContain('<h1 id="setext-one">Setext One</h1>');
    expect(rendered.html).toContain('<h2 id="setext-two">Setext Two</h2>');
    expect(rendered.headings.map((heading) => [heading.level, heading.text, heading.line, heading.id])).toEqual([
      [1, "Setext One", 0, "setext-one"],
      [2, "Setext Two", 3, "setext-two"]
    ]);
  });

  it("renders safe Markdown table cell line breaks without enabling raw HTML", () => {
    const rendered = renderMarkdown([
      "| Note |",
      "| --- |",
      "| line<br>break |",
      "",
      "`code<br>sample`"
    ].join("\n"));

    expect(rendered.html).toContain("line<br>break");
    expect(rendered.html).toContain("code&lt;br&gt;sample");
    expect(renderMarkdown("plain<br>text").html).toContain("plain&lt;br&gt;text");
    expect(renderMarkdown("<iframe src=\"x\"></iframe>").html).toContain("&lt;iframe");
  });

  it("converts selected Markdown to clean plain text", () => {
    expect(markdownToPlain("## Title\n\n- **bold** and [link](https://example.com)\n- `code`")).toBe(
      "Title\n\nbold and link\ncode"
    );
  });

  it("keeps literal intraword underscores when copying clean text", () => {
    expect(markdownToPlain([
      "Use snake_case_value and file_name.md.",
      "",
      "_Italic text_ and __strong text__ still copy cleanly."
    ].join("\n"))).toBe([
      "Use snake_case_value and file_name.md.",
      "",
      "Italic text and strong text still copy cleanly."
    ].join("\n"));
  });

  it("keeps Markdown-looking text inside inline code literal when copying clean text", () => {
    expect(markdownToPlain("Use `**literal** [x](y) snake_case` then **bold**.")).toBe(
      "Use **literal** [x](y) snake_case then bold."
    );
  });

  it("copies inline links and images with balanced parentheses without leaking destinations", () => {
    expect(markdownToPlain([
      "See [API](https://example.com/a_(b)) and ![Chart](images/chart_(v2).png).",
      "Escaped \\[not a link](https://example.com) stays literal."
    ].join("\n"))).toBe([
      "See API and Chart.",
      "Escaped [not a link](https://example.com) stays literal."
    ].join("\n"));
  });

  it("copies Markdown autolinks without leaking angle bracket syntax", () => {
    expect(markdownToPlain([
      "Open <https://example.com/docs> or mail <hello@example.com>.",
      "Escaped \\<https://example.com> stays literal."
    ].join("\n"))).toBe([
      "Open https://example.com/docs or mail hello@example.com.",
      "Escaped <https://example.com> stays literal."
    ].join("\n"));
  });

  it("copies reference-style links and images without leaking definitions", () => {
    expect(markdownToPlain([
      "See [Guide][guide] and [Collapsed][].",
      "![Diagram][diagram]",
      "",
      "[guide]: https://example.com/guide",
      "[Collapsed]: https://example.com/collapsed",
      "[diagram]: ./diagram.png",
      "  \"Diagram title\""
    ].join("\n"))).toBe("See Guide and Collapsed.\nDiagram");
  });

  it("copies shortcut reference links and images without leaking brackets", () => {
    const markdown = [
      "See [Guide] and ![Diagram].",
      "Escaped \\[Guide] stays literal.",
      "",
      "[Guide]: https://example.com/guide",
      "[Diagram]: ./diagram.png"
    ].join("\n");
    const firstLineEnd = markdown.indexOf("\n");

    expect(markdownToPlain(markdown)).toBe([
      "See Guide and Diagram.",
      "Escaped [Guide] stays literal."
    ].join("\n"));

    expect(markdownRangeToClipboardPayload(markdown, { from: 0, to: firstLineEnd }).plainText).toBe(
      "See Guide and Diagram."
    );
  });

  it("copies Setext headings without leaking delimiter lines", () => {
    expect(markdownToPlain([
      "Title One",
      "===",
      "",
      "Title Two",
      "---",
      "",
      "Body"
    ].join("\n"))).toBe("Title One\n\nTitle Two\n\nBody");
  });

  it("renders a safe HTML clipboard fragment", () => {
    const html = markdownToHtmlFragment("[safe](https://example.com) [bad](javascript:alert(1))");

    expect(html).toContain("<p>");
    expect(html).toContain('href="https://example.com"');
    expect(html).not.toContain('href="javascript:alert');
    expect(html).toContain("[bad](javascript:alert(1))");
  });

  it("builds deterministic rich payloads for multiple source selections", () => {
    const markdown = "Intro\n**Alpha** middle [Beta](https://example.com)\nTail";
    const alpha = sourceRange(markdown, "**Alpha**");
    const beta = sourceRange(markdown, "[Beta](https://example.com)");
    const payload = markdownRangesToClipboardPayload(markdown, [beta, alpha]);

    expect(payload.plainText).toBe("Alpha\nBeta");
    expect(payload.markdown).toBe("**Alpha**\n[Beta](https://example.com)");
    expect(payload.html).toContain("<strong>Alpha</strong>");
    expect(payload.html).toContain('href="https://example.com"');
  });

  it("merges overlapping and adjacent rich-copy ranges before rendering", () => {
    const payload = markdownRangesToClipboardPayload("abcdef", [
      { from: 2, to: 5 },
      { from: 0, to: 3 },
      { from: 5, to: 6 }
    ]);

    expect(payload.plainText).toBe("abcdef");
    expect(payload.markdown).toBe("abcdef");
    expect(payload.html).toContain("abcdef");
  });

  it("copies Markdown tables as TSV-like clean text", () => {
    const plain = markdownToPlain([
      "| A | B |",
      "| --- | --- |",
      "| **x** | [y](https://example.com) |"
    ].join("\n"));

    expect(plain).toBe("A\tB\nx\ty");
  });

  it("copies shortcut reference links cleanly from table cells", () => {
    const markdown = [
      "| Name | Link |",
      "| --- | --- |",
      "| Alpha | [Guide] |",
      "",
      "[Guide]: https://example.com/guide"
    ].join("\n");
    const table = parseMarkdownTable(markdown.slice(0, markdown.indexOf("\n\n")).split("\n"))!;
    const guideCell = fullCellRange(markdown, "[Guide]");

    expect(markdownToPlain(markdown)).toBe("Name\tLink\nAlpha\tGuide");
    expect(markdownRangesToClipboardPayload(markdown, [guideCell]).plainText).toBe("Guide");
    expect(markdownRangesToTableTsv(markdown, [guideCell])).toBe("Guide");
    expect(markdownTableSliceToTsv(table, [2], [1], referenceLabelsFromMarkdown(markdown))).toBe("Guide");
  });

  it("copies escaped trailing pipes from final table cells", () => {
    const plain = markdownToPlain([
      "Name | Note",
      "--- | ---",
      "Alpha | ends with pipe\\|"
    ].join("\n"));

    expect(plain).toBe("Name\tNote\nAlpha\tends with pipe|");
  });

  it("treats pipes after even backslashes as table separators in clean copy", () => {
    const plain = markdownToPlain([
      "Name \\\\| Note",
      "--- | ---",
      "Alpha \\\\| ok"
    ].join("\n"));

    expect(plain).toBe([
      ["Name \\", "Note"].join("\t"),
      ["Alpha \\", "ok"].join("\t")
    ].join("\n"));
  });

  it("copies a selected table row as clean TSV instead of raw pipes", () => {
    const markdown = [
      "| A | B |",
      "| --- | --- |",
      "| **x** | [y](https://example.com) |"
    ].join("\n");
    const from = markdown.indexOf("| **x**");
    const to = markdown.length;
    const payload = markdownRangeToClipboardPayload(markdown, { from, to });

    expect(payload.plainText).toBe("x\ty");
    expect(payload.markdown).toBe([
      "| A     | B                        |",
      "| ----- | ------------------------ |",
      "| **x** | [y](https://example.com) |"
    ].join("\n"));
    expect(payload.html).toContain("<table>");
    expect(payload.html).toContain("<strong>x</strong>");
    expect(payload.html).toContain('href="https://example.com"');
  });

  it("copies a table selection with only adjacent whitespace as structured table data", () => {
    const markdown = [
      "Intro",
      "",
      "| Name | Score |",
      "| --- | ---: |",
      "| Beta | 10 |",
      "",
      "Tail"
    ].join("\n");
    const from = markdown.indexOf("\n\n| Name") + 1;
    const to = markdown.indexOf("Tail");
    const payload = markdownRangeToClipboardPayload(markdown, { from, to });

    expect(payload.plainText).toBe("Name\tScore\nBeta\t10");
    expect(payload.markdown).toBe([
      "| Name | Score |",
      "| ---- | ----: |",
      "| Beta | 10    |"
    ].join("\n"));
    expect(payload.html).toContain("<table>");
    expect(markdownRangesToTableMarkdown(markdown, [{ from, to }])).toBe(payload.markdown);
  });

  it("does not treat selections with real text outside a table as table exports", () => {
    const markdown = [
      "Intro",
      "",
      "| Name | Score |",
      "| --- | ---: |",
      "| Beta | 10 |",
      "",
      "Tail"
    ].join("\n");
    const to = markdown.indexOf("Tail");

    expect(markdownRangesToTableMarkdown(markdown, [{ from: 0, to }])).toBeNull();
    expect(markdownRangesToTableCsv(markdown, [{ from: 0, to }])).toBeNull();
  });

  it("copies a selected table cell without leaking cell separators", () => {
    const markdown = [
      "| A | B |",
      "| --- | --- |",
      "| **x** | y |"
    ].join("\n");
    const payload = markdownRangeToClipboardPayload(markdown, fullCellRange(markdown, "**x**"));

    expect(payload.plainText).toBe("x");
    expect(payload.markdown).toBe([
      "| A     |",
      "| ----- |",
      "| **x** |"
    ].join("\n"));
    expect(payload.html).toContain("<table>");
    expect(payload.html).toContain("<strong>x</strong>");
  });

  it("builds rich clipboard payloads for active table rows", () => {
    const table = parseMarkdownTable([
      "| Name | Score |",
      "| --- | ---: |",
      "| **Beta** | 10 |",
      "| Alpha | 2 |"
    ])!;
    const payload = markdownTableSliceToClipboardPayload(table, [2]);

    expect(payload?.plainText).toBe("Beta\t10");
    expect(payload?.markdown).toBe([
      "| Name     | Score |",
      "| -------- | ----: |",
      "| **Beta** | 10    |"
    ].join("\n"));
    expect(payload?.html).toContain("<tbody>");
    expect(payload?.html).toContain("<strong>Beta</strong>");
  });

  it("builds rich clipboard payloads for active table columns", () => {
    const table = parseMarkdownTable([
      "| Name | Score |",
      "| --- | ---: |",
      "| Beta | 10 |",
      "| Alpha | 2 |"
    ])!;
    const payload = markdownTableSliceToClipboardPayload(table, [0, 2, 3], [1]);

    expect(payload?.plainText).toBe("Score\n10\n2");
    expect(payload?.markdown).toBe([
      "| Score |",
      "| ----: |",
      "| 10    |",
      "| 2     |"
    ].join("\n"));
    expect(payload?.html).toContain("<thead>");
    expect(payload?.html).toContain('<th style="text-align: right;">Score</th>');
    expect(payload?.html).toContain('<td style="text-align: right;">10</td>');
    expect(markdownTableSliceToTsv(table, [0, 2, 3], [1])).toBe("Score\n10\n2");
  });

  it("builds body-only clipboard payloads for table columns", () => {
    const table = parseMarkdownTable([
      "| Name | Score |",
      "| --- | ---: |",
      "| Beta | 10 |",
      "| Alpha | 2 |"
    ])!;
    const payload = markdownTableSliceToClipboardPayload(table, [2, 3], [1]);

    expect(payload?.plainText).toBe("10\n2");
    expect(payload?.markdown).toBe([
      "| Score |",
      "| ----: |",
      "| 10    |",
      "| 2     |"
    ].join("\n"));
    expect(payload?.html).not.toContain("<thead>");
    expect(payload?.html).toContain('<td style="text-align: right;">10</td>');
    expect(markdownTableSliceToCsv(table, [2, 3], [1])).toBe("10\n2");
    expect(markdownTableSliceToTsv(table, [2, 3], [1])).toBe("10\n2");
    expect(markdownTableSliceToMarkdown(table, [2, 3], [1])).toBe([
      "| Score |",
      "| ----: |",
      "| 10    |",
      "| 2     |"
    ].join("\n"));
  });

  it("builds clipboard payloads for table headers only", () => {
    const table = parseMarkdownTable([
      "| Name | Score |",
      "| --- | ---: |",
      "| Beta | 10 |",
      "| Alpha | 2 |"
    ])!;
    const payload = markdownTableSliceToClipboardPayload(table, [0]);

    expect(payload?.plainText).toBe("Name\tScore");
    expect(payload?.markdown).toBe([
      "| Name | Score |",
      "| ---- | ----: |"
    ].join("\n"));
    expect(payload?.html).toContain("<thead>");
    expect(payload?.html).toContain('<th style="text-align: right;">Score</th>');
    expect(payload?.html).not.toContain("<tbody>");
    expect(markdownTableSliceToCsv(table, [0])).toBe("Name,Score");
    expect(markdownTableSliceToTsv(table, [0])).toBe("Name\tScore");
    expect(markdownTableSliceToMarkdown(table, [0])).toBe([
      "| Name | Score |",
      "| ---- | ----: |"
    ].join("\n"));
  });

  it("builds escaped CSV and grid-friendly TSV for selected table slices", () => {
    const table = parseMarkdownTable([
      "| Name | Note |",
      "| --- | --- |",
      "| **Beta** | hi, \"there\" |",
      "| Alpha | trailing  |"
    ])!;

    expect(markdownTableSliceToCsv(table, [0, 2, 3])).toBe([
      "Name,Note",
      'Beta,"hi, ""there"""',
      "Alpha,trailing"
    ].join("\n"));
    expect(markdownTableSliceToTsv(table, [0, 2, 3])).toBe("Name\tNote\nBeta\thi, \"there\"\nAlpha\ttrailing");
    expect(markdownTableSliceToCsv(table, [2], [1])).toBe('"hi, ""there"""');
  });

  it("builds escaped CSV from source table selections", () => {
    const markdown = [
      "| Name | Note |",
      "| --- | --- |",
      "| **Beta** | hi, \"there\" |",
      "| Alpha | trailing |"
    ].join("\n");

    expect(markdownRangesToTableCsv(markdown, [
      fullCellRange(markdown, "**Beta**"),
      fullCellRange(markdown, 'hi, "there"')
    ])).toBe('Beta,"hi, ""there"""');
    expect(markdownRangesToTableTsv(markdown, [
      fullCellRange(markdown, "**Beta**"),
      fullCellRange(markdown, 'hi, "there"')
    ])).toBe('Beta\thi, "there"');
  });

  it("copies partial text inside a table cell as literal text", () => {
    const markdown = [
      "| Name | Score |",
      "| --- | ---: |",
      "| **Beta** | 10 |"
    ].join("\n");
    const beta = markdown.indexOf("Beta");
    const range = { from: beta, to: beta + "Beta".length };
    const payload = markdownRangesToClipboardPayload(markdown, [range]);

    expect(payload.plainText).toBe("Beta");
    expect(payload.markdown).toBe("Beta");
    expect(payload.html).not.toContain("<table>");
    expect(markdownRangesToTableCsv(markdown, [range])).toBeNull();
    expect(markdownRangesToTableMarkdown(markdown, [range])).toBeNull();
  });

  it("copies a whole table cell content selection as structured table data", () => {
    const markdown = [
      "| Name | Score |",
      "| --- | ---: |",
      "| **Beta** | 10 |"
    ].join("\n");
    const from = markdown.indexOf("**Beta**");
    const range = { from, to: from + "**Beta**".length };
    const payload = markdownRangesToClipboardPayload(markdown, [range]);

    expect(payload.plainText).toBe("Beta");
    expect(payload.markdown).toBe([
      "| Name     |",
      "| -------- |",
      "| **Beta** |"
    ].join("\n"));
    expect(payload.html).toContain("<table>");
  });

  it("copies a selected empty table cell as structured table data", () => {
    const markdown = [
      "| Name | Score |",
      "| --- | ---: |",
      "| Beta |      |"
    ].join("\n");
    const range = emptyCellRange(markdown, "| Beta");
    const payload = markdownRangesToClipboardPayload(markdown, [range]);

    expect(payload.plainText).toBe("");
    expect(payload.markdown).toBe([
      "| Score |",
      "| ----: |",
      "|       |"
    ].join("\n"));
    expect(payload.html).toContain("<table>");
    expect(markdownRangesToTableCsv(markdown, [range])).toBe("");
  });

  it("copies serialized table cell line breaks consistently", () => {
    const markdown = [
      "| Note | Other |",
      "| --- | --- |",
      "| line<br>break | tail |"
    ].join("\n");
    const payload = markdownRangesToClipboardPayload(markdown, [
      fullCellRange(markdown, "line<br>break")
    ]);

    expect(payload.plainText).toBe("line break");
    expect(payload.markdown).toBe([
      "| Note          |",
      "| ------------- |",
      "| line<br>break |"
    ].join("\n"));
    expect(payload.html).toContain("line<br>break");
    expect(markdownRangesToTableCsv(markdown, [
      fullCellRange(markdown, "line<br>break"),
      fullCellRange(markdown, "tail")
    ])).toBe("\"line\nbreak\",tail");
    expect(markdownToPlain(markdown)).toBe("Note\tOther\nline break\ttail");
  });

  it("copies multiple table cell selections as one structured table column", () => {
    const markdown = [
      "| Name | Score |",
      "| --- | ---: |",
      "| Beta | 10 |",
      "| Alpha | 2 |"
    ].join("\n");
    const payload = markdownRangesToClipboardPayload(markdown, [
      fullCellRange(markdown, "Score"),
      fullCellRange(markdown, "10"),
      fullCellRange(markdown, "2")
    ]);

    expect(payload.plainText).toBe("Score\n10\n2");
    expect(payload.markdown).toBe([
      "| Score |",
      "| ----: |",
      "| 10    |",
      "| 2     |"
    ].join("\n"));
    expect(payload.html).toContain("<table>");
    expect(payload.html).toContain('<td style="text-align: right;">10</td>');
  });

  it("keeps sparse table selections from copying unselected neighboring cells", () => {
    const markdown = [
      "| A | B | C |",
      "| --- | --- | --- |",
      "| a1 | b1 | c1 |",
      "| a2 | b2 | c2 |"
    ].join("\n");
    const ranges = [
      fullCellRange(markdown, "b1"),
      fullCellRange(markdown, "c2")
    ];
    const payload = markdownRangesToClipboardPayload(markdown, ranges);

    expect(payload.plainText).toBe("b1\t\n\tc2");
    expect(payload.markdown).toBe([
      "| B   | C   |",
      "| --- | --- |",
      "| b1  |     |",
      "|     | c2  |"
    ].join("\n"));
    expect(payload.html).toContain("<td>b1</td><td></td>");
    expect(payload.html).toContain("<td></td><td>c2</td>");
  });

  it("exports sparse table selections to CSV with blank unselected cells", () => {
    const markdown = [
      "| A | B | C |",
      "| --- | --- | --- |",
      "| a1 | b1 | c1 |",
      "| a2 | b2 | c2 |"
    ].join("\n");

    expect(markdownRangesToTableCsv(markdown, [
      fullCellRange(markdown, "b1"),
      fullCellRange(markdown, "c2")
    ])).toBe("b1,\n,c2");
    expect(markdownRangesToTableTsv(markdown, [
      fullCellRange(markdown, "b1"),
      fullCellRange(markdown, "c2")
    ])).toBe("b1\t\n\tc2");
  });

  it("exports selected table cells as a structured Markdown table", () => {
    const markdown = [
      "| Name | Score | Note |",
      "| --- | ---: | --- |",
      "| Beta | 10 | fast |",
      "| Alpha | 2 | calm |"
    ].join("\n");

    expect(markdownRangesToTableMarkdown(markdown, [
      fullCellRange(markdown, "Score"),
      fullCellRange(markdown, "10"),
      fullCellRange(markdown, "2")
    ])).toBe([
      "| Score |",
      "| ----: |",
      "| 10    |",
      "| 2     |"
    ].join("\n"));
  });

  it("keeps sparse Markdown table exports shaped like the selected cells", () => {
    const markdown = [
      "| A | B | C |",
      "| --- | --- | --- |",
      "| a1 | b1 | c1 |",
      "| a2 | b2 | c2 |"
    ].join("\n");

    expect(markdownRangesToTableMarkdown(markdown, [
      fullCellRange(markdown, "b1"),
      fullCellRange(markdown, "c2")
    ])).toBe([
      "| B   | C   |",
      "| --- | --- |",
      "| b1  |     |",
      "|     | c2  |"
    ].join("\n"));
  });

  it("does not export non-table selections as Markdown tables", () => {
    const markdown = "# Title\n\nplain text";
    const from = markdown.indexOf("plain");

    expect(markdownRangesToTableMarkdown(markdown, [{ from, to: from + "plain".length }])).toBeNull();
  });

  it("ignores headings inside fenced code blocks when building the outline", () => {
    const rendered = renderMarkdown([
      "# Real",
      "",
      "```md",
      "# Not a heading",
      "```",
      "",
      "  ## Also real"
    ].join("\n"));

    expect(rendered.headings.map((heading) => heading.text)).toEqual(["Real", "Also real"]);
  });

  it("keeps fenced code as plain code when copying clean text", () => {
    const plain = markdownToPlain([
      "# Real",
      "",
      "```md",
      "# Not a heading",
      "| not | table |",
      "| --- | --- |",
      "```",
      "",
      "- item"
    ].join("\n"));

    expect(plain).toBe([
      "Real",
      "",
      "# Not a heading",
      "| not | table |",
      "| --- | --- |",
      "",
      "item"
    ].join("\n"));
  });

  it("keeps indented code as literal plain text when copying clean text", () => {
    const plain = markdownToPlain([
      "# Real",
      "",
      "    # Not a heading",
      "    | not | table |",
      "    | --- | --- |",
      "    - not a list",
      "",
      "- item"
    ].join("\n"));

    expect(plain).toBe([
      "Real",
      "",
      "# Not a heading",
      "| not | table |",
      "| --- | --- |",
      "- not a list",
      "",
      "item"
    ].join("\n"));
  });

  it("supports tilde fences while extracting headings", () => {
    const rendered = renderMarkdown([
      "~~~",
      "## Hidden",
      "~~~",
      "### Visible"
    ].join("\n"));

    expect(rendered.headings.map((heading) => heading.text)).toEqual(["Visible"]);
  });

  it("renders task list markers as interactive checkboxes with source lines", () => {
    const html = renderMarkdown([
      "- [ ] Todo",
      "- [x] Done"
    ].join("\n")).html;

    expect(html).toContain('class="task-list-checkbox"');
    expect(html).toContain('data-task-line="0"');
    expect(html).toContain('data-task-line="1"');
    expect(html).toContain("checked");
    expect(html).not.toContain("[ ] Todo");
    expect(html).not.toContain("[x] Done");
  });
});

function sourceRange(markdown: string, text: string): { from: number; to: number } {
  const from = markdown.indexOf(text);
  if (from < 0) throw new Error(`Missing source text: ${text}`);
  return { from, to: from + text.length };
}

function fullCellRange(markdown: string, cellText: string): { from: number; to: number } {
  const cellStart = markdown.indexOf(cellText);
  if (cellStart < 0) throw new Error(`Missing cell text: ${cellText}`);

  const lineStart = markdown.lastIndexOf("\n", cellStart) + 1;
  const nextLineStart = markdown.indexOf("\n", cellStart);
  const lineEnd = nextLineStart === -1 ? markdown.length : nextLineStart;
  const pipeBefore = markdown.lastIndexOf("|", cellStart);
  const pipeAfter = markdown.indexOf("|", cellStart + cellText.length);

  if (pipeBefore < lineStart || pipeAfter < 0 || pipeAfter > lineEnd) {
    throw new Error(`Cell text is not inside a simple pipe table cell: ${cellText}`);
  }

  return { from: pipeBefore + 1, to: pipeAfter };
}

function emptyCellRange(markdown: string, rowText: string): { from: number; to: number } {
  const rowStart = markdown.indexOf(rowText);
  if (rowStart < 0) throw new Error(`Missing row text: ${rowText}`);
  const rowEnd = markdown.indexOf("\n", rowStart);
  const lineEnd = rowEnd === -1 ? markdown.length : rowEnd;
  const pipeAfterPreviousCell = markdown.indexOf("|", rowStart + rowText.length);
  const pipeAfterEmptyCell = markdown.indexOf("|", pipeAfterPreviousCell + 1);

  if (pipeAfterPreviousCell < rowStart || pipeAfterEmptyCell < 0 || pipeAfterEmptyCell > lineEnd) {
    throw new Error(`Missing empty trailing cell in row: ${rowText}`);
  }

  return { from: pipeAfterPreviousCell + 1, to: pipeAfterEmptyCell };
}
