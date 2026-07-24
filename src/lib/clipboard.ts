import { writeHtml as writeClipboardHtml, writeText as writeClipboardText } from "@tauri-apps/plugin-clipboard-manager";
import { isTauriRuntime } from "./fileIo";
import { normalizeMarkdownLineEndings } from "./lineEndings";
import type { CopyMode } from "../types";

export type ClipboardPayload = {
  plainText: string;
  markdown?: string;
  html?: string;
};

export type ClipboardWriteMode = "rich" | "html" | "plain";

export function trimClipboardBoundaryLineBreaks(text: string): string {
  return normalizeMarkdownLineEndings(text).replace(/^\n+|\n+$/g, "");
}

export function clipboardPayloadForCopyMode(payload: ClipboardPayload, copyMode: CopyMode): ClipboardPayload {
  if (copyMode === "smart") return payload;
  if (copyMode === "plain") return { plainText: payload.plainText };

  const markdown = payload.markdown ?? payload.plainText;
  return {
    plainText: markdown,
    markdown
  };
}

export function explicitMarkdownFromClipboard(data: { markdown?: string | null }): string | null {
  return typeof data.markdown === "string" && data.markdown.length > 0
    ? normalizeMarkdownLineEndings(data.markdown)
    : null;
}

export async function copyText(text: string): Promise<boolean> {
  if (isTauriRuntime()) {
    await writeClipboardText(text);
    return true;
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      console.warn(error);
    }
  }

  const scratch = document.createElement("textarea");
  scratch.value = text;
  scratch.setAttribute("readonly", "");
  scratch.style.position = "fixed";
  scratch.style.top = "-1000px";
  document.body.append(scratch);
  scratch.select();
  const copied = document.execCommand("copy");
  scratch.remove();
  return copied;
}

export async function copyRichContent(payload: ClipboardPayload): Promise<ClipboardWriteMode | null> {
  const eventMode = copyViaClipboardEvent(payload);
  if (eventMode) return eventMode;

  if (payload.html && isTauriRuntime()) {
    await writeClipboardHtml(payload.html, payload.plainText);
    return "html";
  }

  if (!payload.html && payload.markdown && isTauriRuntime()) {
    await writeClipboardText(payload.markdown);
    return "plain";
  }

  if (payload.html && navigator.clipboard && typeof ClipboardItem !== "undefined") {
    const richMode = await writeBrowserClipboardItem(payload, true);
    if (richMode) return richMode;

    const htmlMode = await writeBrowserClipboardItem(payload, false);
    if (htmlMode) return htmlMode;
  }

  const copied = await copyText(payload.markdown ?? payload.plainText);
  return copied ? "plain" : null;
}

function setClipboardData(clipboardData: DataTransfer, payload: ClipboardPayload): ClipboardWriteMode {
  clipboardData.setData("text/plain", payload.plainText);

  let mode: ClipboardWriteMode = "plain";
  if (payload.html) {
    clipboardData.setData("text/html", payload.html);
    mode = "html";
  }

  if (payload.markdown) {
    clipboardData.setData("text/markdown", payload.markdown);
    mode = payload.html ? "rich" : "plain";
  }

  return mode;
}

export function writeClipboardEventData(event: ClipboardEvent, payload: ClipboardPayload): ClipboardWriteMode | null {
  if (!event.clipboardData) return null;

  return setClipboardData(event.clipboardData, payload);
}

function copyViaClipboardEvent(payload: ClipboardPayload): ClipboardWriteMode | null {
  let mode: ClipboardWriteMode | null = null;
  const scratch = document.createElement("textarea");
  const handler = (event: ClipboardEvent) => {
    mode = writeClipboardEventData(event, payload);
    if (mode) event.preventDefault();
  };

  scratch.value = payload.plainText;
  scratch.setAttribute("readonly", "");
  scratch.style.position = "fixed";
  scratch.style.top = "-1000px";
  scratch.style.opacity = "0";
  document.body.append(scratch);
  scratch.select();

  document.addEventListener("copy", handler);
  const copied = document.execCommand("copy");
  document.removeEventListener("copy", handler);
  scratch.remove();

  return copied ? mode : null;
}

async function writeBrowserClipboardItem(payload: ClipboardPayload, includeMarkdown: boolean): Promise<ClipboardWriteMode | null> {
  try {
    const items: Record<string, Blob> = {
      "text/plain": new Blob([payload.plainText], { type: "text/plain" })
    };

    if (payload.html) {
      items["text/html"] = new Blob([payload.html], { type: "text/html" });
    }

    if (includeMarkdown && payload.markdown) {
      items["text/markdown"] = new Blob([payload.markdown], { type: "text/markdown" });
    }

    await navigator.clipboard.write([new ClipboardItem(items)]);
    if (includeMarkdown && payload.markdown && payload.html) return "rich";
    if (payload.html) return "html";
    return "plain";
  } catch (error) {
    console.warn(error);
    return null;
  }
}
