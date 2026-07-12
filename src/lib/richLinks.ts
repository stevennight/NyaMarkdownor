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
