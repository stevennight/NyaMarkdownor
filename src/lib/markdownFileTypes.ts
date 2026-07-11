export const markdownFileExtensions = ["md", "markdown", "mdown", "mkdn", "mdwn", "txt"] as const;

const markdownFileExtensionSet = new Set<string>(markdownFileExtensions);

export const markdownFileInputAccept = [
  ...markdownFileExtensions.map((extension) => `.${extension}`),
  "text/markdown",
  "text/plain"
].join(",");

export function markdownFileExtensionForName(name: string): string | null {
  const normalized = name.trim();
  const separator = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  const baseName = normalized.slice(separator + 1);
  const dot = baseName.lastIndexOf(".");
  if (dot < 0 || dot === baseName.length - 1) return null;

  const extension = baseName.slice(dot + 1).toLowerCase();
  return markdownFileExtensionSet.has(extension) ? extension : null;
}

export function isSupportedMarkdownFileName(name: string): boolean {
  return markdownFileExtensionForName(name) !== null;
}

export function markdownFileExtensionSuffixForName(name: string): string | null {
  const normalized = name.trim();
  const separator = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  const baseName = normalized.slice(separator + 1);
  const dot = baseName.lastIndexOf(".");
  if (dot < 0 || dot === baseName.length - 1 || !isSupportedMarkdownFileName(normalized)) return null;

  return baseName.slice(dot);
}

export function removeMarkdownFileExtension(name: string): string {
  const normalized = name.trim();
  const suffix = markdownFileExtensionSuffixForName(normalized);
  return suffix ? normalized.slice(0, -suffix.length) : normalized;
}

export function isExtensionOnlyMarkdownName(name: string): boolean {
  const normalized = name.trim();
  return /^\.[^.\\/]+$/.test(normalized) && isSupportedMarkdownFileName(normalized);
}
