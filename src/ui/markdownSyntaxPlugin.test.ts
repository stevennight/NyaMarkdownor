import { EditorState } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { describe, expect, it } from "vitest";
import { isMarkdownCodeTextLine, isMarkdownTableLine, markdownSyntaxRangesForLine } from "./markdownSyntaxPlugin";

function createMarkdownState(doc: string): EditorState {
  return EditorState.create({
    doc,
    extensions: [markdown({ base: markdownLanguage })]
  });
}

describe("Markdown syntax decorations", () => {
  it("recognizes pipe-heavy fenced code content as code text", () => {
    const state = createMarkdownState([
      "~~~md",
      "| Not | A table |",
      "| --- | ------- |",
      "~~~",
      "",
      "| Real | Table |",
      "| ---- | ----- |"
    ].join("\n"));

    const codeLine = state.doc.line(2);
    const realTableLine = state.doc.line(6);

    expect(isMarkdownCodeTextLine(state, codeLine.from, codeLine.to)).toBe(true);
    expect(isMarkdownCodeTextLine(state, realTableLine.from, realTableLine.to)).toBe(false);
  });

  it("does not treat fence markers or inline code as fenced code content lines", () => {
    const state = createMarkdownState([
      "```ts",
      "const value = `inline`;",
      "```",
      "",
      "`inline` only"
    ].join("\n"));

    const openingFence = state.doc.line(1);
    const codeText = state.doc.line(2);
    const closingFence = state.doc.line(3);
    const inlineCode = state.doc.line(5);

    expect(isMarkdownCodeTextLine(state, openingFence.from, openingFence.to)).toBe(false);
    expect(isMarkdownCodeTextLine(state, codeText.from, codeText.to)).toBe(true);
    expect(isMarkdownCodeTextLine(state, closingFence.from, closingFence.to)).toBe(false);
    expect(isMarkdownCodeTextLine(state, inlineCode.from, inlineCode.to)).toBe(false);
  });

  it("recognizes indented code content without treating nested lists as code", () => {
    const state = createMarkdownState([
      "    | Not | A table |",
      "    | --- | ------- |",
      "",
      "- item",
      "    - nested"
    ].join("\n"));

    const indentedCodeLine = state.doc.line(1);
    const nestedListLine = state.doc.line(5);

    expect(isMarkdownCodeTextLine(state, indentedCodeLine.from, indentedCodeLine.to)).toBe(true);
    expect(isMarkdownCodeTextLine(state, nestedListLine.from, nestedListLine.to)).toBe(false);
  });

  it("marks table pipes only inside real Markdown tables", () => {
    const state = createMarkdownState([
      "A sentence with A | B but no table.",
      "",
      "| Real | Table |",
      "| ---- | ----- |",
      "| x | y |"
    ].join("\n"));
    const proseLine = state.doc.line(1);
    const tableLine = state.doc.line(3);
    const source = state.doc.toString();

    expect(isMarkdownTableLine(state, proseLine.from, proseLine.to, source)).toBe(false);
    expect(isMarkdownTableLine(state, tableLine.from, tableLine.to, source)).toBe(true);
  });

  it("softens link destinations so selected links do not expose raw URL syntax", () => {
    const line = "See [Guide](https://example.com/docs) and [Ref][guide].";
    const ranges = markdownSyntaxRangesForLine(line);
    const softenedText = ranges.map((range) => line.slice(range.from, range.to));

    expect(softenedText).toContain("https://example.com/docs");
    expect(softenedText).toContain("][guide]");
  });

  it("keeps ordinary bracketed text visible while softening task list markers", () => {
    const prose = "Press [x] to close or leave [ ] blank.";
    const proseRanges = markdownSyntaxRangesForLine(prose);
    const task = "- [x] Done";
    const taskRanges = markdownSyntaxRangesForLine(task);
    const quotedTask = "> - [ ] Todo";
    const quotedTaskRanges = markdownSyntaxRangesForLine(quotedTask);

    expect(rangeCoversSpan(proseRanges, prose.indexOf("[x]"), prose.indexOf("[x]") + 3)).toBe(false);
    expect(rangeCoversSpan(proseRanges, prose.indexOf("[ ]"), prose.indexOf("[ ]") + 3)).toBe(false);
    expect(rangeCoversSpan(taskRanges, task.indexOf("[x]"), task.indexOf("[x]") + 3)).toBe(true);
    expect(rangeCoversSpan(quotedTaskRanges, quotedTask.indexOf("[ ]"), quotedTask.indexOf("[ ]") + 3)).toBe(true);
  });

  it("softens complete inline link destinations with balanced parentheses", () => {
    const line = "See [API](https://example.com/a_(b)) and ![Chart](images/chart_(v2).png).";
    const ranges = markdownSyntaxRangesForLine(line);
    const softenedText = ranges.map((range) => line.slice(range.from, range.to));

    expect(softenedText).toContain("https://example.com/a_(b)");
    expect(softenedText).toContain("images/chart_(v2).png");
    expect(softenedText).not.toContain("https://example.com/a_(b");
  });

  it("softens Markdown autolink angle brackets without hiding the visible target", () => {
    const line = "Open <https://example.com/docs> or mail <hello@example.com>.";
    const ranges = markdownSyntaxRangesForLine(line);
    const softenedText = ranges.map((range) => line.slice(range.from, range.to));

    expect(softenedText).toContain("<");
    expect(softenedText).toContain(">");
    expect(softenedText).not.toContain("https://example.com/docs");
    expect(softenedText).not.toContain("hello@example.com");
  });

  it("keeps Markdown-looking content inside inline code visually literal", () => {
    const line = "Use `[Guide](https://example.com)` as literal code.";
    const ranges = markdownSyntaxRangesForLine(line);
    const softenedText = ranges.map((range) => line.slice(range.from, range.to));

    expect(softenedText).toContain("`");
    expect(softenedText).not.toContain("https://example.com");
    expect(softenedText).not.toContain("](");
  });

  it("keeps intraword underscores visually literal while softening real emphasis delimiters", () => {
    const line = "Use snake_case_value and file_name.md, then _italic_ and __strong__.";
    const ranges = markdownSyntaxRangesForLine(line);
    const intrawordUnderscores = [
      line.indexOf("_case"),
      line.indexOf("_value"),
      line.indexOf("_name")
    ];
    const italicOpen = line.indexOf("_italic_");
    const italicClose = italicOpen + "_italic".length;
    const strongOpen = line.indexOf("__strong__");
    const strongClose = strongOpen + "__strong".length;

    expect(intrawordUnderscores.every((index) => !rangeCoversOffset(ranges, index))).toBe(true);
    expect(rangeCoversSpan(ranges, italicOpen, italicOpen + 1)).toBe(true);
    expect(rangeCoversSpan(ranges, italicClose, italicClose + 1)).toBe(true);
    expect(rangeCoversSpan(ranges, strongOpen, strongOpen + 2)).toBe(true);
    expect(rangeCoversSpan(ranges, strongClose, strongClose + 2)).toBe(true);
  });

  it("keeps ordinary asterisks visible while softening paired emphasis delimiters", () => {
    const line = "Use 2 * 3, *.md, then *italic* and **strong**.";
    const ranges = markdownSyntaxRangesForLine(line);
    const multiply = line.indexOf("* 3");
    const glob = line.indexOf("*.md");
    const italicOpen = line.indexOf("*italic*");
    const italicClose = italicOpen + "*italic".length;
    const strongOpen = line.indexOf("**strong**");
    const strongClose = strongOpen + "**strong".length;

    expect(rangeCoversOffset(ranges, multiply)).toBe(false);
    expect(rangeCoversOffset(ranges, glob)).toBe(false);
    expect(rangeCoversSpan(ranges, italicOpen, italicOpen + 1)).toBe(true);
    expect(rangeCoversSpan(ranges, italicClose, italicClose + 1)).toBe(true);
    expect(rangeCoversSpan(ranges, strongOpen, strongOpen + 2)).toBe(true);
    expect(rangeCoversSpan(ranges, strongClose, strongClose + 2)).toBe(true);
  });

  it("softens complete triple emphasis delimiter runs", () => {
    const line = "Use ***bold italic*** and ___also strong italic___.";
    const ranges = markdownSyntaxRangesForLine(line);
    const asteriskOpen = line.indexOf("***bold");
    const asteriskClose = asteriskOpen + "***bold italic".length;
    const underscoreOpen = line.indexOf("___also");
    const underscoreClose = underscoreOpen + "___also strong italic".length;

    expect(rangeCoversSpan(ranges, asteriskOpen, asteriskOpen + 3)).toBe(true);
    expect(rangeCoversSpan(ranges, asteriskClose, asteriskClose + 3)).toBe(true);
    expect(rangeCoversSpan(ranges, underscoreOpen, underscoreOpen + 3)).toBe(true);
    expect(rangeCoversSpan(ranges, underscoreClose, underscoreClose + 3)).toBe(true);
  });

  it("keeps isolated tildes visible while softening paired strikethrough delimiters", () => {
    const line = "Use approx ~~10, fence ~~~, then ~~deleted~~.";
    const ranges = markdownSyntaxRangesForLine(line);
    const approximate = line.indexOf("~~10");
    const fence = line.indexOf("~~~");
    const strikeOpen = line.indexOf("~~deleted~~");
    const strikeClose = strikeOpen + "~~deleted".length;

    expect(rangeCoversOffset(ranges, approximate)).toBe(false);
    expect(rangeCoversOffset(ranges, fence)).toBe(false);
    expect(rangeCoversSpan(ranges, strikeOpen, strikeOpen + 2)).toBe(true);
    expect(rangeCoversSpan(ranges, strikeClose, strikeClose + 2)).toBe(true);
  });
});

function rangeCoversOffset(ranges: Array<{ from: number; to: number }>, offset: number): boolean {
  return ranges.some((range) => range.from <= offset && range.to > offset);
}

function rangeCoversSpan(ranges: Array<{ from: number; to: number }>, from: number, to: number): boolean {
  return ranges.some((range) => range.from === from && range.to === to);
}
