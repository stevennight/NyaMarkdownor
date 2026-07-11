import { describe, expect, it } from "vitest";
import { cleanPreviewClipboardHtml, normalizePreviewClipboardPlainText } from "./previewClipboard";

describe("preview clipboard helpers", () => {
  it("normalizes rendered preview text without flattening intentional paragraph breaks", () => {
    expect(normalizePreviewClipboardPlainText("  Title  \r\n\r\n\r\nBody line  \n")).toBe("  Title\n\nBody line");
    expect(normalizePreviewClipboardPlainText("A\u00a0B\n\n\nC")).toBe("A B\n\nC");
  });

  it("removes preview-only task controls from rich clipboard HTML", () => {
    const html = cleanPreviewClipboardHtml(
      '<ul><li data-task-line="2" data-task-checked="true"><input class="task-list-checkbox" type="checkbox" checked>Done</li></ul>'
    );

    expect(html).toBe("<ul><li>Done</li></ul>");
  });

  it("keeps ordinary input markup untouched unless it is a preview task checkbox", () => {
    const html = cleanPreviewClipboardHtml('<p><input class="ordinary"> value</p>');

    expect(html).toBe('<p><input class="ordinary"> value</p>');
  });
});
