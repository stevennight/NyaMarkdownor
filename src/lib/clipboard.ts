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

const HTML_BLOCK_TAGS = new Set([
  "address", "article", "aside", "blockquote", "body", "caption", "center", "colgroup", "dd", "details", "dialog", "dir", "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "head", "header", "html", "iframe", "legend", "li", "main", "menu", "menuitem", "nav", "ol", "p", "pre", "script", "section", "summary", "table", "tbody", "td", "tfoot", "th", "thead", "title", "tr", "track", "ul", "style", "textarea"
]);

const HTML_VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"
]);

export function trimClipboardBoundaryLineBreaks(text: string): string {
  const normalized = normalizeMarkdownLineEndings(text).replace(/^\n+|\n+$/g, "");
  return normalizeClipboardMarkdownSpacing(normalized);
}

function normalizeClipboardMarkdownSpacing(text: string): string {
  if (!text) return text;

  const lines = text.split("\n");
  const output: string[] = [];
  let fence: { char: "`" | "~"; length: number } | null = null;
  let htmlBlock: { tag?: string; comment: boolean } | null = null;

  for (const line of lines) {
    if (fence) {
      output.push(line);
      const closing = line.match(new RegExp(`^ {0,3}(${fence.char}{${fence.length},})[ \\t]*$`));
      if (closing) fence = null;
      continue;
    }

    if (htmlBlock) {
      output.push(line);
      if (htmlBlock.comment ? line.includes("-->") : htmlBlock.tag && new RegExp(`</${htmlBlock.tag}\\s*>`, "i").test(line)) {
        htmlBlock = null;
      }
      continue;
    }

    const openingFence = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (openingFence) {
      output.push(line);
      fence = { char: openingFence[1][0] as "`" | "~", length: openingFence[1].length };
      continue;
    }

    const openingComment = /^ {0,3}<!--/.test(line) && !line.includes("-->");
    const openingHtml = line.match(/^ {0,3}<([A-Za-z][A-Za-z0-9-]*)\b[^>]*>/);
    const htmlTag = openingHtml?.[1].toLowerCase();
    const htmlIsBlock = Boolean(htmlTag && HTML_BLOCK_TAGS.has(htmlTag));
    const htmlIsSelfClosing = Boolean(htmlTag && (HTML_VOID_TAGS.has(htmlTag) || /\/\\s*>$/.test(line)));
    const htmlHasInlineClose = Boolean(htmlTag && new RegExp(`</${htmlTag}\\s*>`, "i").test(line));
    if (openingComment || (openingHtml && htmlIsBlock && !htmlIsSelfClosing && !htmlHasInlineClose)) {
      htmlBlock = openingComment ? { comment: true } : { tag: openingHtml?.[1], comment: false };
      output.push(line);
      continue;
    }

    if (/^[ \\t]*$/.test(line)) {
      if (output.at(-1) !== "") output.push("");
      continue;
    }

    output.push(line);
  }

  return output.join("\n");
}

export function clipboardPayloadForCopyMode(payload: ClipboardPayload, copyMode: CopyMode): ClipboardPayload {
  const normalizedMarkdown = payload.markdown === undefined
    ? undefined
    : trimClipboardBoundaryLineBreaks(payload.markdown);
  const normalizedPayload = normalizedMarkdown === payload.markdown
    ? payload
    : { ...payload, markdown: normalizedMarkdown };

  if (copyMode === "smart") return normalizedPayload;
  if (copyMode === "plain") return { plainText: payload.plainText };

  const markdown = normalizedPayload.markdown ?? payload.plainText;
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
  const normalizedPayload = normalizeClipboardPayload(payload);
  const eventMode = copyViaClipboardEvent(normalizedPayload);
  if (eventMode) return eventMode;

  if (normalizedPayload.html && isTauriRuntime()) {
    await writeClipboardHtml(normalizedPayload.html, normalizedPayload.plainText);
    return "html";
  }

  if (!normalizedPayload.html && normalizedPayload.markdown && isTauriRuntime()) {
    await writeClipboardText(normalizedPayload.markdown);
    return "plain";
  }

  if (normalizedPayload.html && navigator.clipboard && typeof ClipboardItem !== "undefined") {
    const richMode = await writeBrowserClipboardItem(normalizedPayload, true);
    if (richMode) return richMode;

    const htmlMode = await writeBrowserClipboardItem(normalizedPayload, false);
    if (htmlMode) return htmlMode;
  }

  const copied = await copyText(normalizedPayload.markdown ?? normalizedPayload.plainText);
  return copied ? "plain" : null;
}

function normalizeClipboardPayload(payload: ClipboardPayload): ClipboardPayload {
  if (payload.markdown === undefined) return payload;

  const markdown = trimClipboardBoundaryLineBreaks(payload.markdown);
  if (markdown === payload.markdown) return payload;

  return {
    ...payload,
    plainText: payload.plainText === payload.markdown ? markdown : payload.plainText,
    markdown
  };
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
