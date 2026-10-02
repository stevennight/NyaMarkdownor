import { getSchema } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { Fragment, Slice } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import { createRichMarkdownExtensions } from "./richMarkdownExtensions";
import { convertWordListParagraphs, richPasteSliceKeepingBlockType } from "./richPastedHtml";

function wordParagraph(level: number, marker: string, text: string, symbolFont = false): string {
  const markerStyle = symbolFont ? " style='font-family:Wingdings'" : "";
  return `<p class=MsoListParagraphCxSpMiddle style='margin-left:21pt;text-indent:-21pt;mso-list:l0 level${level} lfo1'>`
    + `<!--[if !supportLists]--><span${markerStyle}><span style='mso-list:Ignore'>${marker}<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp; </span></span></span><!--[endif]-->`
    + `<span lang=EN-US>${text}</span><o:p></o:p></p>`;
}

describe("Word list paste conversion", () => {
  it("turns numbered Word paragraphs into an ordered list", () => {
    const html = `<p class=MsoNormal>Intro</p>\n${wordParagraph(1, "1.", "One")}\n${wordParagraph(1, "2.", "Two")}\n<p class=MsoNormal>Outro</p>`;
    const converted = convertWordListParagraphs(html);

    expect(converted).toContain("<p class=MsoNormal>Intro</p>");
    expect(converted).toContain("<ol><li><span lang=EN-US>One</span></li><li><span lang=EN-US>Two</span></li></ol>");
    expect(converted).toContain("<p class=MsoNormal>Outro</p>");
    expect(converted).not.toContain("mso-list:Ignore");
  });

  it("nests deeper levels and recognises symbol-font bullets", () => {
    const html = [
      wordParagraph(1, "l", "Parent", true),
      wordParagraph(2, "o", "Child", true),
      wordParagraph(1, "l", "Sibling", true)
    ].join("");

    expect(convertWordListParagraphs(html)).toBe(
      "<ul><li><span lang=EN-US>Parent</span><ul><li><span lang=EN-US>Child</span></li></ul></li><li><span lang=EN-US>Sibling</span></li></ul>"
    );
  });

  it("keeps the start number of a list that does not begin at one", () => {
    expect(convertWordListParagraphs(wordParagraph(1, "3.", "Three"))).toContain('<ol start="3">');
  });

  it("leaves HTML without Word lists untouched", () => {
    const html = "<ul><li>Already a list</li></ul>";
    expect(convertWordListParagraphs(html)).toBe(html);
  });
});

describe("pasted slice block types", () => {
  const extensions = createRichMarkdownExtensions(null);
  const schema = getSchema(extensions);
  const markdown = new MarkdownManager({ extensions });

  function paragraphState(): EditorState {
    const doc = schema.nodeFromJSON(markdown.parse("Some text"));
    return EditorState.create({ doc, selection: TextSelection.create(doc, 3) });
  }

  it("keeps a pasted heading as a heading inside a paragraph", () => {
    const heading = schema.nodes.heading.create({ level: 2 }, schema.text("Title"));
    const slice = new Slice(Fragment.from(heading), 1, 1);
    const state = paragraphState();
    const next = state.apply(state.tr.replaceSelection(richPasteSliceKeepingBlockType(slice, state)));

    const types: string[] = [];
    next.doc.forEach((node) => types.push(node.type.name));
    expect(types).toContain("heading");
  });

  it("keeps the first item of a pasted list in the list", () => {
    const item = schema.nodes.listItem.create(null, schema.nodes.paragraph.create(null, schema.text("W1")));
    const list = schema.nodes.orderedList.create({ start: 1 }, [item]);
    const slice = new Slice(Fragment.from(list), 3, 3);
    const state = paragraphState();
    const next = state.apply(state.tr.replaceSelection(richPasteSliceKeepingBlockType(slice, state)));

    expect(markdown.serialize(next.doc.toJSON())).toBe("So\n\n1. W1\n\nme text");
  });

  it("leaves pasted paragraphs open so inline text merges normally", () => {
    const paragraph = schema.nodes.paragraph.create(null, schema.text("inline"));
    const slice = new Slice(Fragment.from(paragraph), 1, 1);
    expect(richPasteSliceKeepingBlockType(slice, paragraphState())).toBe(slice);
  });
});
