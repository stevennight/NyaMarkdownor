import type { TextRange } from "./editorCommands";

export function tableCellBoundaryRange(line: string, lineOffset: number, col: number): TextRange | null {
  const pipes = unescapedPipeIndexes(line);
  const hasLeadingPipe = line.trimStart().startsWith("|");
  const startPipeIndex = hasLeadingPipe ? col : col - 1;
  if (startPipeIndex >= pipes.length) return null;

  const endPipeIndex = startPipeIndex + 1;
  const startBoundary = startPipeIndex >= 0 ? pipes[startPipeIndex] + 1 : 0;
  const endBoundary = endPipeIndex < pipes.length ? pipes[endPipeIndex] : line.length;

  if (startBoundary > line.length || endBoundary < startBoundary) return null;

  return {
    from: lineOffset + startBoundary,
    to: lineOffset + endBoundary
  };
}

export function tableCellContentRange(line: string, lineOffset: number, col: number): TextRange | null {
  const range = tableCellBoundaryRange(line, lineOffset, col);
  if (!range) return null;

  let from = range.from - lineOffset;
  let to = range.to - lineOffset;
  while (from < to && /\s/.test(line[from])) from += 1;
  while (to > from && /\s/.test(line[to - 1])) to -= 1;
  if (from === to) return range;

  return {
    from: lineOffset + from,
    to: lineOffset + to
  };
}

export function unescapedPipeIndexes(line: string): number[] {
  const indexes: number[] = [];

  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === "|" && !isEscapedByOddBackslashes(line, index)) {
      indexes.push(index);
    }
  }

  return indexes;
}

function isEscapedByOddBackslashes(text: string, index: number): boolean {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}
