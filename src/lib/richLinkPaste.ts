import { decodeHTMLStrict } from "entities";

export type RichLinkClipboardData = {
  html?: string | null;
  text?: string | null;
};

export type BrowserTitleLink = {
  href: string;
  text: string;
};

export function browserTitleLinkFromClipboard(data: RichLinkClipboardData): BrowserTitleLink | null {
  const plainUrl = data.text?.trim() ?? "";
  const html = data.html?.trim() ?? "";
  if (!plainUrl || !html || !isWebUrl(plainUrl)) return null;

  const link = singleHtmlLink(html);
  if (!link || !sameWebUrl(plainUrl, link.href) || !link.text) return null;
  return {
    href: titleLinkHref(link.text, link.href),
    text: link.text
  };
}

function singleHtmlLink(html: string): BrowserTitleLink | null {
  if (typeof DOMParser !== "undefined") {
    const document = new DOMParser().parseFromString(html, "text/html");
    const links = Array.from(document.body.querySelectorAll("a[href]"));
    if (links.length !== 1) return null;

    const link = links[0];
    if (document.body.textContent?.trim() !== link.textContent?.trim()) return null;
    return {
      href: link.getAttribute("href")?.trim() ?? "",
      text: link.textContent?.trim() ?? ""
    };
  }

  const links = [...html.matchAll(/<a\b[^>]*\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a\s*>/gi)];
  if (links.length !== 1) return null;

  const outsideLink = html
    .replace(links[0][0], "")
    .replace(/<!--([\s\S]*?)-->/g, "")
    .replace(/<\/?(?:html|head|body|meta)\b[^>]*>/gi, "")
    .trim();
  if (outsideLink) return null;
  return {
    href: decodeHTMLStrict(links[0][2] ?? links[0][3] ?? links[0][4] ?? "").trim(),
    text: decodeHTMLStrict(links[0][5].replace(/<[^>]*>/g, "")).trim()
  };
}

function titleLinkHref(title: string, href: string): string {
  const url = new URL(href);
  const hostname = escapeRegExp(url.hostname);
  const hostnamePattern = new RegExp(`(^|[^a-z0-9.-])${hostname}(?=$|[^a-z0-9.-])`, "i");
  return hostnamePattern.test(title) ? url.origin : href.trim();
}

function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function sameWebUrl(left: string, right: string): boolean {
  try {
    const leftUrl = new URL(left);
    const rightUrl = new URL(right);
    return leftUrl.href === rightUrl.href
      && (rightUrl.protocol === "http:" || rightUrl.protocol === "https:");
  } catch {
    return false;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
