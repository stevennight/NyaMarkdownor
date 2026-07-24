import { afterEach, describe, expect, it, vi } from "vitest";

const clipboardPlugin = vi.hoisted(() => ({
  writeHtml: vi.fn(),
  writeText: vi.fn()
}));

vi.mock("@tauri-apps/plugin-clipboard-manager", () => clipboardPlugin);

import { clipboardPayloadForCopyMode, copyRichContent, explicitMarkdownFromClipboard, trimClipboardBoundaryLineBreaks, writeClipboardEventData } from "./clipboard";

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

    expect(clipboardPayloadForCopyMode(payload, "markdown")).toEqual({
      plainText: "# Heading",
      markdown: "# Heading"
    });
    expect(clipboardPayloadForCopyMode(payload, "smart")).toBe(payload);
    expect(clipboardPayloadForCopyMode(payload, "plain")).toEqual({
      plainText: "Heading"
    });
  });

  it("removes editor-generated line breaks only at rich clipboard boundaries", () => {
    expect(trimClipboardBoundaryLineBreaks("\r\n# Heading\r\n\r\nBody\r\n\r\n")).toBe("# Heading\n\nBody");
    expect(trimClipboardBoundaryLineBreaks("  code  ")).toBe("  code  ");
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

function createCopyDocument(copyEvent: ClipboardEvent): Document {
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
      return true;
    })
  } as unknown as Document;
}
