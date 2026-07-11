export const MAX_RICH_DOCUMENT_HISTORY_ENTRIES = 200;

export type RichDocumentHistoryAction = "undo" | "redo";
export type RichDocumentChangeSource = "input" | RichDocumentHistoryAction;

export type RichDocumentHistory = {
  past: readonly string[];
  future: readonly string[];
};

export const EMPTY_RICH_DOCUMENT_HISTORY: RichDocumentHistory = { past: [], future: [] };

export function recordRichDocumentChange(
  history: RichDocumentHistory,
  current: string,
  next: string,
  source: RichDocumentChangeSource
): RichDocumentHistory {
  if (current === next) return history;

  if (source === "input") {
    return {
      past: limitHistory([...history.past, current]),
      future: []
    };
  }

  if (source === "undo") {
    const targetIndex = history.past.lastIndexOf(next);
    return {
      past: targetIndex < 0 ? history.past : history.past.slice(0, targetIndex),
      future: limitHistory([...history.future, current])
    };
  }

  const targetIndex = history.future.lastIndexOf(next);
  return {
    past: limitHistory([...history.past, current]),
    future: targetIndex < 0 ? [] : history.future.slice(0, targetIndex)
  };
}

export function applyRichDocumentHistoryAction(
  history: RichDocumentHistory,
  current: string,
  action: RichDocumentHistoryAction
): { history: RichDocumentHistory; markdown: string } | null {
  if (action === "undo") {
    const markdown = history.past.at(-1);
    if (markdown === undefined) return null;
    return {
      markdown,
      history: {
        past: history.past.slice(0, -1),
        future: limitHistory([...history.future, current])
      }
    };
  }

  const markdown = history.future.at(-1);
  if (markdown === undefined) return null;
  return {
    markdown,
    history: {
      past: limitHistory([...history.past, current]),
      future: history.future.slice(0, -1)
    }
  };
}

function limitHistory(entries: readonly string[]): readonly string[] {
  return entries.length <= MAX_RICH_DOCUMENT_HISTORY_ENTRIES
    ? entries
    : entries.slice(-MAX_RICH_DOCUMENT_HISTORY_ENTRIES);
}
