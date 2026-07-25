import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { Heading } from "../types";
import { extractHeadings } from "../lib/markdownHeadings";
import type { MarkdownWorkerRequest, MarkdownWorkerResponse } from "../lib/markdownWorkerProtocol";
import { shouldRequestPreviewRender } from "../lib/renderScheduling";
import { markStartupMilestone } from "../lib/performanceDiagnostics";

type UseMarkdownWorkerInput = {
  outlineMarkdown: string;
  previewMarkdown: string;
  shouldRenderPreview: boolean;
};

type MarkdownWorkerState = {
  headings: Heading[];
  previewHtml: string;
  outlinePending: boolean;
  previewPending: boolean;
  error: string | null;
};

export function useMarkdownWorker({
  outlineMarkdown,
  previewMarkdown,
  shouldRenderPreview
}: UseMarkdownWorkerInput): MarkdownWorkerState {
  const workerRef = useRef<Worker | null>(null);
  const sequenceRef = useRef(0);
  const lastRenderedPreviewMarkdownRef = useRef<string | null>(null);
  const [state, setState] = useState<MarkdownWorkerState>({
    headings: [],
    previewHtml: "",
    outlinePending: true,
    previewPending: shouldRenderPreview,
    error: null
  });

  useEffect(() => {
    const id = sequenceRef.current + 1;
    sequenceRef.current = id;
    const includePreview = shouldRequestPreviewRender(
      previewMarkdown,
      shouldRenderPreview,
      lastRenderedPreviewMarkdownRef.current
    );
    setState((current) => ({
      ...current,
      outlinePending: true,
      previewPending: includePreview,
      error: null
    }));

    const worker = getWorker(workerRef);
    if (!worker) {
      const fallbackTimer = window.setTimeout(() => {
        if (sequenceRef.current !== id) return;
        void renderOnMainThread(
          id,
          outlineMarkdown,
          previewMarkdown,
          includePreview,
          () => sequenceRef.current === id,
          lastRenderedPreviewMarkdownRef,
          setState
        );
      }, 0);

      return () => window.clearTimeout(fallbackTimer);
    }

    const handleMessage = (event: MessageEvent<MarkdownWorkerResponse>) => {
      const response = event.data;
      if (response.id !== sequenceRef.current) return;
      markStartupMilestone("markdown-worker-ready");
      if (response.includePreview && !response.error) {
        lastRenderedPreviewMarkdownRef.current = previewMarkdown;
      }

      setState((current) => ({
        headings: response.headings,
        previewHtml: response.includePreview ? response.previewHtml : current.previewHtml,
        outlinePending: false,
        previewPending: false,
        error: response.error ?? null
      }));
    };

    const request: MarkdownWorkerRequest = {
      id,
      outlineMarkdown,
      previewMarkdown: includePreview ? previewMarkdown : "",
      includePreview
    };

    worker.addEventListener("message", handleMessage);
    worker.postMessage(request);

    return () => worker.removeEventListener("message", handleMessage);
  }, [outlineMarkdown, previewMarkdown, shouldRenderPreview]);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  return state;
}

function getWorker(workerRef: { current: Worker | null }): Worker | null {
  if (workerRef.current) return workerRef.current;
  if (typeof Worker === "undefined") return null;

  try {
    workerRef.current = new Worker(new URL("../workers/markdownWorker.ts", import.meta.url), { type: "module" });
    markStartupMilestone("markdown-worker-created");
    return workerRef.current;
  } catch (error) {
    console.warn(error);
    return null;
  }
}

async function renderOnMainThread(
  id: number,
  outlineMarkdown: string,
  previewMarkdown: string,
  includePreview: boolean,
  isCurrent: () => boolean,
  lastRenderedPreviewMarkdownRef: { current: string | null },
  setState: Dispatch<SetStateAction<MarkdownWorkerState>>
): Promise<void> {
  try {
    const previewModule = includePreview ? await import("../lib/markdownPreview") : null;
    if (!isCurrent()) return;
    const previewHtml = previewModule?.renderMarkdownPreviewHtml(previewMarkdown) ?? null;
    markStartupMilestone("markdown-worker-ready");
    if (includePreview) lastRenderedPreviewMarkdownRef.current = previewMarkdown;
    setState((current) => ({
      headings: extractHeadings(outlineMarkdown),
      previewHtml: previewHtml ?? current.previewHtml,
      outlinePending: false,
      previewPending: false,
      error: null
    }));
  } catch (error) {
    if (!isCurrent()) return;
    setState((current) => ({
      headings: [],
      previewHtml: includePreview ? "" : current.previewHtml,
      outlinePending: false,
      previewPending: false,
      error: error instanceof Error ? error.message : `Markdown render ${id} failed`
    }));
  }
}
