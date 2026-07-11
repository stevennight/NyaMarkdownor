import { renderMarkdownHtml } from "./markdown";

export type HtmlExportOptions = {
  title: string;
};

export function createExportHtmlDocument(markdown: string, options: HtmlExportOptions): string {
  const title = escapeHtml(options.title.trim() || "Untitled");
  const body = renderMarkdownHtml(markdown);

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    `  <title>${title}</title>`,
    "  <style>",
    exportStyles(),
    "  </style>",
    "</head>",
    "<body>",
    '  <main class="markdown-body">',
    body.trim(),
    "  </main>",
    "</body>",
    "</html>"
  ].join("\n");
}

function exportStyles(): string {
  return `
    :root {
      color-scheme: light dark;
      --bg: #f7f8f7;
      --paper: #ffffff;
      --text: #1b1f24;
      --muted: #626d75;
      --line: rgba(32, 42, 52, 0.16);
      --accent: #2f7f6f;
      --code-bg: rgba(47, 127, 111, 0.08);
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #151917;
        --paper: #1c211f;
        --text: #e8ecea;
        --muted: #a2aaa7;
        --line: rgba(232, 236, 234, 0.14);
        --accent: #66b8a5;
        --code-bg: rgba(102, 184, 165, 0.12);
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.72;
    }
    .markdown-body {
      width: min(920px, calc(100vw - 40px));
      margin: 0 auto;
      min-height: 100vh;
      background: var(--paper);
      padding: 56px clamp(24px, 6vw, 72px) 84px;
      box-shadow: 0 22px 80px rgba(0, 0, 0, 0.08);
    }
    h1, h2, h3, h4 { line-height: 1.25; margin: 1.35em 0 0.55em; }
    h1 { font-size: 2.1rem; }
    h2 { font-size: 1.55rem; border-bottom: 1px solid var(--line); padding-bottom: 0.25em; }
    h3 { font-size: 1.2rem; }
    p, ul, ol, blockquote, table, pre { margin: 0.85em 0; }
    a { color: var(--accent); }
    blockquote {
      border-left: 3px solid var(--accent);
      color: var(--muted);
      padding-left: 1em;
    }
    code, pre {
      font-family: "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
      font-size: 0.92em;
    }
    code {
      border-radius: 5px;
      background: var(--code-bg);
      padding: 0.14em 0.34em;
    }
    pre {
      overflow: auto;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--code-bg);
      padding: 14px 16px;
    }
    pre code { background: transparent; padding: 0; }
    table {
      width: 100%;
      border-collapse: collapse;
      display: block;
      overflow-x: auto;
    }
    th, td {
      border: 1px solid var(--line);
      padding: 8px 10px;
      vertical-align: top;
    }
    th {
      background: var(--code-bg);
      font-weight: 700;
    }
    img { max-width: 100%; height: auto; }
    .task-list-checkbox { margin-right: 0.5em; }
    @media print {
      body { background: #ffffff; }
      .markdown-body { width: auto; min-height: 0; box-shadow: none; padding: 0; }
    }
  `.trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
