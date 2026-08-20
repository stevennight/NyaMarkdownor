import { getSchema, type ExtendedRegExpMatchArray } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import { createRichMarkdownExtensions } from "./richMarkdownExtensions";
import { createRichMarkdownBreakInputRule, findRichMarkdownBreakInput } from "./richMarkdownBreakInput";

const extensions = createRichMarkdownExtensions(null);
const markdown = new MarkdownManager({ extensions });
const schema = getSchema(extensions);

describe("rich Markdown break input", () => {
  it("recognizes complete break HTML without treating escaped text as markup", () => {
    expect(findRichMarkdownBreakInput("Before<br>")).toEqual({
      index: 6,
      text: "<br>",
      data: { raw: "<br>" }
    });
    expect(findRichMarkdownBreakInput("Before<BR />")).toEqual(expect.objectContaining({ text: "<BR />" }));
    expect(findRichMarkdownBreakInput(String.raw`Before\<br>`)).toBeNull();
    expect(findRichMarkdownBreakInput("Before<br> after")).toBeNull();
  });

  it("turns typed breaks into the same protected inline HTML node used by Markdown parsing", () => {
    const document = schema.node("doc", null, [schema.node("paragraph", null, [schema.text("Before<br")])]);
    const initial = EditorState.create({
      schema,
      doc: document,
      selection: TextSelection.atEnd(document)
    });
    const rule = createRichMarkdownBreakInputRule(schema.nodes.protectedMarkdownInline, schema.nodes.hardBreak);
    const match = inputRuleMatch(rule, "Before<br>");
    const transaction = initial.tr;

    rule.handler({
      state: { ...initial, tr: transaction } as EditorState,
      range: { from: initial.selection.from - 3, to: initial.selection.from },
      match,
      commands: {} as never,
      chain: (() => ({})) as never,
      can: (() => ({})) as never
    });

    const next = initial.apply(transaction);
    const breakNode = next.doc.firstChild?.child(1);
    expect(breakNode?.type.name).toBe("protectedMarkdownInline");
    expect(breakNode?.attrs).toEqual({ raw: "<br>", kind: "html", label: "" });
    expect(markdown.serialize(next.doc.toJSON())).toBe("Before<br>");
  });

  it("uses the table hard-break node when the typed break is inside a table cell", () => {
    const source = [
      "| Name | Note |",
      "| --- | --- |",
      "| Alice | first<br |"
    ].join("\n");
    const document = schema.nodeFromJSON(markdown.parse(source));
    let textEnd = -1;
    document.descendants((node, position) => {
      if (node.isText && node.text === "first<br") textEnd = position + node.nodeSize;
    });
    expect(textEnd).toBeGreaterThan(0);

    const initial = EditorState.create({
      schema,
      doc: document,
      selection: TextSelection.create(document, textEnd)
    });
    const rule = createRichMarkdownBreakInputRule(schema.nodes.protectedMarkdownInline, schema.nodes.hardBreak);
    const match = inputRuleMatch(rule, "first<br>");
    const transaction = initial.tr;

    rule.handler({
      state: { ...initial, tr: transaction } as EditorState,
      range: { from: textEnd - 3, to: textEnd },
      match,
      commands: {} as never,
      chain: (() => ({})) as never,
      can: (() => ({})) as never
    });

    const next = initial.apply(transaction);
    const hardBreak = findNode(next.doc, "hardBreak");
    expect(hardBreak?.attrs).toEqual(expect.objectContaining({ markdownMarker: "<br>" }));
    expect(markdown.serialize(next.doc.toJSON())).toContain("first<br>");
  });
});

function inputRuleMatch(rule: ReturnType<typeof createRichMarkdownBreakInputRule>, text: string): ExtendedRegExpMatchArray {
  const found = (rule.find as (value: string) => { index: number; text: string; data?: Record<string, unknown> } | null)(text);
  if (!found) throw new Error(`No input rule match for ${text}`);

  const match = [found.text] as ExtendedRegExpMatchArray;
  match.index = found.index;
  match.input = text;
  match.data = found.data;
  return match;
}

function findNode(document: ProseMirrorNode, type: string): ProseMirrorNode | null {
  let result: ProseMirrorNode | null = null;
  document.descendants((node) => {
    if (!result && node.type.name === type) result = node;
  });
  return result;
}
