import { offsetAtLine } from "./text";

export type TextRange = {
  from: number;
  to: number;
};

export type TextChange = {
  from: number;
  to: number;
  insert: string;
};

export type TextEdit = {
  markdown: string;
  selection: TextRange;
  change?: TextChange;
};

export type MarkdownTextCommand = "bold" | "italic" | "code" | "link";
export type MarkdownBlockCommand =
  | "heading-1"
  | "heading-2"
  | "heading-3"
  | "bullet-list"
  | "ordered-list"
  | "task-list"
  | "blockquote"
  | "code-block";
export type MarkdownListIndentDirection = "indent" | "outdent";

type LineContinuation = {
  contentStart: number;
  exitInsert: string;
  insert: string;
};

type OrderedLineInfo = {
  prefix: string;
  number: number;
  delimiter: "." | ")";
  spacing: string;
  quoteDepth: number;
  indentWidth: number;
  markerFrom: number;
  markerTo: number;
  contentStart: number;
};

type ListLineInfo = {
  contentStart: number;
  indentFrom: number;
  indentTo: number;
  markerFrom: number;
  markerTo: number;
};

type BlockquoteLineInfo = {
  contentStart: number;
  quoteFrom: number;
  quoteTo: number;
};

export function applyMarkdownTextCommand(markdown: string, selection: TextRange, command: MarkdownTextCommand): TextEdit {
  switch (command) {
    case "bold":
      return toggleWrap(markdown, selection, "**", "**", "bold");
    case "italic":
      return toggleWrap(markdown, selection, "*", "*", "italic");
    case "code":
      return toggleWrap(markdown, selection, "`", "`", "code");
    case "link":
      return insertLink(markdown, selection);
  }
}

export function applyTextChange(markdown: string, change: TextChange): string {
  return markdown.slice(0, change.from) + change.insert + markdown.slice(change.to);
}

export function applyTaskCheckboxToggle(markdown: string, lineNumber: number, checked: boolean): TextEdit | null {
  if (lineNumber < 0) return null;

  const lineStart = offsetAtLine(markdown, lineNumber);
  if (lineStart >= markdown.length && lineNumber > 0) return null;

  const lineEnd = lineEndAt(markdown, lineStart);
  const line = markdown.slice(lineStart, lineEnd);
  const match = /^((?:[ \t]*>[ \t]?)*[ \t]*(?:[-+*]|\d+[.)])\s+\[)([ xX])(\]\s+)/.exec(line);
  if (!match) return null;

  const markerOffset = lineStart + match[1].length;
  const insert = checked ? "x" : " ";
  const change = {
    from: markerOffset,
    to: markerOffset + 1,
    insert
  };
  const next = applyTextChange(markdown, change);

  return {
    markdown: next,
    change,
    selection: {
      from: markerOffset,
      to: markerOffset
    }
  };
}

export function applyMarkdownBlockCommand(markdown: string, selection: TextRange, command: MarkdownBlockCommand): TextEdit {
  if (command === "code-block") return toggleCodeBlock(markdown, selection);

  const range = lineRangeForSelection(markdown, selection);
  const original = markdown.slice(range.from, range.to);
  const lines = original.split("\n");
  const transformed = transformBlockLines(lines, command);
  const insert = transformed.lines.join("\n");
  const change = { from: range.from, to: range.to, insert };
  const next = applyTextChange(markdown, change);

  return {
    markdown: next,
    change,
    selection: {
      from: mapEditedLineOffset(selection.from, range.from, lines, transformed),
      to: mapEditedLineOffset(selection.to, range.from, lines, transformed)
    }
  };
}

export function applyMarkdownLineContinuation(markdown: string, selection: TextRange): TextEdit | null {
  if (selection.from !== selection.to) return null;

  const cursor = Math.max(0, Math.min(selection.from, markdown.length));
  const lineStart = cursor === 0 ? 0 : markdown.lastIndexOf("\n", cursor - 1) + 1;
  const nextBreak = markdown.indexOf("\n", cursor);
  const lineEnd = nextBreak === -1 ? markdown.length : nextBreak;
  const line = markdown.slice(lineStart, lineEnd);
  const column = cursor - lineStart;
  const continuation = getLineContinuation(line);
  const orderedLine = parseOrderedLine(line, lineStart);

  if (!continuation || column < continuation.contentStart) return null;

  if (!line.slice(continuation.contentStart).trim()) {
    const baseChange = {
      from: lineStart,
      to: lineEnd,
      insert: continuation.exitInsert
    };
    const baseNext = applyTextChange(markdown, baseChange);
    const caret = lineStart + continuation.exitInsert.length;
    const next = orderedLine
      ? renumberFollowingOrderedList(baseNext, nextLineStartAfterOffset(baseNext, caret), orderedLine, orderedLine.number)
      : baseNext;

    return {
      markdown: next,
      change: singleTextChange(markdown, next) ?? baseChange,
      selection: { from: caret, to: caret }
    };
  }

  const baseChange = {
    from: cursor,
    to: cursor,
    insert: continuation.insert
  };
  const baseNext = applyTextChange(markdown, baseChange);
  const caret = cursor + continuation.insert.length;
  const next = orderedLine
    ? renumberFollowingOrderedList(baseNext, nextLineStartAfterOffset(baseNext, caret), orderedLine, orderedLine.number + 2)
    : baseNext;

  return {
    markdown: next,
    change: singleTextChange(markdown, next) ?? baseChange,
    selection: { from: caret, to: caret }
  };
}

export function applyMarkdownListItemLineBreak(markdown: string, selection: TextRange): TextEdit | null {
  const from = Math.max(0, Math.min(selection.from, selection.to, markdown.length));
  const to = Math.max(from, Math.min(Math.max(selection.from, selection.to), markdown.length));
  const lineStart = lineStartAt(markdown, from);
  if (lineStartAt(markdown, to) !== lineStart) return null;

  const lineEnd = lineEndAt(markdown, to);
  const line = markdown.slice(lineStart, lineEnd);
  const context = listItemContinuationContext(markdown, lineStart, line);
  if (!context || from - lineStart < context.contentStart) return null;

  const insert = `\n${context.prefix}`;
  const change = { from, to, insert };
  const caret = from + insert.length;
  return {
    markdown: applyTextChange(markdown, change),
    change,
    selection: { from: caret, to: caret }
  };
}

export function applyMarkdownListIndentation(
  markdown: string,
  selection: TextRange,
  direction: MarkdownListIndentDirection
): TextEdit | null {
  const selectedRange = lineRangeForSelection(markdown, selection);
  const blockRange = expandListBlockRange(markdown, selectedRange);
  if (!blockRange) return null;

  const original = markdown.slice(blockRange.from, blockRange.to);
  const oldLines = original.split("\n");
  const indentedLines: string[] = [];
  let changed = false;
  let selectedListLineCount = 0;
  let relativeLineStart = 0;

  for (const line of oldLines) {
    const absoluteLineStart = blockRange.from + relativeLineStart;
    const selectedLine = absoluteLineStart >= selectedRange.from && absoluteLineStart <= selectedRange.to;
    const info = parseListLine(line);

    if (selectedLine && line.trim() && !info) return null;

    if (!selectedLine || !info) {
      indentedLines.push(line);
      relativeLineStart += line.length + 1;
      continue;
    }

    selectedListLineCount += 1;
    const nextLine = direction === "indent"
      ? indentListLine(line, info)
      : outdentListLine(line, info);
    if (nextLine !== line) changed = true;
    indentedLines.push(nextLine);
    relativeLineStart += line.length + 1;
  }

  if (!selectedListLineCount || !changed) return null;

  const nextLines = renumberOrderedLines(indentedLines);
  const insert = nextLines.join("\n");
  const change = {
    from: blockRange.from,
    to: blockRange.to,
    insert
  };
  const transforms = oldLines.map((oldLine, index) => {
    const nextLine = nextLines[index] ?? "";
    const oldInfo = parseListLine(oldLine);
    const nextInfo = parseListLine(nextLine);
    return transformLine(oldLine, nextLine, oldInfo?.contentStart ?? 0, nextInfo?.contentStart ?? 0);
  });
  const next = applyTextChange(markdown, change);

  return {
    markdown: next,
    change,
    selection: {
      from: mapEditedLineOffset(selection.from, blockRange.from, oldLines, { lines: nextLines, transforms }),
      to: mapEditedLineOffset(selection.to, blockRange.from, oldLines, { lines: nextLines, transforms })
    }
  };
}

export function applyMarkdownListBackspace(markdown: string, selection: TextRange): TextEdit | null {
  if (selection.from !== selection.to) return null;

  const cursor = Math.max(0, Math.min(selection.from, markdown.length));
  const lineStart = lineStartAt(markdown, cursor);
  const lineEnd = lineEndAt(markdown, cursor);
  const line = markdown.slice(lineStart, lineEnd);
  const info = parseListLine(line);
  if (!info || cursor - lineStart !== info.contentStart) return null;

  if (info.indentTo > info.indentFrom) {
    return applyMarkdownListIndentation(markdown, selection, "outdent");
  }

  const orderedLine = parseOrderedLine(line, lineStart);
  const baseChange = {
    from: lineStart + info.markerFrom,
    to: lineStart + info.markerTo,
    insert: ""
  };
  const baseNext = applyTextChange(markdown, baseChange);
  const caret = lineStart + info.markerFrom;
  const next = orderedLine
    ? renumberFollowingOrderedList(baseNext, nextLineStartAfterOffset(baseNext, caret), orderedLine, orderedLine.number)
    : baseNext;

  return {
    markdown: next,
    change: singleTextChange(markdown, next) ?? baseChange,
    selection: { from: caret, to: caret }
  };
}

export function applyMarkdownBlockquoteBackspace(markdown: string, selection: TextRange): TextEdit | null {
  if (selection.from !== selection.to) return null;

  const cursor = Math.max(0, Math.min(selection.from, markdown.length));
  const lineStart = lineStartAt(markdown, cursor);
  const lineEnd = lineEndAt(markdown, cursor);
  const line = markdown.slice(lineStart, lineEnd);
  const info = parseBlockquoteLine(line);
  if (!info || cursor - lineStart !== info.contentStart) return null;

  const change = {
    from: lineStart + info.quoteFrom,
    to: lineStart + info.quoteTo,
    insert: ""
  };
  const next = applyTextChange(markdown, change);
  const caret = lineStart + info.quoteFrom;

  return {
    markdown: next,
    change,
    selection: { from: caret, to: caret }
  };
}

function transformBlockLines(lines: string[], command: Exclude<MarkdownBlockCommand, "code-block">) {
  if (command.startsWith("heading-")) {
    const level = Number(command.at(-1));
    const allTargetHeadings = lines.some((line) => line.trim()) && lines.every((line) => !line.trim() || headingLevel(line) === level);
    return transformLines(lines, (line) => setHeadingLine(line, allTargetHeadings ? 0 : level));
  }

  if (command === "bullet-list") {
    const allBullets = lines.some((line) => line.trim()) && lines.every((line) => !line.trim() || Boolean(line.match(/^(\s*)[-+*]\s+(?!\[[ xX]\]\s+)/)));
    return transformLines(lines, (line) => setListLine(line, allBullets ? "none" : "bullet"));
  }

  if (command === "ordered-list") {
    const allOrdered = lines.some((line) => line.trim()) && lines.every((line) => !line.trim() || Boolean(line.match(/^\s*\d+[.)]\s+/)));
    let number = 1;
    return transformLines(lines, (line) => {
      if (!line.trim()) return transformLine(line, line, 0, 0);
      const transformed = setListLine(line, allOrdered ? "none" : "ordered", number);
      number += 1;
      return transformed;
    });
  }

  if (command === "task-list") {
    const allTasks = lines.some((line) => line.trim()) && lines.every((line) => !line.trim() || Boolean(line.match(/^\s*[-+*]\s+\[[ xX]\]\s+/)));
    return transformLines(lines, (line) => setListLine(line, allTasks ? "none" : "task"));
  }

  const allQuoted = lines.some((line) => line.trim()) && lines.every((line) => !line.trim() || Boolean(line.match(/^\s*>\s?/)));
  return transformLines(lines, (line) => setBlockquoteLine(line, allQuoted));
}

function transformLines(lines: string[], transform: (line: string, index: number) => LineTransform) {
  const transforms = lines.map(transform);
  return {
    lines: transforms.map((line) => line.text),
    transforms
  };
}

type LineTransform = {
  text: string;
  oldContentStart: number;
  newContentStart: number;
};

function transformLine(text: string, nextText: string, oldContentStart: number, newContentStart: number): LineTransform {
  return { text: nextText, oldContentStart, newContentStart };
}

function setHeadingLine(line: string, level: number): LineTransform {
  const match = /^( {0,3})(#{1,6})(?:[ \t]+|$)(.*)$/.exec(line);
  const oldContentStart = match ? match[1].length + match[2].length + (line[match[1].length + match[2].length] ? 1 : 0) : 0;
  const content = match ? match[3] : line;

  if (level === 0) return transformLine(line, content, oldContentStart, 0);

  const prefix = `${"#".repeat(level)} `;
  const next = content.trim() ? `${prefix}${content}` : `${prefix}Heading`;
  return transformLine(line, next, oldContentStart, prefix.length);
}

function headingLevel(line: string): number {
  return /^( {0,3})(#{1,6})(?:[ \t]+|$)/.exec(line)?.[2].length ?? 0;
}

function setListLine(line: string, style: "none" | "bullet" | "ordered" | "task", number = 1): LineTransform {
  const indent = /^\s*/.exec(line)?.[0] ?? "";
  const markerMatch = /^(\s*)(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/.exec(line);
  const oldContentStart = markerMatch ? markerMatch[0].length : indent.length;
  const content = markerMatch ? line.slice(markerMatch[0].length) : line.slice(indent.length);

  if (style === "none") return transformLine(line, `${indent}${content}`, oldContentStart, indent.length);

  const marker = style === "bullet" ? "- " : style === "task" ? "- [ ] " : `${number}. `;
  return transformLine(line, `${indent}${marker}${content}`, oldContentStart, indent.length + marker.length);
}

function setBlockquoteLine(line: string, remove: boolean): LineTransform {
  if (remove) {
    const match = /^(\s*>\s?)(.*)$/.exec(line);
    if (!match) return transformLine(line, line, 0, 0);
    return transformLine(line, match[2], match[1].length, 0);
  }

  return transformLine(line, `> ${line}`, 0, 2);
}

function toggleCodeBlock(markdown: string, selection: TextRange): TextEdit {
  const range = lineRangeForSelection(markdown, selection);
  const enclosingFence = enclosingCodeFenceRange(markdown, range);

  if (enclosingFence) {
    const insert = markdown.slice(enclosingFence.contentFrom, enclosingFence.contentTo);
    const change = { from: enclosingFence.from, to: enclosingFence.to, insert };
    const next = applyTextChange(markdown, change);

    return {
      markdown: next,
      change,
      selection: {
        from: Math.max(change.from, Math.min(selection.from - (enclosingFence.contentFrom - enclosingFence.from), change.from + insert.length)),
        to: Math.max(change.from, Math.min(selection.to - (enclosingFence.contentFrom - enclosingFence.from), change.from + insert.length))
      }
    };
  }

  const original = markdown.slice(range.from, range.to);
  const lines = original.split("\n");
  const alreadyFenced = lines.length >= 2 && /^ {0,3}```/.test(lines[0]) && /^ {0,3}```\s*$/.test(lines[lines.length - 1]);
  const insert = alreadyFenced
    ? lines.slice(1, -1).join("\n")
    : ["```", original || "code", "```"].join("\n");
  const change = { from: range.from, to: range.to, insert };
  const next = applyTextChange(markdown, change);
  const selectionFrom = alreadyFenced ? range.from : range.from + 4;
  const selectionTo = alreadyFenced ? range.from + insert.length : range.from + insert.length - 4;

  return {
    markdown: next,
    change,
    selection: {
      from: Math.max(range.from, Math.min(selectionFrom, range.from + insert.length)),
      to: Math.max(range.from, Math.min(selectionTo, range.from + insert.length))
    }
  };
}

function enclosingCodeFenceRange(markdown: string, range: TextRange): (TextRange & { contentFrom: number; contentTo: number }) | null {
  if (range.from <= 0 || markdown[range.from - 1] !== "\n") return null;
  if (range.to >= markdown.length || markdown[range.to] !== "\n") return null;

  const openEnd = range.from - 1;
  const openStart = lineStartAt(markdown, Math.max(0, openEnd - 1));
  const closeStart = range.to + 1;
  const closeEnd = lineEndAt(markdown, closeStart);
  const opening = markdown.slice(openStart, openEnd);
  const closing = markdown.slice(closeStart, closeEnd);

  if (!/^ {0,3}```/.test(opening) || !/^ {0,3}```\s*$/.test(closing)) return null;

  return {
    from: openStart,
    to: closeEnd,
    contentFrom: range.from,
    contentTo: range.to
  };
}

function lineRangeForSelection(markdown: string, selection: TextRange): TextRange {
  const from = Math.max(0, Math.min(selection.from, selection.to, markdown.length));
  const to = Math.max(from, Math.min(Math.max(selection.from, selection.to), markdown.length));
  const effectiveTo = to > from && markdown[to - 1] === "\n" ? to - 1 : to;
  const lineStart = lineStartAt(markdown, from);
  const lineEnd = lineEndAt(markdown, effectiveTo);
  return { from: lineStart, to: lineEnd };
}

function lineStartAt(markdown: string, offset: number): number {
  return offset === 0 ? 0 : markdown.lastIndexOf("\n", offset - 1) + 1;
}

function lineEndAt(markdown: string, offset: number): number {
  const nextBreak = markdown.indexOf("\n", offset);
  return nextBreak === -1 ? markdown.length : nextBreak;
}

function expandListBlockRange(markdown: string, selectedRange: TextRange): TextRange | null {
  const selectedText = markdown.slice(selectedRange.from, selectedRange.to);
  if (!selectedText.split("\n").some((line) => parseListLine(line))) return null;

  let from = selectedRange.from;
  while (from > 0) {
    const previousEnd = from - 1;
    const previousStart = lineStartAt(markdown, Math.max(0, previousEnd - 1));
    const previousLine = markdown.slice(previousStart, previousEnd);
    if (!parseListLine(previousLine)) break;
    from = previousStart;
  }

  let to = selectedRange.to;
  while (to < markdown.length) {
    const nextStart = to + (markdown[to] === "\n" ? 1 : 0);
    if (nextStart <= to || nextStart > markdown.length) break;
    const nextEnd = lineEndAt(markdown, nextStart);
    const nextLine = markdown.slice(nextStart, nextEnd);
    if (!parseListLine(nextLine)) break;
    to = nextEnd;
  }

  return { from, to };
}

function parseListLine(line: string): ListLineInfo | null {
  const quoteMatch = /^(\s*(?:>\s*)+)(.*)$/.exec(line);
  const quotePrefix = quoteMatch?.[1] ?? "";
  const unquoted = quoteMatch ? quoteMatch[2] : line;
  const indentation = /^[ \t]*/.exec(unquoted)?.[0] ?? "";
  const rest = unquoted.slice(indentation.length);
  const markerMatch = /^(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/.exec(rest);
  if (!markerMatch) return null;

  const indentFrom = quotePrefix.length;
  const indentTo = indentFrom + indentation.length;
  return {
    indentFrom,
    indentTo,
    markerFrom: indentTo,
    markerTo: indentTo + markerMatch[0].length,
    contentStart: indentTo + markerMatch[0].length
  };
}

function listItemContinuationContext(
  markdown: string,
  lineStart: number,
  line: string
): { prefix: string; contentStart: number } | null {
  const currentListLine = parseListLine(line);
  if (currentListLine) {
    return {
      prefix: listItemContinuationPrefix(line, currentListLine),
      contentStart: currentListLine.contentStart
    };
  }

  const currentPrefix = continuationLinePrefix(line);
  if (!currentPrefix) return null;

  let scanStart = lineStart;
  while (scanStart > 0) {
    const previousEnd = scanStart - 1;
    const previousStart = lineStartAt(markdown, Math.max(0, previousEnd - 1));
    const previousLine = markdown.slice(previousStart, previousEnd);
    const previousListLine = parseListLine(previousLine);
    if (previousListLine) {
      return listItemContinuationPrefix(previousLine, previousListLine) === currentPrefix
        ? { prefix: currentPrefix, contentStart: currentPrefix.length }
        : null;
    }

    if (previousLine.trim()) {
      const previousPrefix = continuationLinePrefix(previousLine);
      if (previousPrefix !== currentPrefix) return null;
    }
    scanStart = previousStart;
  }

  return null;
}

function listItemContinuationPrefix(line: string, info: ListLineInfo): string {
  const marker = line.slice(info.markerFrom, info.markerTo);
  const taskListMarker = /^[-+*][ \t]+/.exec(marker);
  const markerWidth = taskListMarker?.[0].length ?? info.contentStart - info.indentTo;
  return `${line.slice(0, info.indentTo)}${" ".repeat(markerWidth)}`;
}

function continuationLinePrefix(line: string): string | null {
  const quotePrefix = /^[ \t]*(?:>[ \t]*)+/.exec(line)?.[0];
  if (quotePrefix) return quotePrefix;
  return /^[ \t]+/.exec(line)?.[0] ?? null;
}

function parseBlockquoteLine(line: string): BlockquoteLineInfo | null {
  const match = /^([ \t]*(?:>[ \t]*)+)(.*)$/.exec(line);
  if (!match) return null;

  const prefix = match[1];
  const quoteFrom = prefix.lastIndexOf(">");
  if (quoteFrom < 0) return null;

  return {
    contentStart: prefix.length,
    quoteFrom,
    quoteTo: prefix.length
  };
}

function indentListLine(line: string, info: ListLineInfo): string {
  return `${line.slice(0, info.indentFrom)}  ${line.slice(info.indentFrom)}`;
}

function outdentListLine(line: string, info: ListLineInfo): string {
  if (info.indentTo <= info.indentFrom) return line;

  const indentation = line.slice(info.indentFrom, info.indentTo);
  const removeCount = indentation[0] === "\t" ? 1 : Math.min(2, indentation.match(/^ */)?.[0].length ?? 0);
  if (removeCount <= 0) return line;
  return line.slice(0, info.indentFrom) + line.slice(info.indentFrom + removeCount);
}

function renumberOrderedLines(lines: readonly string[]): string[] {
  const counters = new Map<string, number>();

  return lines.map((line) => {
    if (!line.trim()) {
      counters.clear();
      return line;
    }

    const listLine = parseListLine(line);
    if (!listLine) {
      counters.clear();
      return line;
    }

    const ordered = parseOrderedLine(line, 0);
    if (!ordered) return line;

    const key = `${ordered.prefix}\u0000${ordered.delimiter}`;
    const expectedNumber = (counters.get(key) ?? 0) + 1;
    counters.set(key, expectedNumber);
    const replacement = String(expectedNumber);
    const currentNumber = line.slice(ordered.markerFrom, ordered.markerTo);
    if (currentNumber === replacement) return line;

    return line.slice(0, ordered.markerFrom) + replacement + line.slice(ordered.markerTo);
  });
}

function mapEditedLineOffset(
  offset: number,
  editStart: number,
  oldLines: string[],
  transformed: { lines: string[]; transforms: LineTransform[] }
): number {
  const relative = Math.max(0, offset - editStart);
  let oldCursor = 0;
  let newCursor = editStart;

  for (let index = 0; index < oldLines.length; index += 1) {
    const oldLine = oldLines[index];
    const newLine = transformed.lines[index] ?? "";
    const transform = transformed.transforms[index] ?? transformLine(oldLine, newLine, 0, 0);
    const lineEnd = oldCursor + oldLine.length;

    if (relative <= lineEnd || index === oldLines.length - 1) {
      const column = Math.max(0, Math.min(relative - oldCursor, oldLine.length));
      const mappedColumn = column < transform.oldContentStart
        ? Math.min(column, transform.newContentStart)
        : transform.newContentStart + column - transform.oldContentStart;
      return newCursor + Math.max(0, Math.min(mappedColumn, newLine.length));
    }

    oldCursor = lineEnd + 1;
    newCursor += newLine.length + 1;
  }

  return newCursor;
}

export function toggleWrap(markdown: string, selection: TextRange, prefix: string, suffix: string, placeholder: string): TextEdit {
  const from = Math.min(selection.from, selection.to);
  const to = Math.max(selection.from, selection.to);
  const selected = markdown.slice(from, to);

  if (selected.startsWith(prefix) && selected.endsWith(suffix) && selected.length >= prefix.length + suffix.length) {
    const inner = selected.slice(prefix.length, selected.length - suffix.length);
    const next = markdown.slice(0, from) + inner + markdown.slice(to);
    return {
      markdown: next,
      selection: { from, to: from + inner.length }
    };
  }

  if (
    from >= prefix.length &&
    markdown.slice(from - prefix.length, from) === prefix &&
    markdown.slice(to, to + suffix.length) === suffix
  ) {
    const next = markdown.slice(0, from - prefix.length) + selected + markdown.slice(to + suffix.length);
    return {
      markdown: next,
      selection: { from: from - prefix.length, to: to - prefix.length }
    };
  }

  const content = selected || placeholder;
  const insert = prefix + content + suffix;
  const next = markdown.slice(0, from) + insert + markdown.slice(to);
  const innerFrom = from + prefix.length;

  return {
    markdown: next,
    selection: {
      from: innerFrom,
      to: innerFrom + content.length
    }
  };
}

function getLineContinuation(line: string): LineContinuation | null {
  const quoteMatch = /^(\s*(?:>\s*)+)(.*)$/.exec(line);
  const indentation = /^(\s*)/.exec(quoteMatch ? quoteMatch[2] : line)?.[1] ?? "";
  const prefix = (quoteMatch?.[1] ?? "") + indentation;
  const rest = quoteMatch ? quoteMatch[2].slice(indentation.length) : line.slice(indentation.length);
  const restOffset = prefix.length;
  const taskMatch = /^([-+*])(\s+)\[([ xX])\](\s*)/.exec(rest);

  if (taskMatch) {
    const trailingSpace = taskMatch[4] || " ";
    return {
      contentStart: restOffset + taskMatch[0].length,
      exitInsert: prefix,
      insert: `\n${prefix}${taskMatch[1]}${taskMatch[2]}[ ]${trailingSpace}`
    };
  }

  const unorderedMatch = /^([-+*])(\s+)/.exec(rest);

  if (unorderedMatch) {
    return {
      contentStart: restOffset + unorderedMatch[0].length,
      exitInsert: prefix,
      insert: `\n${prefix}${unorderedMatch[1]}${unorderedMatch[2]}`
    };
  }

  const orderedMatch = /^(\d+)([.)])(\s+)/.exec(rest);

  if (orderedMatch) {
    const nextNumber = Number.parseInt(orderedMatch[1], 10) + 1;
    return {
      contentStart: restOffset + orderedMatch[0].length,
      exitInsert: prefix,
      insert: `\n${prefix}${nextNumber}${orderedMatch[2]}${orderedMatch[3]}`
    };
  }

  if (quoteMatch) {
    return {
      contentStart: prefix.length,
      exitInsert: "",
      insert: `\n${prefix}`
    };
  }

  return null;
}

function parseOrderedLine(line: string, lineStart: number): OrderedLineInfo | null {
  const quoteMatch = /^(\s*(?:>\s*)+)(.*)$/.exec(line);
  const quotePrefix = quoteMatch?.[1] ?? "";
  const unquoted = quoteMatch ? quoteMatch[2] : line;
  const indentation = /^(\s*)/.exec(unquoted)?.[1] ?? "";
  const prefix = quotePrefix + indentation;
  const rest = unquoted.slice(indentation.length);
  const orderedMatch = /^(\d+)([.)])(\s+)/.exec(rest);
  if (!orderedMatch) return null;
  const structure = markdownLineStructure(line);

  return {
    prefix,
    number: Number.parseInt(orderedMatch[1], 10),
    delimiter: orderedMatch[2] as "." | ")",
    spacing: orderedMatch[3],
    quoteDepth: structure.quoteDepth,
    indentWidth: structure.indentWidth,
    markerFrom: lineStart + prefix.length,
    markerTo: lineStart + prefix.length + orderedMatch[1].length,
    contentStart: prefix.length + orderedMatch[0].length
  };
}

function renumberFollowingOrderedList(
  markdown: string,
  startOffset: number,
  reference: OrderedLineInfo,
  firstNumber: number
): string {
  let next = markdown;
  let lineStart = startOffset;
  let expectedNumber = firstNumber;
  let offsetDelta = 0;

  while (lineStart <= next.length) {
    const lineEnd = lineEndAt(next, lineStart);
    const line = next.slice(lineStart, lineEnd);
    if (!line.trim()) {
      if (lineEnd >= next.length) break;
      lineStart = lineEnd + 1;
      continue;
    }

    const ordered = parseOrderedLine(line, lineStart);
    const matchingSibling = ordered
      && ordered.prefix === reference.prefix
      && ordered.delimiter === reference.delimiter;
    if (!matchingSibling) {
      if (!isNestedOrderedListContent(line, reference)) break;
      if (lineEnd >= next.length) break;
      lineStart = lineEnd + 1;
      continue;
    }

    const replacement = String(expectedNumber);
    const currentNumber = next.slice(ordered.markerFrom, ordered.markerTo);
    if (currentNumber !== replacement) {
      next = next.slice(0, ordered.markerFrom) + replacement + next.slice(ordered.markerTo);
      offsetDelta = replacement.length - currentNumber.length;
    } else {
      offsetDelta = 0;
    }

    expectedNumber += 1;
    if (lineEnd >= next.length) break;
    lineStart = lineEnd + 1 + offsetDelta;
  }

  return next;
}

function isNestedOrderedListContent(line: string, reference: OrderedLineInfo): boolean {
  const structure = markdownLineStructure(line);
  return structure.quoteDepth >= reference.quoteDepth && structure.indentWidth > reference.indentWidth;
}

function markdownLineStructure(line: string): { quoteDepth: number; indentWidth: number } {
  let index = 0;
  let indentWidth = 0;

  while (index < line.length && (line[index] === " " || line[index] === "\t")) {
    indentWidth += line[index] === "\t" ? 4 : 1;
    index += 1;
  }

  let quoteDepth = 0;
  while (line[index] === ">") {
    quoteDepth += 1;
    index += 1;
    if (line[index] === " " || line[index] === "\t") index += 1;
  }

  while (index < line.length && (line[index] === " " || line[index] === "\t")) {
    indentWidth += line[index] === "\t" ? 4 : 1;
    index += 1;
  }

  return { quoteDepth, indentWidth };
}

function nextLineStartAfterOffset(markdown: string, offset: number): number {
  const lineEnd = lineEndAt(markdown, offset);
  return lineEnd >= markdown.length ? markdown.length + 1 : lineEnd + 1;
}

function singleTextChange(before: string, after: string): TextChange | null {
  if (before === after) return null;

  let from = 0;
  const maxPrefix = Math.min(before.length, after.length);
  while (from < maxPrefix && before[from] === after[from]) from += 1;

  let oldEnd = before.length;
  let newEnd = after.length;
  while (oldEnd > from && newEnd > from && before[oldEnd - 1] === after[newEnd - 1]) {
    oldEnd -= 1;
    newEnd -= 1;
  }

  return {
    from,
    to: oldEnd,
    insert: after.slice(from, newEnd)
  };
}

export function insertLink(markdown: string, selection: TextRange): TextEdit {
  const from = Math.min(selection.from, selection.to);
  const to = Math.max(selection.from, selection.to);
  const selected = markdown.slice(from, to) || "text";
  const insert = `[${selected}](https://)`;
  const next = markdown.slice(0, from) + insert + markdown.slice(to);

  return {
    markdown: next,
    selection: {
      from: from + 1,
      to: from + 1 + selected.length
    }
  };
}
