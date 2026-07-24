export const SOURCE_EDITOR_SYNC_DELAY = 24;

export function sourceEditorSyncDelayFor(length: number): number {
  if (length > 500_000) return 280;
  if (length > 250_000) return 180;
  if (length > 100_000) return 96;
  if (length > 25_000) return 48;
  return SOURCE_EDITOR_SYNC_DELAY;
}

export type SourceEditorSyncFlushOptions = {
  reportSelection?: boolean;
};

export type SourceEditorSyncScheduler<TState> = {
  schedule: (state: TState, markdownChanged: boolean, delay?: number) => void;
  flush: (options?: SourceEditorSyncFlushOptions) => boolean;
  cancel: () => boolean;
};

/**
 * Coalesces CodeMirror-to-React updates so large documents stay local to the
 * editor while the user is typing. The latest state is still synchronously
 * flushable for document switches, recovery, and unmount paths.
 */
export function createSourceEditorSyncScheduler<TState>(
  serializeMarkdown: (state: TState) => string,
  onMarkdown: (markdown: string) => void,
  onSelection: (state: TState) => void,
  delay = SOURCE_EDITOR_SYNC_DELAY
): SourceEditorSyncScheduler<TState> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latestState: TState | undefined;
  let markdownChanged = false;

  function clearTimer() {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  }

  function flush(options: SourceEditorSyncFlushOptions = {}): boolean {
    if (latestState === undefined) return false;

    const state = latestState;
    const shouldSerializeMarkdown = markdownChanged;
    latestState = undefined;
    markdownChanged = false;
    clearTimer();

    if (shouldSerializeMarkdown) onMarkdown(serializeMarkdown(state));
    if (options.reportSelection !== false) onSelection(state);
    return true;
  }

  return {
    schedule(state, nextMarkdownChanged, nextDelay = delay) {
      latestState = state;
      markdownChanged ||= nextMarkdownChanged;
      if (timer !== null) return;
      timer = setTimeout(flush, nextDelay);
    },
    flush,
    cancel() {
      const hadPendingUpdate = latestState !== undefined;
      latestState = undefined;
      markdownChanged = false;
      clearTimer();
      return hadPendingUpdate;
    }
  };
}
