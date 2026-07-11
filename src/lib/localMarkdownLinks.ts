import { isRemoteOrSpecialImageSource, resolvePreviewImagePath } from "./previewAssets";
import { anchorIdCandidatesFromHref } from "./markdownAnchors";
import { isSupportedMarkdownFileName } from "./markdownFileTypes";

export type LocalMarkdownLinkTarget = {
  path: string;
  anchorIds: string[];
};

export function isLocalMarkdownLinkHref(href: string): boolean {
  const path = decodedHrefPath(href);
  if (!path || isRemoteOrSpecialImageSource(path)) return false;
  return isSupportedMarkdownFileName(path);
}

export function resolveLocalMarkdownLinkPath(href: string, documentFilePath: string | null): string | null {
  if (!isLocalMarkdownLinkHref(href)) return null;
  return resolvePreviewImagePath(href, documentFilePath)?.path ?? null;
}

export function resolveLocalMarkdownLinkTarget(href: string, documentFilePath: string | null): LocalMarkdownLinkTarget | null {
  const path = resolveLocalMarkdownLinkPath(href, documentFilePath);
  if (!path) return null;

  return {
    path,
    anchorIds: anchorIdCandidatesFromHref(href)
  };
}

function decodedHrefPath(href: string): string {
  const path = href.split(/[?#]/, 1)[0] ?? "";
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}
