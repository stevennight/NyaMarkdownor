import { slugifyHeadingText } from "./headingIds";

export function anchorIdFromHref(href: string): string | null {
  return anchorIdCandidatesFromHref(href)[0] ?? null;
}

export function anchorIdCandidatesFromHref(href: string): string[] {
  const fragment = hrefFragment(href);
  if (!fragment) return [];

  let decoded: string;
  try {
    decoded = decodeURIComponent(fragment);
  } catch {
    decoded = fragment;
  }

  const slug = slugifyHeadingText(decoded);
  return decoded === slug ? [decoded] : [decoded, slug];
}

function hrefFragment(href: string): string | null {
  const hashIndex = href.indexOf("#");
  if (hashIndex < 0 || hashIndex === href.length - 1) return null;
  return href.slice(hashIndex + 1);
}
