import { describe, expect, it } from "vitest";
import {
  applyMarkdownBlockquoteBackspace,
  applyMarkdownBlockCommand,
  applyMarkdownLineContinuation,
  applyMarkdownListItemLineBreak,
  applyMarkdownListBackspace,
  applyMarkdownListIndentation,
  applyMarkdownTextCommand,
  applyTaskCheckboxToggle,
  applyTextChange
} from "./editorCommands";

describe("Markdown text commands", () => {
  it("wraps selected text in bold markers", () => {
    expect(applyMarkdownTextCommand("hello world", { from: 6, to: 11 }, "bold")).toEqual({
      markdown: "hello **world**",
      selection: { from: 8, to: 13 }
    });
  });

  it("toggles off markers that are inside the selection", () => {
    expect(applyMarkdownTextCommand("hello **world**", { from: 6, to: 15 }, "bold")).toEqual({
      markdown: "hello world",
      selection: { from: 6, to: 11 }
    });
  });

  it("toggles off surrounding markers when only inner text is selected", () => {
    expect(applyMarkdownTextCommand("hello **world**", { from: 8, to: 13 }, "bold")).toEqual({
      markdown: "hello world",
      selection: { from: 6, to: 11 }
    });
  });

  it("inserts placeholders for empty selections", () => {
    expect(applyMarkdownTextCommand("hello ", { from: 6, to: 6 }, "code")).toEqual({
      markdown: "hello `code`",
      selection: { from: 7, to: 11 }
    });
  });

  it("creates links while keeping the link text selected", () => {
    expect(applyMarkdownTextCommand("visit site", { from: 6, to: 10 }, "link")).toEqual({
      markdown: "visit [site](https://)",
      selection: { from: 7, to: 11 }
    });
  });

  it("applies a scoped text change without rebuilding callers", () => {
    expect(applyTextChange("alpha beta gamma", { from: 6, to: 10, insert: "table" })).toBe("alpha table gamma");
  });

  it("continues unordered lists on Enter", () => {
    expect(applyMarkdownLineContinuation("- first", { from: 7, to: 7 })).toEqual({
      markdown: "- first\n- ",
      change: { from: 7, to: 7, insert: "\n- " },
      selection: { from: 10, to: 10 }
    });
  });

  it("continues ordered lists with the next number", () => {
    expect(applyMarkdownLineContinuation("9. first", { from: 8, to: 8 })).toEqual({
      markdown: "9. first\n10. ",
      change: { from: 8, to: 8, insert: "\n10. " },
      selection: { from: 13, to: 13 }
    });
  });

  it("inserts an aligned continuation line inside an ordered list item", () => {
    expect(applyMarkdownListItemLineBreak("1. aaa", { from: 6, to: 6 })).toEqual({
      markdown: "1. aaa\n   ",
      change: { from: 6, to: 6, insert: "\n   " },
      selection: { from: 10, to: 10 }
    });
  });

  it("keeps subsequent continuation lines aligned with their list item", () => {
    const source = "1. aaa\n   bbb";

    expect(applyMarkdownListItemLineBreak(source, { from: source.length, to: source.length })?.markdown)
      .toBe("1. aaa\n   bbb\n   ");
  });

  it("uses semantic continuation indentation for wider ordered and task-list markers", () => {
    expect(applyMarkdownListItemLineBreak("10. aaa", { from: 7, to: 7 })?.markdown)
      .toBe("10. aaa\n    ");
    expect(applyMarkdownListItemLineBreak("- [ ] aaa", { from: 9, to: 9 })?.markdown)
      .toBe("- [ ] aaa\n  ");
  });

  it("keeps continuation lines aligned inside nested and quoted list items", () => {
    expect(applyMarkdownListItemLineBreak("  3) aaa", { from: 8, to: 8 })?.markdown)
      .toBe("  3) aaa\n     ");
    expect(applyMarkdownListItemLineBreak("> 1. aaa", { from: 8, to: 8 })?.markdown)
      .toBe("> 1. aaa\n>    ");
  });

  it("replaces a same-line selection when inserting a list-item line break", () => {
    expect(applyMarkdownListItemLineBreak("1. aaa", { from: 3, to: 6 })).toEqual({
      markdown: "1. \n   ",
      change: { from: 3, to: 6, insert: "\n   " },
      selection: { from: 7, to: 7 }
    });
  });

  it("does not treat unrelated indented text as a list continuation", () => {
    expect(applyMarkdownListItemLineBreak("   aaa", { from: 6, to: 6 })).toBeNull();
    expect(applyMarkdownListItemLineBreak("1. aaa\n   bbb", { from: 3, to: 12 })).toBeNull();
  });

  it("renumbers following ordered list items after continuing a list", () => {
    const edit = applyMarkdownLineContinuation("1. first\n2. second", { from: 8, to: 8 });

    expect(edit?.markdown).toBe("1. first\n2. \n3. second");
    expect(edit?.selection).toEqual({ from: 12, to: 12 });
    expect(edit?.change).toEqual({ from: 12, to: 12, insert: "\n3. " });
  });

  it("renumbers every following ordered list item after continuing a list", () => {
    const source = "1. first\n2. second\n3. third\n4. fourth";
    const edit = applyMarkdownLineContinuation(source, { from: 8, to: 8 });

    expect(edit?.markdown).toBe("1. first\n2. \n3. second\n4. third\n5. fourth");
  });

  it("renumbers following siblings in a loose ordered list", () => {
    const source = "1. first\n\n2. second\n\n3. third";
    const edit = applyMarkdownLineContinuation(source, { from: 8, to: 8 });

    expect(edit?.markdown).toBe("1. first\n2. \n\n3. second\n\n4. third");
  });

  it("renumbers following siblings after nested list content", () => {
    const source = "1. first\n   - nested\n2. second\n3. third";
    const edit = applyMarkdownLineContinuation(source, { from: 8, to: 8 });

    expect(edit?.markdown).toBe("1. first\n2. \n   - nested\n3. second\n4. third");
  });

  it("stops renumbering when a loose list is followed by a normal paragraph", () => {
    const source = "1. first\n\nparagraph\n\n1. separate";
    const edit = applyMarkdownLineContinuation(source, { from: 8, to: 8 });

    expect(edit?.markdown).toBe("1. first\n2. \n\nparagraph\n\n1. separate");
  });

  it("renumbers following ordered list items after exiting an empty item", () => {
    const source = "1. first\n2. \n3. second";
    const edit = applyMarkdownLineContinuation(source, { from: 12, to: 12 });

    expect(edit?.markdown).toBe("1. first\n\n2. second");
    expect(edit?.selection).toEqual({ from: 9, to: 9 });
  });

  it("indents ordered list items and renumbers their old siblings", () => {
    const source = "1. first\n2. second\n3. third";
    const edit = applyMarkdownListIndentation(source, { from: 12, to: 12 }, "indent");

    expect(edit?.markdown).toBe("1. first\n  1. second\n2. third");
    expect(edit?.selection).toEqual({ from: 14, to: 14 });
  });

  it("outdents ordered list items and renumbers the merged level", () => {
    const source = "1. first\n  1. second\n2. third";
    const edit = applyMarkdownListIndentation(source, { from: 14, to: 14 }, "outdent");

    expect(edit?.markdown).toBe("1. first\n2. second\n3. third");
    expect(edit?.selection).toEqual({ from: 12, to: 12 });
  });

  it("indents selected list lines together", () => {
    const edit = applyMarkdownListIndentation("- alpha\n- beta", { from: 0, to: 14 }, "indent");

    expect(edit?.markdown).toBe("  - alpha\n  - beta");
  });

  it("indents lists inside blockquotes without leaving the quote", () => {
    const edit = applyMarkdownListIndentation("> - quoted", { from: 4, to: 4 }, "indent");

    expect(edit?.markdown).toBe(">   - quoted");
  });

  it("does not steal Tab from plain text or already top-level list outdents", () => {
    expect(applyMarkdownListIndentation("plain text", { from: 2, to: 2 }, "indent")).toBeNull();
    expect(applyMarkdownListIndentation("- top", { from: 3, to: 3 }, "outdent")).toBeNull();
  });

  it("removes a top-level list marker on Backspace at content start", () => {
    expect(applyMarkdownListBackspace("- item", { from: 2, to: 2 })).toEqual({
      markdown: "item",
      change: { from: 0, to: 2, insert: "" },
      selection: { from: 0, to: 0 }
    });
  });

  it("outdents nested list items on Backspace at content start", () => {
    const edit = applyMarkdownListBackspace("  - item", { from: 4, to: 4 });

    expect(edit?.markdown).toBe("- item");
    expect(edit?.selection).toEqual({ from: 2, to: 2 });
  });

  it("removes task list markers without losing the task text", () => {
    expect(applyMarkdownListBackspace("- [x] done", { from: 6, to: 6 })?.markdown).toBe("done");
  });

  it("keeps blockquote context when removing a quoted list marker", () => {
    expect(applyMarkdownListBackspace("> - quoted", { from: 4, to: 4 })?.markdown).toBe("> quoted");
  });

  it("renumbers following ordered list items after removing a marker", () => {
    const edit = applyMarkdownListBackspace("1. first\n2. second\n3. third", { from: 12, to: 12 });

    expect(edit?.markdown).toBe("1. first\nsecond\n2. third");
    expect(edit?.selection).toEqual({ from: 9, to: 9 });
  });

  it("does not steal Backspace away from normal text positions", () => {
    expect(applyMarkdownListBackspace("- item", { from: 3, to: 3 })).toBeNull();
    expect(applyMarkdownListBackspace("plain", { from: 2, to: 2 })).toBeNull();
    expect(applyMarkdownListBackspace("- item", { from: 2, to: 4 })).toBeNull();
  });

  it("removes a blockquote marker on Backspace at quote content start", () => {
    expect(applyMarkdownBlockquoteBackspace("> quoted", { from: 2, to: 2 })).toEqual({
      markdown: "quoted",
      change: { from: 0, to: 2, insert: "" },
      selection: { from: 0, to: 0 }
    });
  });

  it("outdents nested blockquotes one level at a time", () => {
    expect(applyMarkdownBlockquoteBackspace("> > nested", { from: 4, to: 4 })).toEqual({
      markdown: "> nested",
      change: { from: 2, to: 4, insert: "" },
      selection: { from: 2, to: 2 }
    });
  });

  it("preserves leading indentation when exiting an indented blockquote", () => {
    expect(applyMarkdownBlockquoteBackspace("  > quoted", { from: 4, to: 4 })?.markdown).toBe("  quoted");
  });

  it("does not steal Backspace away from blockquote body positions", () => {
    expect(applyMarkdownBlockquoteBackspace("> quoted", { from: 3, to: 3 })).toBeNull();
    expect(applyMarkdownBlockquoteBackspace("plain", { from: 0, to: 0 })).toBeNull();
    expect(applyMarkdownBlockquoteBackspace("> quoted", { from: 2, to: 4 })).toBeNull();
  });

  it("continues task lists as unchecked tasks", () => {
    expect(applyMarkdownLineContinuation("- [x] done", { from: 10, to: 10 })).toEqual({
      markdown: "- [x] done\n- [ ] ",
      change: { from: 10, to: 10, insert: "\n- [ ] " },
      selection: { from: 17, to: 17 }
    });
  });

  it("continues blockquotes", () => {
    expect(applyMarkdownLineContinuation("> quoted", { from: 8, to: 8 })).toEqual({
      markdown: "> quoted\n> ",
      change: { from: 8, to: 8, insert: "\n> " },
      selection: { from: 11, to: 11 }
    });
  });

  it("continues lists inside blockquotes", () => {
    expect(applyMarkdownLineContinuation("> - quoted item", { from: 15, to: 15 })).toEqual({
      markdown: "> - quoted item\n> - ",
      change: { from: 15, to: 15, insert: "\n> - " },
      selection: { from: 20, to: 20 }
    });
  });

  it("continues indented ordered lists inside blockquotes", () => {
    expect(applyMarkdownLineContinuation(">   1. quoted item", { from: 18, to: 18 })?.markdown).toBe(">   1. quoted item\n>   2. ");
  });

  it("exits empty list items while preserving indentation", () => {
    expect(applyMarkdownLineContinuation("  -   ", { from: 6, to: 6 })).toEqual({
      markdown: "  ",
      change: { from: 2, to: 6, insert: "" },
      selection: { from: 2, to: 2 }
    });
  });

  it("exits empty blockquotes", () => {
    expect(applyMarkdownLineContinuation("> ", { from: 2, to: 2 })).toEqual({
      markdown: "",
      change: { from: 0, to: 2, insert: "" },
      selection: { from: 0, to: 0 }
    });
  });

  it("toggles heading markers on the current line", () => {
    expect(applyMarkdownBlockCommand("Title", { from: 2, to: 2 }, "heading-2")).toEqual({
      markdown: "## Title",
      change: { from: 0, to: 5, insert: "## Title" },
      selection: { from: 5, to: 5 }
    });

    expect(applyMarkdownBlockCommand("## Title", { from: 4, to: 4 }, "heading-2")).toEqual({
      markdown: "Title",
      change: { from: 0, to: 8, insert: "Title" },
      selection: { from: 1, to: 1 }
    });
  });

  it("adds and removes bullet list markers over multiple lines", () => {
    const added = applyMarkdownBlockCommand("alpha\nbeta", { from: 0, to: 10 }, "bullet-list");

    expect(added.markdown).toBe("- alpha\n- beta");
    expect(added.change).toEqual({ from: 0, to: 10, insert: "- alpha\n- beta" });

    const removed = applyMarkdownBlockCommand(added.markdown, { from: 0, to: added.markdown.length }, "bullet-list");
    expect(removed.markdown).toBe("alpha\nbeta");
  });

  it("numbers ordered list markers across selected lines", () => {
    expect(applyMarkdownBlockCommand("alpha\nbeta", { from: 0, to: 10 }, "ordered-list").markdown).toBe("1. alpha\n2. beta");
  });

  it("converts plain lines to task list items", () => {
    expect(applyMarkdownBlockCommand("alpha\nbeta", { from: 0, to: 10 }, "task-list").markdown).toBe("- [ ] alpha\n- [ ] beta");
  });

  it("toggles blockquote markers", () => {
    const quoted = applyMarkdownBlockCommand("alpha\nbeta", { from: 0, to: 10 }, "blockquote");
    expect(quoted.markdown).toBe("> alpha\n> beta");
    expect(applyMarkdownBlockCommand(quoted.markdown, { from: 0, to: quoted.markdown.length }, "blockquote").markdown).toBe("alpha\nbeta");
  });

  it("wraps and unwraps fenced code blocks", () => {
    const wrapped = applyMarkdownBlockCommand("const x = 1;", { from: 0, to: 12 }, "code-block");
    expect(wrapped.markdown).toBe("```\nconst x = 1;\n```");
    expect(applyMarkdownBlockCommand(wrapped.markdown, { from: 4, to: 16 }, "code-block").markdown).toBe("const x = 1;");
  });

  it("toggles task checkbox markers by source line", () => {
    expect(applyTaskCheckboxToggle("- [ ] first\n- [x] second", 0, true)).toEqual({
      markdown: "- [x] first\n- [x] second",
      change: { from: 3, to: 4, insert: "x" },
      selection: { from: 3, to: 3 }
    });

    expect(applyTaskCheckboxToggle("- [ ] first\n1. [x] second", 1, false)?.markdown).toBe("- [ ] first\n1. [ ] second");
    expect(applyTaskCheckboxToggle("- ordinary", 0, true)).toBeNull();
  });

  it("toggles task checkbox markers inside blockquotes", () => {
    const source = "> - [ ] quoted\n> > 1. [x] nested";

    const quoted = applyTaskCheckboxToggle(source, 0, true)!;
    expect(quoted.markdown).toBe("> - [x] quoted\n> > 1. [x] nested");
    expect(quoted.change).toEqual({ from: 5, to: 6, insert: "x" });

    const nested = applyTaskCheckboxToggle(quoted.markdown, 1, false)!;
    expect(nested.markdown).toBe("> - [x] quoted\n> > 1. [ ] nested");
  });
});
