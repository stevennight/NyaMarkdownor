export type InlineMarkdownLink = {
  from: number;
  to: number;
  labelFrom: number;
  labelTo: number;
  destinationFrom: number;
  destinationTo: number;
  image: boolean;
};

export type MarkdownAutolink = {
  from: number;
  to: number;
  labelFrom: number;
  labelTo: number;
};

export function findInlineMarkdownLinks(text: string): InlineMarkdownLink[] {
  const links: InlineMarkdownLink[] = [];
  let index = 0;

  while (index < text.length) {
    const image = text[index] === "!" && text[index + 1] === "[";
    const link = text[index] === "[";
    if ((!image && !link) || isEscaped(text, index)) {
      index += 1;
      continue;
    }

    const openBracket = image ? index + 1 : index;
    const labelTo = findClosingBracket(text, openBracket);
    const openParen = labelTo >= 0 ? labelTo + 1 : -1;
    if (labelTo < 0 || text[openParen] !== "(") {
      index += 1;
      continue;
    }

    const closeParen = findClosingParen(text, openParen);
    if (closeParen < 0) {
      index += 1;
      continue;
    }

    links.push({
      from: index,
      to: closeParen + 1,
      labelFrom: openBracket + 1,
      labelTo,
      destinationFrom: openParen + 1,
      destinationTo: closeParen,
      image
    });
    index = closeParen + 1;
  }

  return links;
}

export function findMarkdownAutolinks(text: string): MarkdownAutolink[] {
  const links: MarkdownAutolink[] = [];
  const regexp = /<((?:https?:\/\/|mailto:)[^\s<>]+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})>/gi;

  for (const match of text.matchAll(regexp)) {
    if (match.index === undefined || isEscaped(text, match.index)) continue;
    const label = match[1] ?? "";
    if (!label) continue;

    links.push({
      from: match.index,
      to: match.index + match[0].length,
      labelFrom: match.index + 1,
      labelTo: match.index + 1 + label.length
    });
  }

  return links;
}

export function replaceInlineMarkdownLinksWithLabels(text: string): string {
  const links = findInlineMarkdownLinks(text);
  if (!links.length) return text;

  let output = "";
  let cursor = 0;
  for (const link of links) {
    output += text.slice(cursor, link.from);
    output += text.slice(link.labelFrom, link.labelTo);
    cursor = link.to;
  }

  return output + text.slice(cursor);
}

export function replaceMarkdownAutolinksWithLabels(text: string): string {
  const links = findMarkdownAutolinks(text);
  if (!links.length) return text;

  let output = "";
  let cursor = 0;
  for (const link of links) {
    output += text.slice(cursor, link.from);
    output += text.slice(link.labelFrom, link.labelTo);
    cursor = link.to;
  }

  return output + text.slice(cursor);
}

export function replaceShortcutReferenceLinksWithLabels(text: string, referenceLabels?: ReadonlySet<string>): string {
  if (!referenceLabels?.size) return text;

  let output = "";
  let cursor = 0;
  let index = 0;

  while (index < text.length) {
    const image = text[index] === "!" && text[index + 1] === "[";
    const link = text[index] === "[";
    if ((!image && !link) || isEscaped(text, index) || (!image && text[index - 1] === "]")) {
      index += 1;
      continue;
    }

    const openBracket = image ? index + 1 : index;
    const labelTo = findClosingBracket(text, openBracket);
    if (labelTo < 0 || text[labelTo + 1] === "(" || text[labelTo + 1] === "[") {
      index += 1;
      continue;
    }

    const label = text.slice(openBracket + 1, labelTo);
    if (!referenceLabels.has(normalizeReferenceLabel(label))) {
      index += 1;
      continue;
    }

    output += text.slice(cursor, index);
    output += label;
    cursor = labelTo + 1;
    index = cursor;
  }

  return cursor === 0 ? text : output + text.slice(cursor);
}

export function normalizeReferenceLabel(label: string): string {
  return label
    .replace(/\\([\\`*{}\[\]()#+\-.!|_>])/g, "$1")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function findClosingBracket(text: string, openBracket: number): number {
  let depth = 0;

  for (let index = openBracket; index < text.length; index += 1) {
    if (isEscaped(text, index)) continue;

    const char = text[index];
    if (char === "[") {
      depth += 1;
      continue;
    }

    if (char === "]") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function findClosingParen(text: string, openParen: number): number {
  let depth = 0;

  for (let index = openParen; index < text.length; index += 1) {
    if (isEscaped(text, index)) continue;

    const char = text[index];
    if (char === "(") {
      depth += 1;
      continue;
    }

    if (char === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function isEscaped(text: string, index: number): boolean {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}
