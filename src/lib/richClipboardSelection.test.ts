import { getSchema } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { describe, expect, it } from "vitest";
import { createRichMarkdownExtensions } from "./richMarkdownExtensions";
import { richSelectionDocument } from "./richClipboardSelection";

const extensions = createRichMarkdownExtensions(null);
const schema = getSchema(extensions);
const markdown = new MarkdownManager({ extensions });

function copied(source: string, fromText: string, toText: string): string {
  const doc = schema.nodeFromJSON(markdown.parse(source));
  let from: number | null = null;
  let to: number | null = null;
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    if (from === null && node.text.includes(fromText)) from = pos + node.text.indexOf(fromText);
    if (node.text.includes(toText)) to = pos + node.text.indexOf(toText) + toText.length;
  });
  return markdown.serialize(richSelectionDocument(doc, from!, to!));
}

describe("rich selection clipboard document", () => {
  it("keeps the ordered list type and numbering of copied middle items", () => {
    expect(copied("1. one\n2. two\n3. three\n4. four", "three", "four")).toBe("3. three\n4. four");
  });

  it("keeps bullet markers and task states", () => {
    expect(copied("* a\n* b\n* c", "b", "c")).toBe("* b\n* c");
    expect(copied("- [ ] a\n- [x] b", "a", "b")).toBe("- [ ] a\n- [x] b");
  });

  it("copies text inside one block without block syntax", () => {
    expect(copied("## Heading words", "Head", "ing")).toBe("Heading");
  });
});
