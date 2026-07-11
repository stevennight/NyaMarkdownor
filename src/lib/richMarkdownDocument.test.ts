import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { withoutGeneratedTrailingParagraph } from "./richMarkdownDocument";

describe("rich Markdown document normalization", () => {
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
