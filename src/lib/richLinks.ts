const SAFE_PROTOCOL = /^(https?:|mailto:)/i;
const OTHER_PROTOCOL = /^[a-z][a-z0-9+.-]*:/i;

export function normalizeRichLinkHref(value: string): string | null {
  const href = value.trim();
  if (!href || /[\u0000-\u001F\u007F]/.test(href)) return null;
  if (href.startsWith("#") || SAFE_PROTOCOL.test(href)) return href;
  if (href.startsWith("//") || OTHER_PROTOCOL.test(href)) return null;
  return href;
}

export function shouldOpenRichLinkOnClick(event: {
  button?: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
  defaultPrevented?: boolean;
}): boolean {
  return !event.defaultPrevented
    && (event.button === undefined || event.button === 0)
    && Boolean(event.ctrlKey || event.metaKey);
}

export function richLinkClickSelectionRange(
  linkStart: number,
  linkEnd: number,
  clickedPosition: number
): { from: number; to: number } | null {
  const from = Math.min(linkStart, linkEnd);
  const to = Math.max(linkStart, linkEnd);
  if (from === to) return null;
  if (to - from === 1) return { from, to };

  const cursor = Math.max(from + 1, Math.min(clickedPosition, to - 1));
  return { from: cursor, to: cursor };
}
