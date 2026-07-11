import type { ClipboardPayload } from "./clipboard";

export function previewSelectionToClipboardPayload(root: HTMLElement, selection: Selection | null): ClipboardPayload | null {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

  const fragment = document.createDocumentFragment();
  let copiedAnyRange = false;

  for (let index = 0; index < selection.rangeCount; index += 1) {
    const clippedRange = clipRangeToRoot(selection.getRangeAt(index), root);
    if (!clippedRange || clippedRange.collapsed) continue;

    if (copiedAnyRange) fragment.append(document.createElement("br"));
    fragment.append(clippedRange.cloneContents());
    copiedAnyRange = true;
  }

  if (!copiedAnyRange) return null;

  const html = previewFragmentToClipboardHtml(fragment.cloneNode(true) as DocumentFragment);
  const plainText = normalizePreviewClipboardPlainText(previewFragmentToPlainText(fragment));

  if (!plainText && !html) return null;

  return {
    plainText,
    html
  };
}

export function normalizePreviewClipboardPlainText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+|\n+$/g, "");
}

export function cleanPreviewClipboardHtml(html: string): string {
  return html
    .replace(TASK_CHECKBOX_INPUT_PATTERN, "")
    .replace(/\sdata-task-line=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\sdata-task-checked=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}

function clipRangeToRoot(range: Range, root: HTMLElement): Range | null {
  if (!rangeIntersectsRoot(range, root)) return null;

  const clippedRange = range.cloneRange();
  const rootRange = document.createRange();
  rootRange.selectNodeContents(root);

  if (clippedRange.compareBoundaryPoints(Range.START_TO_START, rootRange) < 0) {
    clippedRange.setStart(rootRange.startContainer, rootRange.startOffset);
  }

  if (clippedRange.compareBoundaryPoints(Range.END_TO_END, rootRange) > 0) {
    clippedRange.setEnd(rootRange.endContainer, rootRange.endOffset);
  }

  rootRange.detach();
  return clippedRange;
}

function rangeIntersectsRoot(range: Range, root: HTMLElement): boolean {
  try {
    return range.intersectsNode(root);
  } catch {
    return root.contains(range.commonAncestorContainer);
  }
}

function previewFragmentToClipboardHtml(fragment: DocumentFragment): string {
  stripPreviewOnlyControls(fragment);

  const container = document.createElement("div");
  container.append(fragment);
  return cleanPreviewClipboardHtml(container.innerHTML.trim());
}

function stripPreviewOnlyControls(fragment: DocumentFragment): void {
  fragment.querySelectorAll("input.task-list-checkbox").forEach((input) => input.remove());
}

function previewFragmentToPlainText(fragment: DocumentFragment): string {
  return Array.from(fragment.childNodes).map((node) => nodeToPlainText(node)).join("");
}

function nodeToPlainText(node: Node): string {
  if (node.nodeType === 3) return node.nodeValue ?? "";
  if (!(node instanceof HTMLElement)) return Array.from(node.childNodes).map((child) => nodeToPlainText(child)).join("");

  const tagName = node.tagName.toLowerCase();

  if (tagName === "br") return "\n";
  if (tagName === "img") return node.getAttribute("alt") ?? "";
  if (tagName === "input" && node.classList.contains("task-list-checkbox")) return "";
  if (tagName === "table") return tableToPlainText(node);
  if (tagName === "thead" || tagName === "tbody" || tagName === "tfoot") return tableSectionToPlainText(node);
  if (tagName === "tr") return `${tableRowToPlainText(node)}\n`;
  if (tagName === "pre") return `${node.textContent ?? ""}\n`;

  const childText = Array.from(node.childNodes).map((child) => nodeToPlainText(child)).join("");
  if (tagName === "li") return `${childText}\n`;
  if (tagName === "ol" || tagName === "ul") return `${childText}\n`;
  if (isBlockPlainTextElement(tagName)) return `${childText}\n\n`;
  return childText;
}

function tableToPlainText(table: HTMLElement): string {
  return Array.from(table.querySelectorAll("tr"))
    .map((row) => tableRowToPlainText(row))
    .filter(Boolean)
    .join("\n") + "\n\n";
}

function tableSectionToPlainText(section: HTMLElement): string {
  return Array.from(section.querySelectorAll("tr"))
    .map((row) => tableRowToPlainText(row))
    .filter(Boolean)
    .join("\n") + "\n";
}

function tableRowToPlainText(row: Element): string {
  const cells = Array.from(row.children).filter((child) => {
    const tagName = child.tagName.toLowerCase();
    return tagName === "td" || tagName === "th";
  });

  if (!cells.length) return "";

  return cells.map((cell) => {
    const text = Array.from(cell.childNodes).map((child) => nodeToPlainText(child)).join("");
    return normalizePreviewClipboardPlainText(text).replace(/\n+/g, " ");
  }).join("\t");
}

function isBlockPlainTextElement(tagName: string): boolean {
  return BLOCK_PLAIN_TEXT_ELEMENTS.has(tagName);
}

const BLOCK_PLAIN_TEXT_ELEMENTS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "dd",
  "div",
  "dl",
  "dt",
  "figcaption",
  "figure",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "main",
  "nav",
  "p",
  "section"
]);

const TASK_CHECKBOX_INPUT_PATTERN = /<input\b(?=[^>]*\bclass=(?:"[^"]*\btask-list-checkbox\b[^"]*"|'[^']*\btask-list-checkbox\b[^']*'|[^\s>]*\btask-list-checkbox\b[^\s>]*))[^>]*>/gi;
