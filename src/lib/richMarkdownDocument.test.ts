import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { normalizeRichOrderedLists, withoutGeneratedTrailingParagraph } from "./richMarkdownDocument";

describe("rich Markdown document normalization", () => {
  it("merges adjacent ordered-list projections so numbering continues after item deletion", () => {
    const document: JSONContent = {
      type: "doc",
      content: [
        {
          type: "orderedList",
          attrs: { start: 1, markdownDelimiter: ".", markdownLoose: false },
          content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }] }]
        },
        {
          type: "orderedList",
          attrs: { start: 1, markdownDelimiter: ".", markdownLoose: false },
          content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "two" }] }] }]
        }
      ]
    };

    expect(normalizeRichOrderedLists(document).content).toHaveLength(1);
    expect(normalizeRichOrderedLists(document).content?.[0].content).toHaveLength(2);

    const restarted = {
      ...document,
      content: document.content?.map((list, index) => ({
        ...list,
        attrs: { ...list.attrs, start: index === 0 ? 3 : 1 }
      }))
    };
    expect(normalizeRichOrderedLists(restarted).content).toHaveLength(2);
  });

  it("removes the editor-only empty paragraph after a terminal block", () => {
    const document: JSONContent = {
      type: "doc",
      content: [
        { type: "orderedList", content: [] },
        { type: "paragraph" }
      ]
    };

    expect(withoutGeneratedTrailingParagraph(document)).toEqual({
      type: "doc",
      content: [{ type: "orderedList", content: [] }]
    });
  });

  it("keeps empty and non-empty user paragraphs", () => {
    const documents: JSONContent[] = [
      { type: "doc", content: [{ type: "paragraph" }] },
      {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "text" }] },
          { type: "paragraph" }
        ]
      },
      {
        type: "doc",
        content: [
          { type: "orderedList", content: [] },
          { type: "paragraph", content: [{ type: "text", text: "after" }] }
        ]
      }
    ];

    documents.forEach((document) => {
      expect(withoutGeneratedTrailingParagraph(document)).toBe(document);
    });
  });
});
