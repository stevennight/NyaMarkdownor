import { cssLanguage } from "@codemirror/lang-css";
import { htmlLanguage } from "@codemirror/lang-html";
import { javascriptLanguage, jsxLanguage, tsxLanguage, typescriptLanguage } from "@codemirror/lang-javascript";
import type { Language } from "@codemirror/language";
import { classHighlighter, highlightCode } from "@lezer/highlight";

const CODE_HIGHLIGHT_MAX_LENGTH = 200_000;

export function highlightCodeHtml(code: string, language: string | null | undefined): string {
  const normalizedLanguage = normalizeCodeLanguage(language);
  const parser = codeLanguageFor(normalizedLanguage);
  if (!parser || !code || code.length > CODE_HIGHLIGHT_MAX_LENGTH) return escapeHtml(code);

  let html = "";
  highlightCode(code, parser.parser.parse(code), classHighlighter, (text, classes) => {
    html += classes ? `<span class="${classes}">${escapeHtml(text)}</span>` : escapeHtml(text);
  }, () => {
    html += "\n";
  });
  return html;
}

export function codeHighlightClasses(code: string, language: string | null | undefined): Array<{ from: number; to: number; className: string }> {
  const normalizedLanguage = normalizeCodeLanguage(language);
  const parser = codeLanguageFor(normalizedLanguage);
  if (!parser || !code || code.length > CODE_HIGHLIGHT_MAX_LENGTH) return [];

  const ranges: Array<{ from: number; to: number; className: string }> = [];
  let offset = 0;
  highlightCode(code, parser.parser.parse(code), classHighlighter, (text, classes) => {
    if (classes) ranges.push({ from: offset, to: offset + text.length, className: classes });
    offset += text.length;
  }, () => {
    offset += 1;
  });
  return ranges;
}

export function normalizeCodeLanguage(language: string | null | undefined): string {
  return (language ?? "")
    .trim()
    .toLowerCase()
    .replace(/^language-/, "")
    .replace(/^lang-/, "");
}

function codeLanguageFor(language: string): Language | null {
  switch (language) {
    case "js":
    case "javascript":
    case "mjs":
    case "cjs":
    case "node":
    case "nodejs":
    case "json":
    case "jsonc":
    case "json5":
    case "geojson":
      return javascriptLanguage;
    case "ts":
    case "typescript":
      return typescriptLanguage;
    case "jsx":
    case "react":
      return jsxLanguage;
    case "tsx":
      return tsxLanguage;
    case "html":
    case "xml":
    case "svg":
    case "vue":
      return htmlLanguage;
    case "css":
    case "scss":
    case "sass":
    case "less":
      return cssLanguage;
    default:
      return null;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
