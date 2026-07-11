export type DocumentMetrics = {
  lineCount: number;
  charCount: number;
};

export type DocumentCursorPosition = {
  line: number;
  column: number;
};

export function getDocumentMetrics(markdown: string): DocumentMetrics {
  if (!markdown) {
    return {
      lineCount: 0,
      charCount: 0
    };
  }

  let lineCount = 1;
  let charCount = 0;

  for (const char of markdown) {
    charCount += 1;
    if (char === "\n") lineCount += 1;
  }

  return {
    lineCount,
    charCount
  };
}

export function getDocumentCursorPosition(markdown: string, offset: number): DocumentCursorPosition {
  const clampedOffset = Math.max(0, Math.min(Number.isFinite(offset) ? offset : 0, markdown.length));
  let line = 1;
  let column = 1;
  let index = 0;

  for (const char of markdown) {
    const nextIndex = index + char.length;
    if (nextIndex > clampedOffset) break;

    if (char === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }

    index = nextIndex;
  }

  return { line, column };
}
