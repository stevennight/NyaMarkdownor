import { htmlTableToRows } from "./htmlTables";
import {
  isLikelyCsvTableText,
  markdownTableTextToMarkdownTable,
  markdownTableTextToRows,
  parseCsvRows,
  parseTsvRows,
  rowsToMarkdownTable,
  markdownTextContainsOnlyTable
} from "./tables";
import { stripInlineMarkdown } from "./text";

export type ClipboardTableSource = "html" | "markdown" | "tsv" | "csv" | "space" | "lines";

export type ClipboardTableRows = {
  source: ClipboardTableSource;
  rows: string[][];
  markdownTable: string | null;
};

export function clipboardTableRowsFromData(data: { text?: string | null; html?: string | null; markdown?: string | null }): ClipboardTableRows | null {
  const text = data.text ?? "";
  const html = data.html ?? "";
  const markdown = data.markdown ?? "";

  if (/<table[\s>]/i.test(html)) {
    const htmlRows = htmlTableToRows(html);
    if (!htmlRows) return null;
    return {
      source: "html",
      rows: htmlRows,
      markdownTable: rowsToMarkdownTable(htmlRows)
    };
  }

  const markdownRows = markdownTableTextToRows(markdown);
  if (markdownRows) {
    if (!markdownTextContainsOnlyTable(markdown)) return null;
    return {
      source: "markdown",
      rows: markdownRows,
      markdownTable: markdownTableTextToMarkdownTable(markdown)
    };
  }

  const textMarkdownRows = markdownTableTextToRows(text);
  if (textMarkdownRows) {
    if (!markdownTextContainsOnlyTable(text)) return null;
    return {
      source: "markdown",
      rows: textMarkdownRows,
      markdownTable: markdownTableTextToMarkdownTable(text)
    };
  }

  if (text.includes("\t")) {
    const rows = parseTsvRows(text);
    if (isRectangularGrid(rows)) {
      return {
        source: "tsv",
        rows,
        markdownTable: rowsToMarkdownTable(rows)
      };
    }
  }

  // Browser table selections can arrive with ASCII Unit Separator between cells.
  // Treat it as TSV rather than allowing an invisible control character into Markdown.
  if (text.includes("\u001f")) {
    const rows = parseTsvRows(text.replaceAll("\u001f", "\t"));
    if (isRectangularGrid(rows)) {
      return {
        source: "tsv",
        rows,
        markdownTable: rowsToMarkdownTable(rows)
      };
    }
  }

  if (text.includes(",")) {
    const rows = parseCsvRows(text);
    if (isLikelyCsvTableText(text, rows)) {
      return {
        source: "csv",
        rows,
        markdownTable: rowsToMarkdownTable(rows)
      };
    }
  }

  const spaceRows = clipboardSpaceAlignedRowsFromText(text);
  if (spaceRows) {
    return {
      source: "space",
      rows: spaceRows,
      markdownTable: rowsToMarkdownTable(spaceRows)
    };
  }

  return null;
}

export function clipboardRowsForTablePaste(data: { text?: string | null; html?: string | null; markdown?: string | null }): ClipboardTableRows | null {
  const tableRows = clipboardTableRowsFromData(data);
  if (tableRows) return tableRows;
  if (clipboardContainsEmbeddedTable(data)) return null;

  const rows = clipboardPlainLineRowsFromText(data.text ?? "");
  return rows ? { source: "lines", rows, markdownTable: null } : null;
}

function clipboardContainsEmbeddedTable(data: { text?: string | null; html?: string | null; markdown?: string | null }): boolean {
  return /<table[\s>]/i.test(data.html ?? "")
    || Boolean(markdownTableTextToRows(data.markdown ?? ""))
    || Boolean(markdownTableTextToRows(data.text ?? ""));
}

function isRectangularGrid(rows: readonly (readonly string[])[]): boolean {
  const width = rows[0]?.length ?? 0;
  return width > 1 && rows.length > 0 && rows.every((row) => row.length === width);
}

export function clipboardPlainLineRowsFromText(text: string): string[][] | null {
  if (!text.replace(/\r\n?/g, "\n").includes("\n") || text.includes("\t")) return null;

  const rows = parseTsvRows(text);
  if (rows.length < 2 || rows.some((row) => row.length !== 1)) return null;
  return rows.map((row) => [cleanPlainLineTableCell(row[0] ?? "")]);
}

export function clipboardSpaceAlignedRowsFromText(text: string): string[][] | null {
  if (text.includes("\t") || !text.replace(/\r\n?/g, "\n").includes("\n")) return null;

  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;

  const rows = lines.map((line) => line.split(/ {2,}/).map((cell) => cell.trim()));
  const width = rows[0]?.length ?? 0;
  if (width < 2) return null;
  if (rows.some((row) => row.length !== width || row.some((cell) => !cell))) return null;
  if (!rows.every((row, index) => lineHasSpaceColumnSeparators(lines[index], row.length))) return null;

  return rows;
}

function cleanPlainLineTableCell(value: string): string {
  const withoutBlockMarker = value
    .trim()
    .replace(/^ {0,3}(?:>\s?)+/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d{1,3}[.)]\s+/, "")
    .replace(/^\[[ xX]\]\s+/, "");

  return stripInlineMarkdown(withoutBlockMarker).trim();
}

function lineHasSpaceColumnSeparators(line: string, columnCount: number): boolean {
  return (line.match(/ {2,}/g)?.length ?? 0) === columnCount - 1;
}
