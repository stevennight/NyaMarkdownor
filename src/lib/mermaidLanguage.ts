export function isMermaidLanguage(language: string | null | undefined): boolean {
  return language?.trim().split(/\s+/, 1)[0]?.toLowerCase() === "mermaid";
}
