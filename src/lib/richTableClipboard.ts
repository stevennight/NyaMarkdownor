export type RichTableClipboardFormats = {
  csv: string;
  html: string;
  markdown: string;
  plainText: string;
  tsv: string;
};

export function richTableClipboardFormats(rows: readonly (readonly string[])[]): RichTableClipboardFormats | null {
  if (!rows.length || !rows[0].length) return null;

  const normalizedRows = rows.map((row) => [...row]);
  const columnCount = normalizedRows[0].length;
  if (normalizedRows.some((row) => row.length !== columnCount)) return null;

  const csv = normalizedRows.map((row) => row.map(csvCell).join(",")).join("\n");
  const html = tableHtml(normalizedRows);
  const tsv = normalizedRows.map((row) => row.map(tsvCell).join("\t")).join("\n");
  const markdownRows = normalizedRows.map((row) => `| ${row.map(markdownCell).join(" | ")} |`);
  const markdown = [
    markdownRows[0],
    `| ${normalizedRows[0].map(() => "---").join(" | ")} |`,
    ...markdownRows.slice(1)
  ].join("\n");

  return { csv, html, markdown, plainText: tsv, tsv };
}

function tableHtml(rows: readonly (readonly string[])[]): string {
  const [header = [], ...body] = rows;
  const headerHtml = header.map((cell) => `<th>${htmlCell(cell)}</th>`).join("");
  const bodyHtml = body.map((row) => `<tr>${row.map((cell) => `<td>${htmlCell(cell)}</td>`).join("")}</tr>`).join("");
  return `<table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
}

function htmlCell(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\r?\n/g, "<br>");
}

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll("\"", "\"\"")}"` : value;
}

function tsvCell(value: string): string {
  return value.replace(/[\t\r\n]+/g, " ");
}

function markdownCell(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/[\r\n]+/g, "<br>");
}
