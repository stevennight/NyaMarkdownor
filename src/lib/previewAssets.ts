import { convertFileSrc } from "@tauri-apps/api/core";
import { isTauriRuntime } from "./fileIo";

export type PreviewFileSrcConverter = (filePath: string) => string;

type SplitImageSource = {
  path: string;
  suffix: string;
};

export function rewritePreviewImageSources(
  html: string,
  documentFilePath: string | null,
  converter?: PreviewFileSrcConverter
): string {
  if (!html || !documentFilePath) return html;
  if (!/<img\b/i.test(html)) return html;

  const fileSrcConverter = converter ?? (isTauriRuntime() ? convertFileSrc : null);
  if (!fileSrcConverter || typeof DOMParser === "undefined") return html;

  const parser = new DOMParser();
  const document = parser.parseFromString(`<div>${html}</div>`, "text/html");
  const wrapper = document.body.firstElementChild;
  if (!wrapper) return html;

  wrapper.querySelectorAll("img[src]").forEach((image) => {
    const src = image.getAttribute("src") ?? "";
    const resolved = resolvePreviewImagePath(src, documentFilePath);
    if (!resolved) return;

    image.setAttribute("src", `${fileSrcConverter(resolved.path)}${resolved.suffix}`);
    image.setAttribute("data-local-src", resolved.path);
  });

  return wrapper.innerHTML;
}

export function localImageSourceForRender(
  src: string,
  documentFilePath: string | null,
  converter?: PreviewFileSrcConverter
): string {
  const resolved = resolvePreviewImagePath(src, documentFilePath);
  if (!resolved) return src;

  const fileSrcConverter = converter ?? (isTauriRuntime() ? convertFileSrc : null);
  return fileSrcConverter ? `${fileSrcConverter(resolved.path)}${resolved.suffix}` : src;
}

export function resolvePreviewImagePath(src: string, documentFilePath: string | null): SplitImageSource | null {
  const split = splitImageSource(src);
  const fileUrlPath = fileUrlToLocalPath(split.path);
  if (fileUrlPath) {
    return { path: normalizeAbsoluteLocalPath(fileUrlPath), suffix: split.suffix };
  }

  const path = decodeImagePath(split.path);
  if (!path || isRemoteOrSpecialImageSource(path)) return null;

  if (isAbsoluteLocalPath(path)) {
    return { path: normalizeAbsoluteLocalPath(path), suffix: split.suffix };
  }

  if (!documentFilePath || isRootRelativePath(path)) return null;

  return {
    path: joinLocalPath(dirname(documentFilePath), path),
    suffix: split.suffix
  };
}

export function isRemoteOrSpecialImageSource(src: string): boolean {
  if (isWindowsDrivePath(src)) return false;
  if (fileUrlToLocalPath(src)) return false;
  return /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith("//");
}

function splitImageSource(src: string): SplitImageSource {
  const index = src.search(/[?#]/);
  if (index < 0) return { path: src, suffix: "" };
  return {
    path: src.slice(0, index),
    suffix: src.slice(index)
  };
}

function decodeImagePath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function fileUrlToLocalPath(value: string): string | null {
  if (!/^file:/i.test(value)) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "file:") return null;

    const path = decodeImagePath(url.pathname);
    if (url.hostname) return `\\\\${url.hostname}${path.replace(/\//g, "\\")}`;
    if (/^\/[a-zA-Z]:[\\/]/.test(path)) return path.slice(1).replace(/\//g, "\\");
    return path || null;
  } catch {
    return null;
  }
}

function isAbsoluteLocalPath(path: string): boolean {
  return isWindowsDrivePath(path) || path.startsWith("\\\\") || (path.startsWith("/") && !path.startsWith("//"));
}

function isWindowsDrivePath(path: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(path);
}

function isRootRelativePath(path: string): boolean {
  return path.startsWith("/") || path.startsWith("\\");
}

function normalizeAbsoluteLocalPath(path: string): string {
  if (isWindowsDrivePath(path) || path.startsWith("\\\\")) {
    return path.replace(/\//g, "\\");
  }
  return path.replace(/\\/g, "/");
}

function dirname(filePath: string): string {
  const slashIndex = filePath.lastIndexOf("/");
  const backslashIndex = filePath.lastIndexOf("\\");
  const index = Math.max(slashIndex, backslashIndex);
  return index >= 0 ? filePath.slice(0, index) : "";
}

function joinLocalPath(baseDir: string, relativePath: string): string {
  const separator = baseDir.includes("\\") ? "\\" : "/";
  const normalizedBase = baseDir.replace(/[\\/]+$/g, "");
  const normalizedRelative = relativePath.replace(/\\/g, "/");
  const raw = normalizedBase ? `${normalizedBase}${separator}${normalizedRelative}` : normalizedRelative;
  const prefix = localPathPrefix(raw);
  const body = raw.slice(prefix.length);
  const parts: string[] = [];

  for (const part of body.split(/[\\/]+/)) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length > 0) parts.pop();
      continue;
    }
    parts.push(part);
  }

  if (prefix.endsWith(":")) {
    return `${prefix}${separator}${parts.join(separator)}`;
  }
  return `${prefix}${parts.join(separator)}`;
}

function localPathPrefix(path: string): string {
  if (/^[a-zA-Z]:/.test(path)) return path.slice(0, 2);
  if (path.startsWith("\\\\")) return "\\\\";
  if (path.startsWith("/")) return "/";
  return "";
}
