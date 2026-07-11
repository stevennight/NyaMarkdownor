import { applyTextChange, type TextEdit, type TextRange } from "./editorCommands";

export const SUPPORTED_IMAGE_DROP_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"] as const;

const IMAGE_DROP_EXTENSION = new RegExp(`\\.(${SUPPORTED_IMAGE_DROP_EXTENSIONS.join("|")})$`, "i");

type ParsedLocalPath = {
  root: string;
  rootKey: string;
  segments: string[];
  caseInsensitive: boolean;
};

export type DroppedImageMarkdown = {
  markdown: string;
  insertedCount: number;
  skippedCount: number;
};

export function isSupportedImageDropName(name: string): boolean {
  return IMAGE_DROP_EXTENSION.test(name.trim());
}

export function relativeMarkdownImagePath(imagePath: string, documentFilePath: string | null): string | null {
  if (!documentFilePath) return null;

  const image = parseAbsoluteLocalPath(imagePath);
  const document = parseAbsoluteLocalPath(documentFilePath);
  if (!image || !document || image.rootKey !== document.rootKey) return null;

  const documentDir = document.segments.slice(0, -1);
  const commonLength = commonPathPrefixLength(documentDir, image.segments, image.caseInsensitive || document.caseInsensitive);
  const up = Array.from({ length: documentDir.length - commonLength }, () => "..");
  const down = image.segments.slice(commonLength);
  if (down.length === 0) return null;

  return encodeMarkdownRelativePath([...up, ...down].join("/"));
}

export function markdownImageForPath(imagePath: string, documentFilePath: string | null): string | null {
  const relativePath = relativeMarkdownImagePath(imagePath, documentFilePath);
  if (!relativePath) return null;
  return `![${markdownImageAltText(imagePath)}](${relativePath})`;
}

export function droppedImageMarkdown(paths: string[], documentFilePath: string | null): DroppedImageMarkdown {
  const lines: string[] = [];
  let skippedCount = 0;

  for (const path of paths) {
    if (!isSupportedImageDropName(path)) {
      skippedCount += 1;
      continue;
    }

    const markdown = markdownImageForPath(path, documentFilePath);
    if (!markdown) {
      skippedCount += 1;
      continue;
    }

    lines.push(markdown);
  }

  return {
    markdown: lines.join("\n"),
    insertedCount: lines.length,
    skippedCount
  };
}

export function createDroppedImageTextEdit(markdown: string, selection: TextRange, imageMarkdown: string): TextEdit | null {
  const insertion = imageMarkdown.trim();
  if (!insertion) return null;

  const from = clampOffset(Math.min(selection.from, selection.to), markdown.length);
  const to = clampOffset(Math.max(selection.from, selection.to), markdown.length);
  const insert = formatImageInsertion(markdown, { from, to }, insertion);
  const change = { from, to, insert };
  const next = applyTextChange(markdown, change);
  const caret = from + insert.length;

  return {
    markdown: next,
    change,
    selection: { from: caret, to: caret }
  };
}

export function droppedImageToast(insertedCount: number, skippedCount: number): string {
  const parts: string[] = [];
  if (insertedCount === 1) parts.push("Inserted 1 image reference");
  if (insertedCount > 1) parts.push(`Inserted ${insertedCount} image references`);
  if (skippedCount > 0) parts.push(`${skippedCount} skipped`);
  return parts.length ? parts.join(" - ") : "No local image references inserted";
}

function formatImageInsertion(markdown: string, range: TextRange, insertion: string): string {
  const needsLeadingBreak = range.from > 0 && markdown[range.from - 1] !== "\n";
  const needsTrailingBreak = range.to < markdown.length && markdown[range.to] !== "\n";
  return `${needsLeadingBreak ? "\n" : ""}${insertion}${needsTrailingBreak ? "\n" : ""}`;
}

function parseAbsoluteLocalPath(path: string): ParsedLocalPath | null {
  const trimmed = path.trim();
  if (!trimmed) return null;

  const driveMatch = /^([a-zA-Z]:)[\\/]+(.*)$/.exec(trimmed);
  if (driveMatch) {
    return {
      root: driveMatch[1].toUpperCase(),
      rootKey: driveMatch[1].toLowerCase(),
      segments: normalizePathSegments(splitPathSegments(driveMatch[2])),
      caseInsensitive: true
    };
  }

  const uncMatch = /^[\\/]{2}([^\\/]+)[\\/]([^\\/]+)(?:[\\/]*(.*))?$/.exec(trimmed);
  if (uncMatch) {
    const root = `//${uncMatch[1]}/${uncMatch[2]}`;
    return {
      root,
      rootKey: root.toLowerCase(),
      segments: normalizePathSegments(splitPathSegments(uncMatch[3] ?? "")),
      caseInsensitive: true
    };
  }

  if (/^[\\/]/.test(trimmed)) {
    return {
      root: "/",
      rootKey: "/",
      segments: normalizePathSegments(splitPathSegments(trimmed.replace(/^[\\/]+/, ""))),
      caseInsensitive: false
    };
  }

  return null;
}

function splitPathSegments(path: string): string[] {
  return path.split(/[\\/]+/).filter(Boolean);
}

function normalizePathSegments(segments: string[]): string[] {
  const normalized: string[] = [];

  for (const segment of segments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (normalized.length > 0) normalized.pop();
      continue;
    }
    normalized.push(segment);
  }

  return normalized;
}

function commonPathPrefixLength(left: string[], right: string[], caseInsensitive: boolean): number {
  const max = Math.min(left.length, right.length);
  let index = 0;

  while (index < max && samePathSegment(left[index], right[index], caseInsensitive)) {
    index += 1;
  }

  return index;
}

function samePathSegment(left: string, right: string, caseInsensitive: boolean): boolean {
  return caseInsensitive ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function encodeMarkdownRelativePath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment).replace(/[()]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`))
    .join("/");
}

function markdownImageAltText(path: string): string {
  const baseName = path.replace(/\\/g, "/").split("/").filter(Boolean).at(-1) ?? "image";
  const stem = baseName.replace(IMAGE_DROP_EXTENSION, "") || "image";
  return decodePathComponent(stem)
    .replace(/\\/g, "\\\\")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

function decodePathComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function clampOffset(offset: number, length: number): number {
  return Math.max(0, Math.min(offset, length));
}
