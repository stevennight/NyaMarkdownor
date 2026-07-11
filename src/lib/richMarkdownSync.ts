export const RICH_MARKDOWN_SYNC_DELAY = 96;

export function richMarkdownSyncDelayFor(length: number): number {
  if (length > 250_000) return 420;
  if (length > 100_000) return 240;
  if (length > 25_000) return 140;
  return RICH_MARKDOWN_SYNC_DELAY;
}

export type RichMarkdownSyncSource = "input" | "undo" | "redo";

export type RichMarkdownSyncScheduler = {
  schedule: (serialize: () => string, source?: RichMarkdownSyncSource, delay?: number) => void;
  flush: () => boolean;
  cancel: () => boolean;
};

/**
 * Coalesces expensive Markdown serialization while keeping a synchronous flush
 * available for save, recovery, and document-switch paths.
 */
export function createRichMarkdownSyncScheduler(
  onMarkdown: (markdown: string, source: RichMarkdownSyncSource) => void,
  delay = RICH_MARKDOWN_SYNC_DELAY
): RichMarkdownSyncScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let serialize: (() => string) | null = null;
  let source: RichMarkdownSyncSource = "input";

  function clearTimer() {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  }

  function flush(): boolean {
    if (!serialize) return false;
    const pendingSerialize = serialize;
    const pendingSource = source;
    serialize = null;
    source = "input";
    clearTimer();
    onMarkdown(pendingSerialize(), pendingSource);
    return true;
  }

  return {
    schedule(nextSerialize, nextSource = "input", nextDelay = delay) {
      serialize = nextSerialize;
      source = nextSource;
      if (timer !== null) return;
      timer = setTimeout(flush, nextDelay);
    },
    flush,
    cancel() {
      const hadPendingChange = serialize !== null;
      serialize = null;
      source = "input";
      clearTimer();
      return hadPendingChange;
    }
  };
}
