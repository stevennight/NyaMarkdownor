import { getSchema, type ExtendedRegExpMatchArray, type InputRuleMatch } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import { createRichMarkdownExtensions } from "./richMarkdownExtensions";
import { createRichMarkdownLinkInputRule, findRichMarkdownLinkInput } from "./richMarkdownLinkInput";

const extensions = createRichMarkdownExtensions(null);
const markdown = new MarkdownManager({ extensions });
const schema = getSchema(extensions);
const parseMarkdown = (source: string) => markdown.parse(source);

describe("rich Markdown link input", () => {
  it("finds a complete inline-link suffix and keeps its rich link attributes", () => {
    const match = findRichMarkdownLinkInput("Before [111](https://baidu.com)", parseMarkdown);

    expect(match).toEqual(expect.objectContaining({
      index: 7,
      source: "[111](https://baidu.com)"
    }));
    expect(match?.content).toEqual([
      expect.objectContaining({
        type: "text",
        text: "111",
        marks: [expect.objectContaining({
          type: "link",
          attrs: expect.objectContaining({
            href: "https://baidu.com",
            markdownInlineSuffix: "(https://baidu.com)"
          })
        })]
      })
    ]);
    expect(markdown.serialize({
      type: "doc",
      content: [{ type: "paragraph", content: match?.content ?? [] }]
    })).toBe("[111](https://baidu.com)");
  });

  it("accepts formatted labels, balanced destinations, and titles", () => {
    const source = "[**Guide**](<docs/guide(v2).md>   'Guide title')";
    const match = findRichMarkdownLinkInput(`Read ${source}`, parseMarkdown);

    expect(match?.source).toBe(source);
    expect(match?.content[0]).toEqual(expect.objectContaining({
      text: "Guide",
      marks: expect.arrayContaining([
        expect.objectContaining({ type: "bold" }),
        expect.objectContaining({
          type: "link",
          attrs: expect.objectContaining({
            href: "docs/guide(v2).md",
            title: "Guide title",
            markdownInlineSuffix: "(<docs/guide(v2).md>   'Guide title')"
          })
        })
      ])
    }));
  });

  it("does not convert incomplete, escaped, image, unsafe, or full-width syntax", () => {
    const rejected = [
      "[111](https://baidu.com",
      String.raw`\[111](https://baidu.com)`,
      "![111](https://baidu.com/image.png)",
      "[111](javascript:alert(1))",
      "[111](//baidu.com)",
      "[111]（https://baidu.com）"
    ];

    rejected.forEach((source) => {
      expect(findRichMarkdownLinkInput(source, parseMarkdown)).toBeNull();
    });
  });

  it("replaces typed syntax and leaves subsequent text outside the link", () => {
    const source = "[111](https://baidu.com)";
    const beforeClosingParenthesis = source.slice(0, -1);
    const document = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text(beforeClosingParenthesis)])
    ]);
    const initial = EditorState.create({
      schema,
      doc: document,
      selection: TextSelection.atEnd(document)
    });
    const rule = createRichMarkdownLinkInputRule(schema.marks.link, parseMarkdown);
    const found = (rule.find as (text: string) => InputRuleMatch | null)(source);
    expect(found).not.toBeNull();

    const match = [found?.text ?? ""] as ExtendedRegExpMatchArray;
    match.index = found?.index ?? 0;
    match.input = source;
    match.data = found?.data;
    const transaction = initial.tr;
    rule.handler({
      state: { schema, tr: transaction } as EditorState,
      range: { from: 1, to: beforeClosingParenthesis.length + 1 },
      match,
      commands: {} as never,
      chain: (() => ({})) as never,
      can: (() => ({})) as never
    });

    const linked = initial.apply(transaction);
    const withFollowingText = linked.apply(linked.tr.insertText(" next"));
    expect(markdown.serialize(withFollowingText.doc.toJSON())).toBe("[111](https://baidu.com) next");
    expect(withFollowingText.doc.firstChild?.child(1).marks).toHaveLength(0);
  });
});
