import { getSchema } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { describe, expect, it } from "vitest";
import { createRichMarkdownExtensions } from "./richMarkdownExtensions";
import { findRichTextMatches } from "./richSearch";

const extensions = createRichMarkdownExtensions(null);
const markdown = new MarkdownManager({ extensions });
const schema = getSchema(extensions);
const options = { caseSensitive: false, wholeWord: false };

function parseDocument(source: string) {
  return schema.nodeFromJSON(markdown.parse(source));
}

describe("rich editor search", () => {
  it("finds text across adjacent formatting marks", () => {
    expect(findRichTextMatches(parseDocument("alpha **beta** alpha"), "alpha beta", options)).toEqual([
      { from: 1, to: 11 }
    ]);
  });

  it("does not match across paragraphs or hard breaks", () => {
    expect(findRichTextMatches(parseDocument("alpha\n\nbeta"), "alphabeta", options)).toEqual([]);
    expect(findRichTextMatches(parseDocument("alpha  \nbeta"), "alphabeta", options)).toEqual([]);
  });

  it("keeps the visible match limit across multiple text runs", () => {
    expect(findRichTextMatches(parseDocument("one **one** one"), "one", options, 2)).toEqual([
      { from: 1, to: 4 },
      { from: 5, to: 8 }
    ]);
  });
});
