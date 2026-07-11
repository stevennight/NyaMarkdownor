/// <reference lib="webworker" />

import { renderMarkdownHtml } from "../lib/markdown";
import { createLatestTaskScheduler } from "../lib/latestTaskScheduler";
import { createMarkdownOutlineCache } from "../lib/markdownOutlineCache";
import type { MarkdownWorkerRequest, MarkdownWorkerResponse } from "../lib/markdownWorkerProtocol";

const worker = self as DedicatedWorkerGlobalScope;
const outlineCache = createMarkdownOutlineCache();

const requestScheduler = createLatestTaskScheduler<MarkdownWorkerRequest>(processRequest, (flush) => {
  worker.setTimeout(flush, 0);
});

worker.onmessage = (event: MessageEvent<MarkdownWorkerRequest>) => {
  requestScheduler.schedule(event.data);
};

function processRequest(request: MarkdownWorkerRequest): void {
  try {
    const response: MarkdownWorkerResponse = {
      id: request.id,
      headings: outlineCache.headingsFor(request.outlineMarkdown),
      previewHtml: request.includePreview ? renderMarkdownHtml(request.previewMarkdown) : "",
      includePreview: request.includePreview
    };

    worker.postMessage(response);
  } catch (error) {
    worker.postMessage({
      id: request.id,
      headings: [],
      previewHtml: "",
      includePreview: request.includePreview,
      error: error instanceof Error ? error.message : "Markdown render failed"
    } satisfies MarkdownWorkerResponse);
  }
}

export {};
