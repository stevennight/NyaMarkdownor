import { isLocalMarkdownLinkHref } from "./localMarkdownLinks";
import { anchorIdCandidatesFromHref, anchorIdFromHref } from "./markdownAnchors";
import { normalizeExternalLinkHref } from "./externalLinks";

export type PreviewLinkKind = "empty" | "anchor" | "local-markdown" | "external" | "local-other" | "blocked-protocol";

export type PreviewLinkModifiers = {
  ctrlKey?: boolean;
  metaKey?: boolean;
};

export function classifyPreviewLinkHref(href: string): PreviewLinkKind {
  const trimmed = href.trim();
  if (!trimmed) return "empty";
  if (trimmed.startsWith("#")) return "anchor";
  if (isLocalMarkdownLinkHref(trimmed)) return "local-markdown";
  if (isOpenableExternalPreviewLink(trimmed)) return "external";
  if (hasProtocolOrProtocolRelativePrefix(trimmed)) return "blocked-protocol";
  return "local-other";
}

export function shouldOpenPreviewLinkWithModifier(modifiers: PreviewLinkModifiers): boolean {
  return Boolean(modifiers.ctrlKey || modifiers.metaKey);
}

export function previewAnchorIdFromHref(href: string): string | null {
  return href.startsWith("#") ? anchorIdFromHref(href) : null;
}

export function previewAnchorIdCandidatesFromHref(href: string): string[] {
  return href.startsWith("#") ? anchorIdCandidatesFromHref(href) : [];
}

function isOpenableExternalPreviewLink(href: string): boolean {
  return normalizeExternalLinkHref(href) !== null;
}

function hasProtocolOrProtocolRelativePrefix(href: string): boolean {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return true;
  return href.startsWith("//");
}
