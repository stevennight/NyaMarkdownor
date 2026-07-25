/// <reference lib="webworker" />

import { createLatestTaskScheduler } from "../lib/latestTaskScheduler";
import { createMarkdownOutlineCache } from "../lib/markdownOutlineCache";
import type { MarkdownWorkerRequest, MarkdownWorkerResponse } from "../lib/markdownWorkerProtocol";

const worker = self as DedicatedWorkerGlobalScope;
const outlineCache = createMarkdownOutlineCache();

const requestScheduler = createLatestTaskScheduler<MarkdownWorkerRequest>(processRequest, (flush) => {
  worker.setTimeout(flush, 0);
});
let latestRequestId = 0;

worker.onmessage = (event: MessageEvent<MarkdownWorkerRequest>) => {
  latestRequestId = event.data.id;
  requestScheduler.schedule(event.data);
};

async function processRequest(request: MarkdownWorkerRequest): Promise<void> {
  try {
    const previewModule = request.includePreview ? await import("../lib/markdownPreview") : null;
    if (request.id !== latestRequestId) return;
    const previewHtml = previewModule?.renderMarkdownPreviewHtml(request.previewMarkdown) ?? "";
    const response: MarkdownWorkerResponse = {
      id: request.id,
      headings: outlineCache.headingsFor(request.outlineMarkdown),
      previewHtml,
      includePreview: request.includePreview
    };

    worker.postMessage(response);
  } catch (error) {
    if (request.id !== latestRequestId) return;
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
