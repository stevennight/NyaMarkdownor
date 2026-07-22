import { getSchema, type JSONContent } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { describe, expect, it } from "vitest";
import {
  createRichMarkdownExtensions,
  protectedMarkdownBlockAtStart,
  protectedMarkdownInlineAtStart
} from "./richMarkdownExtensions";

const extensions = createRichMarkdownExtensions(null);
const markdown = new MarkdownManager({ extensions });

describe("rich Markdown extensions", () => {
  it("keeps normal URL linking enabled", () => {
    const link = extensions.find((extension) => extension.name === "link");
    expect(link?.options).toEqual(expect.objectContaining({
      autolink: true,
      linkOnPaste: true
    }));
  });

  it("keeps paragraphs as the default content of newly inserted table cells", () => {
    const schema = getSchema(extensions);

    for (const cellType of [schema.nodes.tableCell, schema.nodes.tableHeader]) {
      const cell = cellType.createAndFill();
      expect(cell?.childCount).toBe(1);
      expect(cell?.firstChild?.type.name).toBe("paragraph");
    }
  });

  it("renders malformed API tables visually while preserving their exact source", () => {
    const source = [
      "Before",
      "",
      "| 参数名称 | 参数说明 | 请求类型 | 是否必须 | 数据类型 | schema |",
      "| --- | --- | --- | --- | --- | --- |",
      "| first | ordinary | body | false | string | |",
      "            | haveInterview | 是否安排面试（true | false） | body | false | boolean | |",
      "            | second | continued | body | false | string | |",
      "",
      "After"
    ].join("\n");
    const parsed = markdown.parse(source);
    const table = protectedNodes(parsed, "table")[0];

    expect(table).toBeDefined();
    expect(table.content).toHaveLength(4);
    expect(table.content?.[2].content?.[1].content?.[0].content?.[0].text)
      .toBe("是否安排面试（true | false）");
    replaceFirstText(parsed, "Before", "Updated");
    expect(markdown.serialize(parsed)).toBe(source.replace("Before", "Updated"));

    table.content![1].content![1].content![0].content![0].text = "edited";
    const editedTable = markdown.serialize(parsed);
    expect(editedTable).toContain("edited");
    expect(editedTable).toContain("是否安排面试（true \\| false）");
    expect(editedTable).not.toMatch(/^ {8,}\|/m);
  });

  it("keeps standalone indented pipe code blocks out of API-table recovery", () => {
    const source = [
      "| Name | Description |",
      "| --- | --- |",
      "| first | row |",
      "",
      "    | intentional | code |"
    ].join("\n");
    const parsed = markdown.parse(source);

    expect(protectedNodes(parsed, "table")).toHaveLength(1);
    expect(protectedNodes(parsed, "codeBlock")).toHaveLength(1);
    expect(markdown.serialize(parsed)).toBe(source);
  });

  it("keeps an unindented API description pipe without shifting later columns", () => {
    const source = [
      "| 参数名称 | 参数说明 | 请求类型 | 是否必须 | 数据类型 | schema |",
      "| --- | --- | --- | --- | --- | --- |",
      "| haveInterview | 是否安排面试（true | false） | body | false | boolean | |"
    ].join("\n");
    const parsed = markdown.parse(source);
    const row = protectedNodes(parsed, "table")[0].content?.[1];
    const cells = row?.content?.map((cell) => cell.content?.[0].content?.map((node) => node.text ?? "").join("") ?? "");

    expect(cells).toEqual([
      "haveInterview",
      "是否安排面试（true | false）",
      "body",
      "false",
      "boolean",
      ""
    ]);
    expect(markdown.serialize(parsed)).toBe(source);
  });

  it("round-trips footnote references and multiline definitions", () => {
    const source = [
      "Body[^alpha].",
      "",
      "[^alpha]: First line",
      "    continued line"
    ].join("\n");
    const parsed = markdown.parse(source);

    expect(protectedNodes(parsed, "protectedMarkdownInline")).toEqual([
      expect.objectContaining({ attrs: expect.objectContaining({ kind: "footnote", label: "alpha", raw: "[^alpha]" }) })
    ]);
    expect(protectedNodes(parsed, "protectedMarkdownBlock")).toEqual([
      expect.objectContaining({
        attrs: expect.objectContaining({
          kind: "footnote",
          label: "alpha",
          raw: "[^alpha]: First line\n    continued line"
        })
      })
    ]);
    expect(markdown.serialize(parsed)).toContain("Body[^alpha].\n\n[^alpha]: First line\n    continued line");
  });

  it("round-trips block and inline HTML without rendering or escaping it", () => {
    const source = [
      '<div class="note">',
      "  <strong>Raw</strong>",
      "</div>",
      "",
      "Press <kbd>Ctrl</kbd>."
    ].join("\n");
    const parsed = markdown.parse(source);

    expect(protectedNodes(parsed, "protectedMarkdownBlock")).toHaveLength(1);
    expect(protectedNodes(parsed, "protectedMarkdownInline")).toHaveLength(2);
    const output = markdown.serialize(parsed);
    expect(output).toContain('<div class="note">\n  <strong>Raw</strong>\n</div>');
    expect(output).toContain("Press <kbd>Ctrl</kbd>.");
  });

  it("round-trips HTML entity references without double escaping them", () => {
    const source = "Entities: &copy; &amp; &#35; &#x41;.";
    const parsed = markdown.parse(source);
    const entities = protectedNodes(parsed, "markdownEntity");

    expect(entities.map((entity) => [entity.attrs?.raw, entity.attrs?.decoded])).toEqual([
      ["&copy;", "©"],
      ["&amp;", "&"],
      ["&#35;", "#"],
      ["&#x41;", "A"]
    ]);
    const schema = getSchema(extensions);
    expect(schema.nodeFromJSON(parsed).textContent).toBe("Entities: © & # A.");
    replaceFirstText(parsed, "Entities: ", "References: ");
    expect(markdown.serialize(parsed)).toBe("References: &copy; &amp; &#35; &#x41;.");
  });

  it("falls back to visible text after an entity character is edited", () => {
    const parsed = markdown.parse("Value: &copy;.");
    const entity = protectedNodes(parsed, "markdownEntity")[0];
    entity.content![0].text = "©X";

    expect(markdown.serialize(parsed)).toBe("Value: ©X.");
  });

  it("does not tokenize escaped or code-span entity syntax as visual entities", () => {
    const source = "Escaped \\&copy;, code `&copy;`, and entity &copy;.";
    const parsed = markdown.parse(source);

    expect(protectedNodes(parsed, "markdownEntity").map((entity) => entity.attrs?.raw)).toEqual(["&copy;"]);
    const output = markdown.serialize(parsed);
    expect(output).toContain("Escaped &amp;copy;");
    expect(output).toContain("code `&copy;`");
    expect(output).toContain("entity &copy;.");
  });

  it("keeps entity source inside ordinary Markdown formatting", () => {
    const source = "**&copy;** and [&amp;](https://example.com)";
    const parsed = markdown.parse(source);

    expect(markdown.serialize(parsed)).toBe(source);
  });

  it("keeps Setext heading markers after parsing and unrelated visual edits", () => {
    const source = [
      "Primary heading",
      "===============",
      "",
      "Secondary heading",
      "-----"
    ].join("\n");
    const parsed = markdown.parse(source);
    const headings = protectedNodes(parsed, "heading");

    expect(headings.map((heading) => heading.attrs)).toEqual([
      expect.objectContaining({ level: 1, markdownStyle: "setext", markdownMarker: "===============" }),
      expect.objectContaining({ level: 2, markdownStyle: "setext", markdownMarker: "-----" })
    ]);
    headings[0].content![0].text = "Edited primary";
    const output = markdown.serialize(parsed);
    expect(output).toContain("Edited primary\n===============");
    expect(output).toContain("Secondary heading\n-----");
  });

  it("preserves closing ATX markers and trailing spaces after heading edits", () => {
    const source = [
      "## Primary heading ##",
      "",
      "### Secondary heading ###   "
    ].join("\n");
    const parsed = markdown.parse(source);
    const headings = protectedNodes(parsed, "heading");

    expect(headings.map((heading) => heading.attrs?.markdownClosingMarker)).toEqual([" ##", " ###   "]);
    headings[0].content![0].text = "Edited primary";
    const output = markdown.serialize(parsed);
    expect(output).toContain("## Edited primary ##");
    expect(output).toContain("### Secondary heading ###   ");
  });

  it("preserves full, collapsed, and shortcut reference resources plus definitions", () => {
    const source = [
      "Read [Guide][docs], [Quick][], and [Shortcut].",
      "",
      "![Diagram][figure]",
      "",
      '[docs]: ./guide.md "Guide title"',
      "[quick]: https://example.com/quick",
      "[shortcut]: https://example.com/shortcut",
      "[figure]: images/diagram.png"
    ].join("\n");
    const parsed = markdown.parse(source);

    expect(marksOfType(parsed, "link")).toEqual([
      expect.objectContaining({
        attrs: expect.objectContaining({
          href: "./guide.md",
          markdownReferenceSuffix: "[docs]"
        })
      })
    ]);
    expect(protectedNodes(parsed, "protectedReferenceLink").map((node) => node.attrs?.raw)).toEqual([
      "[Quick][]",
      "[Shortcut]"
    ]);
    expect(protectedNodes(parsed, "image")).toEqual([
      expect.objectContaining({
        attrs: expect.objectContaining({
          src: "images/diagram.png",
          markdownReferenceRaw: "![Diagram][figure]"
        })
      })
    ]);
    expect(protectedNodes(parsed, "markdownReferenceDefinition")).toHaveLength(4);

    replaceFirstText(parsed, "Read ", "Please read ");
    const output = markdown.serialize(parsed);
    expect(output).toContain("Please read [Guide][docs], [Quick][], and [Shortcut].");
    expect(output).toContain("![Diagram][figure]");
    expect(output).toContain('[docs]: ./guide.md "Guide title"');
    expect(output).toContain("[figure]: images/diagram.png");
  });

  it("falls back to an inline link when a full reference target is changed", () => {
    const parsed = markdown.parse(["[Guide][docs]", "", "[docs]: ./guide.md"].join("\n"));
    const link = marksOfType(parsed, "link")[0];
    link.attrs = { ...link.attrs, href: "./new-guide.md" };

    expect(markdown.serialize(parsed)).toContain("[Guide](./new-guide.md)");
  });

  it("preserves URL and email autolinks after unrelated visual edits", () => {
    const source = "Visit <https://example.com/a?q=1> or <user@example.com>.";
    const parsed = markdown.parse(source);
    const links = protectedNodes(parsed, "markdownAutolink");

    expect(links.map((link) => [link.attrs?.raw, link.attrs?.href])).toEqual([
      ["<https://example.com/a?q=1>", "https://example.com/a?q=1"],
      ["<user@example.com>", "mailto:user@example.com"]
    ]);
    replaceFirstText(parsed, "Visit ", "Open ");
    expect(markdown.serialize(parsed)).toBe("Open <https://example.com/a?q=1> or <user@example.com>.");
  });

  it("falls back to an explicit link after autolink text or target edits", () => {
    const parsed = markdown.parse("Visit <https://example.com/original>.");
    const autolink = protectedNodes(parsed, "markdownAutolink")[0];
    autolink.content![0].text = "Edited label";

    expect(markdown.serialize(parsed)).toBe("Visit [Edited label](https://example.com/original).");

    autolink.attrs = { ...autolink.attrs, href: "https://example.com/updated" };
    expect(markdown.serialize(parsed)).toBe("Visit [Edited label](https://example.com/updated).");
  });

  it("keeps formatting around an autolink", () => {
    const source = "**<https://example.com>**";
    expect(markdown.serialize(markdown.parse(source))).toBe(source);
  });

  it("preserves inline-link destinations, title quotes, and spacing after text edits", () => {
    const source = "Read [Guide](<docs/guide(v2).md>   'Guide title').";
    const parsed = markdown.parse(source);
    const link = marksOfType(parsed, "link")[0];

    expect(link.attrs).toEqual(expect.objectContaining({
      href: "docs/guide(v2).md",
      title: "Guide title",
      markdownInlineSuffix: "(<docs/guide(v2).md>   'Guide title')"
    }));
    replaceFirstText(parsed, "Guide", "Edited guide");
    expect(markdown.serialize(parsed)).toBe("Read [Edited guide](<docs/guide(v2).md>   'Guide title').");
  });

  it("preserves untouched inline-image destination and title syntax", () => {
    const imageSource = "![Diagram](<images/diagram(v2).png>  'Diagram title')";
    const source = ["Before.", "", imageSource, "", "After."].join("\n");
    const parsed = markdown.parse(source);
    const image = protectedNodes(parsed, "image")[0];

    expect(image.attrs).toEqual(expect.objectContaining({
      src: "images/diagram(v2).png",
      alt: "Diagram",
      title: "Diagram title",
      markdownInlineRaw: imageSource
    }));
    replaceFirstText(parsed, "Before.", "Changed before.");
    expect(markdown.serialize(parsed)).toContain(imageSource);
  });

  it("preserves backslash, spaced hard breaks, and ordinary soft line breaks", () => {
    const source = [
      "Backslash\\",
      "next",
      "",
      "Spaces   ",
      "next",
      "",
      "soft",
      "line"
    ].join("\n");
    const parsed = markdown.parse(source);

    expect(protectedNodes(parsed, "hardBreak").map((node) => node.attrs?.markdownMarker)).toEqual(["\\", "   "]);
    const output = markdown.serialize(parsed);
    expect(output).toContain("Backslash\\\nnext");
    expect(output).toContain("Spaces   \nnext");
    expect(output).toContain("soft\nline");
  });

  it("preserves underscore and star emphasis delimiters", () => {
    const source = "Use __bold__, _italic_, **strong**, and *emphasis*.";
    const parsed = markdown.parse(source);

    expect(marksOfType(parsed, "bold").map((mark) => mark.attrs?.markdownDelimiter)).toEqual(["__", "**"]);
    expect(marksOfType(parsed, "italic").map((mark) => mark.attrs?.markdownDelimiter)).toEqual(["_", "*"]);
    replaceFirstText(parsed, "Use ", "Keep ");
    expect(markdown.serialize(parsed)).toBe("Keep __bold__, _italic_, **strong**, and *emphasis*.");
  });

  it("preserves inline-code delimiters and CommonMark padding", () => {
    const source = "Code: `plain`, ``a`b``, and `` `edge` ``.";
    const parsed = markdown.parse(source);
    const codeMarks = marksOfType(parsed, "code");

    expect(codeMarks.map((mark) => [mark.attrs?.markdownOpen, mark.attrs?.markdownClose])).toEqual([
      ["`", "`"],
      ["``", "``"],
      ["`` ", " ``"]
    ]);
    expect(markdown.serialize(parsed)).toBe(source);
  });

  it("keeps fenced and indented code styles and lengthens unsafe fences", () => {
    const source = [
      "~~~~js",
      "const ticks = '```';",
      "~~~",
      "~~~~",
      "",
      "    const x = 1;",
      "    const y = 2;"
    ].join("\n");
    const parsed = markdown.parse(source);
    const blocks = protectedNodes(parsed, "codeBlock");

    expect(blocks.map((block) => block.attrs?.markdownStyle)).toEqual(["fenced", "indented"]);
    expect(markdown.serialize(parsed)).toContain("~~~~js\nconst ticks = '```';\n~~~\n~~~~");
    expect(markdown.serialize(parsed)).toContain("    const x = 1;\n    const y = 2;");

    blocks[0].content![0].text += "\n~~~~~";
    const edited = markdown.serialize(parsed);
    expect(edited).toContain("~~~~~~js\nconst ticks = '```';\n~~~\n~~~~~\n~~~~~~");
  });

  it("preserves fenced-code info spacing until the language changes", () => {
    const source = [
      "```   js  ",
      "const value = 1;",
      "```"
    ].join("\n");
    const parsed = markdown.parse(source);
    const block = protectedNodes(parsed, "codeBlock")[0];

    expect(block.attrs).toEqual(expect.objectContaining({
      language: "js",
      markdownInfoSuffix: "   js  ",
      markdownInfoLanguage: "js"
    }));
    block.content![0].text += "\nconst next = 2;";
    expect(markdown.serialize(parsed)).toContain("```   js  \nconst value = 1;\nconst next = 2;\n```");

    block.attrs = { ...block.attrs, language: "ts" };
    expect(markdown.serialize(parsed)).toContain("```ts\nconst value = 1;");
  });

  it("preserves ordinary bullet-list and horizontal-rule markers", () => {
    const source = [
      "* alpha",
      "* beta",
      "",
      "+ gamma",
      "+ delta",
      "",
      "* * *",
      "",
      "____"
    ].join("\n");
    const parsed = markdown.parse(source);

    expect(protectedNodes(parsed, "bulletList").map((list) => list.attrs?.markdownMarker)).toEqual(["*", "+"]);
    expect(protectedNodes(parsed, "horizontalRule").map((rule) => rule.attrs?.markdownMarker)).toEqual(["* * *", "____"]);
    const output = markdown.serialize(parsed);
    expect(output).toContain("* alpha\n* beta");
    expect(output).toContain("+ gamma\n+ delta");
    expect(output).toContain("* * *");
    expect(output).toContain("____");
  });

  it("preserves parenthesized ordered-list markers after item edits", () => {
    const source = [
      "3) alpha",
      "4) beta"
    ].join("\n");
    const parsed = markdown.parse(source);
    const lists = protectedNodes(parsed, "orderedList");

    expect(lists).toEqual([
      expect.objectContaining({ attrs: expect.objectContaining({ start: 3, markdownDelimiter: ")" }) })
    ]);
    replaceFirstText(parsed, "alpha", "edited alpha");
    expect(markdown.serialize(parsed)).toBe("3) edited alpha\n4) beta");
  });

  it("keeps aligned continuation lines inside one ordered list item", () => {
    const source = [
      "1. aaa",
      "   bbb",
      "   ccc",
      "2. ddd",
      "   eee"
    ].join("\n");

    expect(markdown.serialize(markdown.parse(source))).toBe(source);
  });

  it("aligns multiline content with wider ordered and bullet-list markers", () => {
    const source = [
      "10. aaa",
      "    bbb",
      "",
      "- item",
      "  continued"
    ].join("\n");

    expect(markdown.serialize(markdown.parse(source))).toBe(source);
  });

  it("preserves loose bullet and ordered list spacing after item edits", () => {
    const source = [
      "- alpha",
      "",
      "- beta",
      "",
      "3) gamma",
      "",
      "4) delta"
    ].join("\n");
    const parsed = markdown.parse(source);

    expect(protectedNodes(parsed, "bulletList")[0].attrs).toEqual(expect.objectContaining({
      markdownMarker: "-",
      markdownLoose: true
    }));
    expect(protectedNodes(parsed, "orderedList")[0].attrs).toEqual(expect.objectContaining({
      start: 3,
      markdownDelimiter: ")",
      markdownLoose: true
    }));
    replaceFirstText(parsed, "alpha", "edited alpha");
    replaceFirstText(parsed, "gamma", "edited gamma");
    const output = markdown.serialize(parsed);
    expect(output).toContain("- edited alpha\n\n- beta");
    expect(output).toContain("3) edited gamma\n\n4) delta");
  });

  it("keeps ordinary adjacent list items tight", () => {
    const parsed = markdown.parse(["- alpha", "- beta", "", "3) gamma", "4) delta"].join("\n"));

    expect(protectedNodes(parsed, "bulletList")[0].attrs?.markdownLoose).toBe(false);
    expect(protectedNodes(parsed, "orderedList")[0].attrs?.markdownLoose).toBe(false);
    const output = markdown.serialize(parsed);
    expect(output).toContain("- alpha\n- beta");
    expect(output).toContain("3) gamma\n4) delta");
  });

  it("preserves mixed task-list markers and checked-marker case", () => {
    const source = [
      "* [X] done",
      "+ [ ] todo",
      "- [x] lower"
    ].join("\n");
    const parsed = markdown.parse(source);
    const items = protectedNodes(parsed, "taskItem");

    expect(items.map((item) => [
      item.attrs?.checked,
      item.attrs?.markdownMarker,
      item.attrs?.markdownCheckedMarker
    ])).toEqual([
      [true, "*", "X"],
      [false, "+", "X"],
      [true, "-", "x"]
    ]);
    replaceFirstText(parsed, "done", "finished");
    expect(markdown.serialize(parsed)).toBe("* [X] finished\n+ [ ] todo\n- [x] lower");

    items[1].attrs = { ...items[1].attrs, checked: true };
    expect(markdown.serialize(parsed)).toContain("+ [X] todo");
  });

  it("preserves nested task-list marker styles", () => {
    const source = [
      "- [ ] parent",
      "  * [X] child",
      "- [x] next"
    ].join("\n");
    const parsed = markdown.parse(source);
    const items = protectedNodes(parsed, "taskItem");

    expect(items.map((item) => [item.attrs?.markdownMarker, item.attrs?.markdownCheckedMarker])).toEqual([
      ["-", "x"],
      ["*", "X"],
      ["-", "x"]
    ]);
    expect(markdown.serialize(parsed)).toBe(source);
  });

  it("keeps untouched table source but invalidates it for semantic table edits", () => {
    const tableSource = [
      "Name | Score",
      ":--- | ---:",
      "Alice | **10**",
      "Bob | 8"
    ].join("\n");
    const source = ["Before.", "", tableSource, "", "After."].join("\n");
    const parsed = markdown.parse(source);
    const table = protectedNodes(parsed, "table")[0];

    expect(table.attrs?.markdownRaw).toBe(tableSource);
    expect(table.attrs?.markdownFingerprint).toMatch(/^\d+:[0-9a-f]{8}:[0-9a-f]{8}$/);

    replaceFirstText(parsed, "Before.", "Changed before.");
    table.content![0].content![0].attrs = {
      ...table.content![0].content![0].attrs,
      colwidth: [180]
    };
    expect(markdown.serialize(parsed)).toContain(tableSource);

    const edited = structuredClone(parsed);
    replaceFirstText(edited, "Alice", "Alicia");
    const editedOutput = markdown.serialize(edited);
    expect(editedOutput).toContain("Alicia");
    expect(editedOutput).not.toContain(tableSource);
  });

  it("round-trips table cell line breaks through hard-break nodes", () => {
    const source = [
      "| Name | Note |",
      "| --- | --- |",
      "| Alice | first<br>second |"
    ].join("\n");
    const parsed = markdown.parse(source);
    const table = protectedNodes(parsed, "table")[0];
    const hardBreak = protectedNodes(table, "hardBreak")[0];

    expect(hardBreak).toEqual(expect.objectContaining({
      attrs: expect.objectContaining({ markdownMarker: "<br>" })
    }));
    expect(protectedNodes(table, "protectedMarkdownInline")).toHaveLength(0);
    replaceFirstText(parsed, "first", "edited");
    const output = markdown.serialize(parsed);
    expect(output).toContain("edited<br>second");
    expect(output).not.toContain("\u001f");
  });

  it("serializes multiple table cell blocks with Markdown cell breaks", () => {
    const parsed = markdown.parse([
      "| Name | Note |",
      "| --- | --- |",
      "| Alice | first |"
    ].join("\n"));
    const cell = protectedNodes(parsed, "tableCell")[1];
    cell.content = [
      { type: "paragraph", content: [{ type: "text", text: "first" }] },
      { type: "paragraph", content: [{ type: "text", text: "second" }] }
    ];

    const output = markdown.serialize(parsed);
    expect(output).toContain("first<br>second");
    expect(output).not.toContain("\u001f");
  });

  it("serializes rich table hard breaks as Markdown table cell breaks", () => {
    const parsed = markdown.parse([
      "| Name | Note |",
      "| --- | --- |",
      "| Alice | first |"
    ].join("\n"));
    const cell = protectedNodes(parsed, "tableCell")[1];
    cell.content = [{
      type: "paragraph",
      content: [
        { type: "text", text: "first" },
        { type: "hardBreak", attrs: { markdownMarker: "  " } },
        { type: "text", text: "second" }
      ]
    }];

    const output = markdown.serialize(parsed);
    expect(output).toContain("first<br>second");
    expect(output).not.toContain("\u001f");
  });

  it("serializes table-break nodes moved outside a table as normal Markdown hard breaks", () => {
    const parsed = markdown.parse([
      "| Name | Note |",
      "| --- | --- |",
      "| Alice | first<br>second |"
    ].join("\n"));
    const tableBreak = structuredClone(protectedNodes(parsed, "hardBreak")[0]);
    const output = markdown.serialize({
      type: "doc",
      content: [{
        type: "paragraph",
        content: [
          { type: "text", text: "first" },
          tableBreak,
          { type: "text", text: "second" }
        ]
      }]
    });

    expect(output).toContain("first  \nsecond");
    expect(output).not.toContain("first<br>second");
  });

  it("does not interpret table cell break HTML outside tables", () => {
    const parsed = markdown.parse("plain<br>text");
    expect(protectedNodes(parsed, "hardBreak")).toHaveLength(0);
    expect(protectedNodes(parsed, "protectedMarkdownInline")).toHaveLength(1);
    expect(markdown.serialize(parsed)).toBe("plain<br>text");
  });

  it("does not protect escaped footnotes, autolinks, comparisons, or fenced code contents", () => {
    const source = [
      String.raw`Escaped \[^skip] and real [^keep].`,
      "",
      "<https://example.com>",
      "",
      "a < b",
      "",
      "```html",
      "<div>[^inside-code]</div>",
      "```"
    ].join("\n");
    const parsed = markdown.parse(source);
    const protectedInline = protectedNodes(parsed, "protectedMarkdownInline");

    expect(protectedInline).toHaveLength(1);
    expect(protectedInline[0].attrs).toEqual(expect.objectContaining({ kind: "footnote", label: "keep" }));
    expect(protectedNodes(parsed, "protectedMarkdownBlock")).toHaveLength(0);
    expect(markdown.serialize(parsed)).toContain("<div>[^inside-code]</div>");
  });

  it("never tokenizes empty input as protected Markdown", () => {
    expect(protectedMarkdownBlockAtStart("")).toBeNull();
    expect(protectedMarkdownInlineAtStart("")).toBeNull();
    expect(protectedMarkdownInlineAtStart(String.raw`\[^escaped]`)).toBeNull();
  });
});

function protectedNodes(content: JSONContent, type: string): JSONContent[] {
  const matches: JSONContent[] = [];
  visit(content, (node) => {
    if (node.type === type) matches.push(node);
  });
  return matches;
}

function marksOfType(content: JSONContent, type: string): NonNullable<JSONContent["marks"]> {
  const matches: NonNullable<JSONContent["marks"]> = [];
  visit(content, (node) => {
    node.marks?.forEach((mark) => {
      if (mark.type === type) matches.push(mark);
    });
  });
  return matches;
}

function replaceFirstText(content: JSONContent, current: string, replacement: string): void {
  let replaced = false;
  visit(content, (node) => {
    if (!replaced && node.text === current) {
      node.text = replacement;
      replaced = true;
    }
  });
  expect(replaced).toBe(true);
}

function visit(content: JSONContent, callback: (node: JSONContent) => void): void {
  callback(content);
  content.content?.forEach((child) => visit(child, callback));
}
