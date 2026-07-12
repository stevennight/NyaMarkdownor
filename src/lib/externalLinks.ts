import { openUrl } from "@tauri-apps/plugin-opener";
import { isTauriRuntime } from "./fileIo";

const OPENABLE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

export type ExternalLinkOpenResult = "opened" | "blocked" | "unsupported";

type ExternalLinkOpenDependencies = {
  desktopRuntime?: boolean;
  openDesktopUrl?: (href: string) => Promise<void>;
  openBrowserWindow?: (href: string) => unknown | null;
};

export function normalizeExternalLinkHref(value: string): string | null {
  const href = value.trim();
  if (!href || /[\u0000-\u001F\u007F]/.test(href)) return null;

  const candidate = href.startsWith("//") ? `https:${href}` : href;
  try {
    const url = new URL(candidate);
    if (!OPENABLE_PROTOCOLS.has(url.protocol.toLowerCase())) return null;
    if ((url.protocol === "http:" || url.protocol === "https:") && !url.hostname) return null;
    if (url.protocol === "mailto:" && !url.pathname) return null;
    return url.href;
  } catch {
    return null;
  }
}

export async function openExternalLink(
  href: string,
  dependencies: ExternalLinkOpenDependencies = {}
): Promise<ExternalLinkOpenResult> {
  const normalizedHref = normalizeExternalLinkHref(href);
  if (!normalizedHref) return "unsupported";

  const desktopRuntime = dependencies.desktopRuntime ?? isTauriRuntime();
  if (desktopRuntime) {
    await (dependencies.openDesktopUrl ?? openUrl)(normalizedHref);
    return "opened";
  }

  const openBrowserWindow = dependencies.openBrowserWindow ?? ((url: string) => {
    if (typeof window === "undefined") return null;
    return window.open(url, "_blank", "noopener,noreferrer");
  });

  return openBrowserWindow(normalizedHref) ? "opened" : "blocked";
}
