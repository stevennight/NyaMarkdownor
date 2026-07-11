export function htmlTableToRows(html: string): string[][] | null {
  if (!/<table[\s>]/i.test(html)) return null;
  if (typeof DOMParser === "undefined") return fallbackHtmlTableToRows(html);

  const document = new DOMParser().parseFromString(html, "text/html");
  const table = document.querySelector("table");
  if (!table) return null;

  const rows: string[][] = [];
  const rowSpans = new Map<number, { remaining: number; value: string }>();

  for (const tableRow of Array.from(table.querySelectorAll("tr"))) {
    const row: string[] = [];
    let col = 0;

    for (const cell of directTableRowCells(tableRow)) {
      col = consumeRowSpans(row, rowSpans, col);

      const value = normalizeHtmlCellText(htmlElementTextWithBreaks(cell));
      const colspan = parseSpan(cell.getAttribute("colspan"));
      const rowspan = parseSpan(cell.getAttribute("rowspan"));

      for (let offset = 0; offset < colspan; offset += 1) {
        row[col + offset] = value;
        if (rowspan > 1) {
          rowSpans.set(col + offset, { remaining: rowspan - 1, value });
        }
      }

      col += colspan;
    }

    consumeRowSpans(row, rowSpans, col);
    if (row.some((cell) => cell.length > 0)) rows.push(row);
  }

  return rows.length ? trimTrailingEmptyColumns(rows) : null;
}

function fallbackHtmlTableToRows(html: string): string[][] | null {
  const tableHtml = html.match(/<table\b[\s\S]*?<\/table>/i)?.[0];
  if (!tableHtml) return null;

  const rows: string[][] = [];
  const rowSpans = new Map<number, { remaining: number; value: string }>();

  for (const rowMatch of tableHtml.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)) {
    const row: string[] = [];
    let col = 0;

    for (const cellMatch of rowMatch[0].matchAll(/<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
      col = consumeRowSpans(row, rowSpans, col);

      const colspan = parseSpan(htmlAttribute(cellMatch[0], "colspan"));
      const rowspan = parseSpan(htmlAttribute(cellMatch[0], "rowspan"));
      const value = normalizeHtmlCellText(decodeBasicHtmlEntities(stripHtmlTags(cellMatch[2])));

      for (let offset = 0; offset < colspan; offset += 1) {
        row[col + offset] = value;
        if (rowspan > 1) {
          rowSpans.set(col + offset, { remaining: rowspan - 1, value });
        }
      }

      col += colspan;
    }

    consumeRowSpans(row, rowSpans, col);
    if (row.some((cell) => cell.length > 0)) rows.push(row);
  }

  return rows.length ? trimTrailingEmptyColumns(rows) : null;
}

function directTableRowCells(tableRow: Element): Element[] {
  return Array.from(tableRow.querySelectorAll("th,td")).filter((cell) => cell.closest("tr") === tableRow);
}

function consumeRowSpans(row: string[], rowSpans: Map<number, { remaining: number; value: string }>, startCol: number): number {
  let col = startCol;

  while (rowSpans.has(col)) {
    const span = rowSpans.get(col)!;
    row[col] = span.value;
    if (span.remaining <= 1) rowSpans.delete(col);
    else rowSpans.set(col, { ...span, remaining: span.remaining - 1 });
    col += 1;
  }

  return col;
}

function parseSpan(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 1 ? Math.min(parsed, 100) : 1;
}

function normalizeHtmlCellText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripHtmlTags(html: string): string {
  const markdownLinks: string[] = [];
  const withMarkdownLinkPlaceholders = html
    .replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_match, attrs: string, content: string) => {
      const label = normalizeHtmlLinkLabel(decodeBasicHtmlEntities(stripHtmlTags(content)));
      const href = decodeBasicHtmlEntities(htmlAttribute(attrs, "href") ?? "");
      const placeholder = `\u0000NYA_HTML_LINK_${markdownLinks.length}\u0000`;
      markdownLinks.push(markdownLinkFromHtmlAnchor(label, href));
      return placeholder;
    });

  return restoreMarkdownLinkPlaceholders(withMarkdownLinkPlaceholders
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|section|article|header|footer|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, ""), markdownLinks);
}

function htmlElementTextWithBreaks(element: Element): string {
  const out: string[] = [];

  function visit(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      out.push(node.nodeValue ?? "");
      return;
    }

    if (!(node instanceof Element)) return;

    const tagName = node.tagName.toLowerCase();
    if (tagName === "br") {
      out.push("\n");
      return;
    }

    if (tagName === "a") {
      const label = normalizeHtmlLinkLabel(htmlElementPlainTextWithBreaks(node));
      out.push(markdownLinkFromHtmlAnchor(label, node.getAttribute("href") ?? ""));
      return;
    }

    node.childNodes.forEach(visit);
    if (isCellBlockBreakElement(tagName)) out.push("\n");
  }

  element.childNodes.forEach(visit);
  return out.join("");
}

function htmlElementPlainTextWithBreaks(element: Element): string {
  const out: string[] = [];

  function visit(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      out.push(node.nodeValue ?? "");
      return;
    }

    if (!(node instanceof Element)) return;

    const tagName = node.tagName.toLowerCase();
    if (tagName === "br") {
      out.push("\n");
      return;
    }

    node.childNodes.forEach(visit);
    if (isCellBlockBreakElement(tagName)) out.push("\n");
  }

  element.childNodes.forEach(visit);
  return out.join("");
}

function isCellBlockBreakElement(tagName: string): boolean {
  return tagName === "p"
    || tagName === "div"
    || tagName === "li"
    || tagName === "section"
    || tagName === "article"
    || tagName === "header"
    || tagName === "footer"
    || tagName === "blockquote";
}

function htmlAttribute(html: string, name: string): string | null {
  const match = html.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function markdownLinkFromHtmlAnchor(label: string, href: string): string {
  const cleanLabel = normalizeHtmlLinkLabel(label);
  const cleanHref = href.trim();
  if (!cleanLabel) return "";
  if (!isSafeHtmlLinkHref(cleanHref)) return cleanLabel;
  return `[${escapeMarkdownLinkLabel(cleanLabel)}](${formatMarkdownLinkDestination(cleanHref)})`;
}

function normalizeHtmlLinkLabel(label: string): string {
  return normalizeHtmlCellText(label).replace(/\n+/g, " ").trim();
}

function isSafeHtmlLinkHref(href: string): boolean {
  return Boolean(href) && !/^(?:javascript|vbscript|data):/i.test(href);
}

function escapeMarkdownLinkLabel(label: string): string {
  return label.replace(/([\\\]])/g, "\\$1");
}

function formatMarkdownLinkDestination(href: string): string {
  if (!/[()\s<>]/.test(href)) return href;
  return `<${href.replace(/>/g, "%3E")}>`;
}

function restoreMarkdownLinkPlaceholders(text: string, links: string[]): string {
  return text.replace(/\u0000NYA_HTML_LINK_(\d+)\u0000/g, (_match, index: string) => links[Number(index)] ?? "");
}

function decodeBasicHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_match, value: string) => codePointToString(Number.parseInt(value, 16)))
    .replace(/&#(\d+);/g, (_match, value: string) => codePointToString(Number.parseInt(value, 10)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/g, "'");
}

function codePointToString(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value > 0x10ffff) return "";
  try {
    return String.fromCodePoint(value);
  } catch {
    return "";
  }
}

function trimTrailingEmptyColumns(rows: string[][]): string[][] {
  const colCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  let lastNonEmpty = colCount - 1;

  while (lastNonEmpty >= 0 && rows.every((row) => !(row[lastNonEmpty] ?? "").trim())) {
    lastNonEmpty -= 1;
  }

  return rows.map((row) => row.slice(0, lastNonEmpty + 1));
}
