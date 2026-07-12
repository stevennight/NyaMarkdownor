import type { MarkdownDocument } from "../types";
import { normalizeReferenceLabel } from "./inlineMarkdown";
import { markdownFileExtensionSuffixForName, removeMarkdownFileExtension } from "./markdownFileTypes";
import { splitMarkdownFrontMatter } from "./markdownFrontMatter";
import { stripInlineMarkdown } from "./text";

export function suggestedMarkdownCopyName(name: string): string {
  return suggestedMarkdownVariantName(name, "copy");
}

export function suggestedMarkdownSaveAsTarget(document: Pick<MarkdownDocument, "fileName" | "filePath" | "markdown">): string {
  return document.filePath || displayMarkdownDocumentName(document);
}

export function suggestedMarkdownCopyTarget(document: Pick<MarkdownDocument, "fileName" | "filePath" | "markdown">): string {
  const copyName = suggestedMarkdownCopyName(displayMarkdownDocumentName(document));
  return document.filePath ? replacePathFileName(document.filePath, copyName) : copyName;
}

export function suggestedMarkdownDiskVersionName(name: string): string {
  return suggestedMarkdownVariantName(name, "disk");
}

export function suggestedUntitledMarkdownName(existingNames: readonly string[]): string {
  const usedNumbers = new Set<number>();

  for (const name of existingNames) {
    const trimmed = name.trim();
    const extension = markdownFileExtensionSuffixForName(trimmed);
    const match = extension ? trimmed.slice(0, -extension.length).match(/^untitled(?:[-_\s](\d+))?$/i) : null;
    if (!match) continue;
    usedNumbers.add(match[1] ? Number(match[1]) : 1);
  }

  if (!usedNumbers.has(1)) return "Untitled.md";

  let next = 2;
  while (usedNumbers.has(next)) next += 1;
  return `Untitled ${next}.md`;
}

function suggestedMarkdownVariantName(name: string, variant: string): string {
  const trimmed = name.trim() || "Untitled.md";
  const extension = markdownFileExtensionSuffixForName(trimmed);

  if (!extension) return `${trimmed} ${variant}.md`;

  const base = removeMarkdownFileExtension(trimmed) || "Untitled";
  return `${base} ${variant}${extension}`;
}

function replacePathFileName(path: string, fileName: string): string {
  const separatorIndex = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return separatorIndex >= 0 ? `${path.slice(0, separatorIndex + 1)}${fileName}` : fileName;
}

export function displayMarkdownDocumentName(document: Pick<MarkdownDocument, "fileName" | "filePath" | "markdown">): string {
  const storedName = document.fileName.trim() || "Untitled.md";
  if (document.filePath || !isUntitledMarkdownName(storedName)) return storedName;

  return suggestedMarkdownNameFromContent(document.markdown) ?? storedName;
}

export function suggestedMarkdownNameFromContent(markdown: string): string | null {
  const title = firstDocumentTitle(markdown);
  if (!title) return null;

  const sanitized = sanitizeFileStem(title);
  return sanitized ? `${sanitized}.md` : null;
}

function isUntitledMarkdownName(name: string): boolean {
  const trimmed = name.trim();
  const extension = markdownFileExtensionSuffixForName(trimmed);
  return Boolean(extension && /^untitled(?:[-_\s]\d+)?$/i.test(trimmed.slice(0, -extension.length)));
}

function firstDocumentTitle(markdown: string): string | null {
  const { body } = splitMarkdownFrontMatter(markdown);
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  const referenceLabels = referenceLabelsFromMarkdownLines(lines);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const heading = trimmed.match(/^#{1,6}\s+(.+?)\s*#*$/);
    if (heading) return stripInlineMarkdown(heading[1], { referenceLabels });
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || /^[-*_]{3,}$/.test(trimmed) || /^\|?[\s:|-]+\|?$/.test(trimmed)) continue;

    return stripInlineMarkdown(trimmed
      .replace(/^>\s*/, "")
      .replace(/^[-*+]\s+/, "")
      .replace(/^\d+[.)]\s+/, "")
      .replace(/^\[[ xX]\]\s+/, ""), { referenceLabels });
  }

  return null;
}

function referenceLabelsFromMarkdownLines(lines: string[]): Set<string> {
  const labels = new Set<string>();

  for (const line of lines) {
    const match = line.match(/^[ \t]{0,3}\[([^\]\n]+)\]:[ \t]*\S+/);
    if (match) labels.add(normalizeReferenceLabel(match[1]));
  }

  return labels;
}

function sanitizeFileStem(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.\s]+$/g, "")
    .slice(0, 56)
    .trim();
}
