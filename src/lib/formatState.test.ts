import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { EMPTY_FORMAT_STATE, sameFormatState } from "./formatState";
import { sourceFormatStateAt } from "./sourceFormatState";

function at(source: string, marker = "|") {
  const offset = source.indexOf(marker);
  const state = EditorState.create({ doc: source.replace(marker, ""), extensions: [markdown({ base: markdownLanguage })] });
  ensureSyntaxTree(state, state.doc.length, 5_000);
  return sourceFormatStateAt(state, offset);
}

describe("source format state", () => {
  it("reports headings and paragraphs", () => {
    expect(at("## Ti|tle").block).toBe("heading-2");
    expect(at("## Title|").block).toBe("heading-2");
    expect(at("Plain |text").block).toBe("paragraph");
    expect(at("Setext|\n===").block).toBe("heading-1");
  });

  it("reports the innermost list kind and quotes", () => {
    expect(at("- it|em")).toMatchObject({ bulletList: true, orderedList: false, taskList: false });
    expect(at("12. it|em")).toMatchObject({ orderedList: true, bulletList: false });
    expect(at("- [x] do|ne")).toMatchObject({ taskList: true, bulletList: false });
    expect(at("1. outer\n   - in|ner")).toMatchObject({ bulletList: true, orderedList: false });
    expect(at("> quo|ted")).toMatchObject({ blockquote: true });
  });

  it("reports inline formatting around the cursor", () => {
    expect(at("a **bo|ld** b")).toMatchObject({ bold: true, italic: false });
    expect(at("a *it|al* b")).toMatchObject({ italic: true });
    expect(at("a ~~gone|~~ b")).toMatchObject({ strike: true });
    expect(at("a `co|de` b")).toMatchObject({ code: true });
    expect(at("a [li|nk](https://example.com) b")).toMatchObject({ link: true });
    expect(at("plain |text")).toMatchObject({ bold: false, link: false });
  });

  it("reports fenced code", () => {
    expect(at("```js\nconst |a = 1;\n```").block).toBe("code-block");
    expect(at("```js\nx\n```\n\nafter |text").block).toBe("paragraph");
  });

  it("compares states by value", () => {
    expect(sameFormatState(EMPTY_FORMAT_STATE, { ...EMPTY_FORMAT_STATE })).toBe(true);
    expect(sameFormatState(EMPTY_FORMAT_STATE, { ...EMPTY_FORMAT_STATE, bold: true })).toBe(false);
  });
});
