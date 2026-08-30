import { afterEach, describe, expect, it, vi } from "vitest";

const clipboardPlugin = vi.hoisted(() => ({
  writeHtml: vi.fn(),
  writeText: vi.fn()
}));

vi.mock("@tauri-apps/plugin-clipboard-manager", () => clipboardPlugin);

import { clipboardPayloadForCopyMode, compactMarkdownForClipboard, copyRichContent, explicitMarkdownFromClipboard, trimClipboardBoundaryLineBreaks, writeClipboardEventData } from "./clipboard";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  clipboardPlugin.writeHtml.mockReset();
  clipboardPlugin.writeText.mockReset();
});

describe("clipboard helpers", () => {
  it("selects Markdown, multi-format, or plain payloads for the configured copy mode", () => {
    const payload = {
      plainText: "Heading",
      html: "<h1>Heading</h1>",
      markdown: "# Heading"
    };

    expect(clipboardPayloadForCopyMode(payload, "source")).toEqual({
      plainText: "# Heading",
      markdown: "# Heading"
    });
    expect(clipboardPayloadForCopyMode(payload, "compact")).toEqual({
      plainText: "# Heading",
      markdown: "# Heading"
    });
    expect(clipboardPayloadForCopyMode(payload, "smart")).toBe(payload);
    expect(clipboardPayloadForCopyMode(payload, "plain")).toEqual({
      plainText: "Heading"
    });
  });

  it("copies compact Markdown without block-separator blank lines", () => {
    const markdown = [
      "# Heading",
      "",
      "Paragraph",
      "",
      "- First",
      "- Second",
      "",
      "| Name |",
      "| --- |",
      "| Alpha |"
    ].join("\n");

    expect(compactMarkdownForClipboard(markdown)).toBe([
      "# Heading",
      "Paragraph",
      "- First",
      "- Second",
      "| Name |",
      "| --- |",
      "| Alpha |"
    ].join("\n"));
    expect(clipboardPayloadForCopyMode({ plainText: "Clean", markdown }, "compact")).toEqual({
      plainText: compactMarkdownForClipboard(markdown),
      markdown
    });
  });

  it("preserves literal blank lines in compact Markdown code, HTML, and front matter", () => {
    const markdown = [
      "---",
      "title: Example",
      "",
      "tags: []",
      "---",
      "",
      "```text",
      "line 1",
      "",
      "line 2",
      "```",
      "",
      "<div>",
      "",
      "inside",
      "</div>",
      "",
      "After"
    ].join("\n");

    expect(compactMarkdownForClipboard(markdown)).toBe([
      "---",
      "title: Example",
      "",
      "tags: []",
      "---",
      "```text",
      "line 1",
      "",
      "line 2",
      "```",
      "<div>",
      "",
      "inside",
      "</div>",
      "After"
    ].join("\n"));
  });

  it("normalizes generated Markdown spacing for every copy mode that carries Markdown", () => {
    const payload = {
      plainText: "First\nSecond",
      html: "<p>First</p><p>Second</p>",
      markdown: "First\n\n\nSecond"
    };

    expect(clipboardPayloadForCopyMode(payload, "source")).toEqual({
      plainText: "First\n\nSecond",
      markdown: "First\n\nSecond"
    });
    expect(clipboardPayloadForCopyMode(payload, "smart")).toEqual({
      ...payload,
      markdown: "First\n\nSecond"
    });
    expect(clipboardPayloadForCopyMode(payload, "plain")).toEqual({
      plainText: "First\nSecond"
    });
  });

  it("removes editor-generated line breaks only at rich clipboard boundaries", () => {
    expect(trimClipboardBoundaryLineBreaks("\r\n# Heading\r\n\r\nBody\r\n\r\n")).toBe("# Heading\n\nBody");
    expect(trimClipboardBoundaryLineBreaks("  code  ")).toBe("  code  ");
  });

  it("collapses generated paragraph spacing without touching fenced code or HTML blocks", () => {
    expect(trimClipboardBoundaryLineBreaks([
      "First",
      "",
      "",
      "",
      "Second",
      "",
      "```text",
      "line 1",
      "",
      "",
      "line 2",
      "```",
      "",
      "",
      "<div>",
      "",
      "",
      "inside HTML",
      "</div>",
      "",
      "",
      "After"
    ].join("\n"))).toBe([
      "First",
      "",
      "Second",
      "",
      "```text",
      "line 1",
      "",
      "",
      "line 2",
      "```",
      "",
      "<div>",
      "",
      "",
      "inside HTML",
      "</div>",
      "",
      "After"
    ].join("\n"));
  });

  it("does not treat HTML void elements as an open block", () => {
    expect(trimClipboardBoundaryLineBreaks("First\n\n\n<br>\n\n\nSecond"))
      .toBe("First\n\n<br>\n\nSecond");
  });

  it("keeps explicit Markdown source ahead of clean clipboard representations", () => {
    expect(explicitMarkdownFromClipboard({
      markdown: "[Docs](https://example.com)\r\n"
    })).toBe("[Docs](https://example.com)\n");
    expect(explicitMarkdownFromClipboard({ markdown: "" })).toBeNull();
  });

  it("writes plain text, HTML, and Markdown to copy events", () => {
    const clipboardData = createClipboardData();
    const mode = writeClipboardEventData(createClipboardEvent(clipboardData), {
      plainText: "Plain",
      html: "<strong>Plain</strong>",
      markdown: "**Plain**"
    });

    expect(mode).toBe("rich");
    expect(clipboardData.setData).toHaveBeenCalledWith("text/plain", "Plain");
    expect(clipboardData.setData).toHaveBeenCalledWith("text/html", "<strong>Plain</strong>");
    expect(clipboardData.setData).toHaveBeenCalledWith("text/markdown", "**Plain**");
  });

  it("writes explicit Markdown copies as plain text plus text/markdown", () => {
    const clipboardData = createClipboardData();
    const mode = writeClipboardEventData(createClipboardEvent(clipboardData), {
      plainText: "# Heading",
      markdown: "# Heading"
    });

    expect(mode).toBe("plain");
    expect(clipboardData.setData).toHaveBeenCalledWith("text/plain", "# Heading");
    expect(clipboardData.setData).toHaveBeenCalledWith("text/markdown", "# Heading");
    expect(clipboardData.setData).not.toHaveBeenCalledWith("text/html", expect.any(String));
  });

  it("uses a copy event for rich payloads before plugin fallbacks", async () => {
    const clipboardData = createClipboardData();
    const copyEvent = createClipboardEvent(clipboardData);
    const document = createCopyDocument(copyEvent);
    vi.stubGlobal("document", document);

    const mode = await copyRichContent({
      plainText: "Plain",
      html: "<strong>Plain</strong>",
      markdown: "**Plain**"
    });

    expect(mode).toBe("rich");
    expect(copyEvent.preventDefault).toHaveBeenCalledOnce();
    expect(clipboardData.setData).toHaveBeenCalledWith("text/markdown", "**Plain**");
    expect(clipboardPlugin.writeHtml).not.toHaveBeenCalled();
    expect(clipboardPlugin.writeText).not.toHaveBeenCalled();
  });

  it("normalizes Markdown spacing before direct copy helpers write it", async () => {
    const clipboardData = createClipboardData();
    const copyEvent = createClipboardEvent(clipboardData);
    const document = createCopyDocument(copyEvent);
    vi.stubGlobal("document", document);

    const mode = await copyRichContent({
      plainText: "First\n\n\nSecond",
      markdown: "First\n\n\nSecond"
    });

    expect(mode).toBe("plain");
    expect(clipboardData.setData).toHaveBeenCalledWith("text/plain", "First\n\nSecond");
    expect(clipboardData.setData).toHaveBeenCalledWith("text/markdown", "First\n\nSecond");
  });

  it("keeps compact plain text when the Tauri clipboard falls back to text only", async () => {
    const clipboardData = createClipboardData();
    const copyEvent = createClipboardEvent(clipboardData);
    vi.stubGlobal("document", createCopyDocument(copyEvent, false));
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });

    const mode = await copyRichContent({
      plainText: "First\nSecond",
      markdown: "First\n\nSecond"
    });

    expect(mode).toBe("plain");
    expect(clipboardPlugin.writeText).toHaveBeenCalledWith("First\nSecond");
  });

  it("keeps compact plain text when the browser clipboard falls back to writeText", async () => {
    const clipboardData = createClipboardData();
    const copyEvent = createClipboardEvent(clipboardData);
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("document", createCopyDocument(copyEvent, false));
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    const mode = await copyRichContent({
      plainText: "First\nSecond",
      markdown: "First\n\nSecond"
    });

    expect(mode).toBe("plain");
    expect(writeText).toHaveBeenCalledWith("First\nSecond");
  });
});

function createClipboardData(): DataTransfer {
  return {
    setData: vi.fn()
  } as unknown as DataTransfer;
}

function createClipboardEvent(clipboardData: DataTransfer): ClipboardEvent {
  return {
    clipboardData,
    preventDefault: vi.fn()
  } as unknown as ClipboardEvent;
}

function createCopyDocument(copyEvent: ClipboardEvent, copied = true): Document {
  let copyHandler: ((event: ClipboardEvent) => void) | null = null;
  const scratch = {
    value: "",
    setAttribute: vi.fn(),
    style: {
      position: "",
      top: "",
      opacity: ""
    },
    select: vi.fn(),
    remove: vi.fn()
  };

  return {
    createElement: vi.fn(() => scratch),
    body: {
      append: vi.fn()
    },
    addEventListener: vi.fn((type: string, handler: EventListenerOrEventListenerObject) => {
      if (type === "copy" && typeof handler === "function") {
        copyHandler = handler as (event: ClipboardEvent) => void;
      }
    }),
    removeEventListener: vi.fn(),
    execCommand: vi.fn((command: string) => {
      if (command === "copy") copyHandler?.(copyEvent);
      return copied;
    })
  } as unknown as Document;
}
