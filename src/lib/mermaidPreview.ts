import type { ThemeMode } from "../types";
import { isMermaidLanguage } from "./mermaidLanguage";

export { isMermaidLanguage } from "./mermaidLanguage";

const MAX_MERMAID_DIAGRAMS = 32;
const MAX_MERMAID_SOURCE_LENGTH = 100_000;
const MAX_MERMAID_ERROR_LENGTH = 320;

type MermaidApi = typeof import("mermaid")["default"];

export type MermaidPreviewLabels = {
  diagram: string;
  editSource: string;
  cancel: string;
  save: string;
  rendering: string;
  renderFailed: string;
  sourceTooLarge: string;
  diagramLimitReached: string;
};

export type MermaidPreviewOptions = {
  theme: ThemeMode;
  labels: MermaidPreviewLabels;
  diagramIndexOffset?: number;
};

type PreparedDiagram = {
  host: HTMLElement;
  canvas: HTMLElement;
  sourceBlock: HTMLPreElement;
  source: string;
};

let mermaidPromise: Promise<MermaidApi> | null = null;
let renderQueue: Promise<void> = Promise.resolve();
let renderId = 0;

export function mermaidRenderSkipReason(source: string, diagramIndex: number): "source-too-large" | "diagram-limit" | null {
  if (diagramIndex >= MAX_MERMAID_DIAGRAMS) return "diagram-limit";
  if (source.length > MAX_MERMAID_SOURCE_LENGTH) return "source-too-large";
  return null;
}

export function mermaidErrorSummary(error: unknown, fallback: string): string {
  const message = error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : "";
  const compact = message
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(" ");

  if (!compact) return fallback;
  return compact.length <= MAX_MERMAID_ERROR_LENGTH
    ? compact
    : `${compact.slice(0, MAX_MERMAID_ERROR_LENGTH - 3)}...`;
}

export function renderMermaidPreview(root: ParentNode, options: MermaidPreviewOptions): () => void {
  const sourceBlocks = Array.from(root.querySelectorAll<HTMLPreElement>("pre[data-language]"))
    .filter((block) => isMermaidLanguage(block.dataset.language));
  if (!sourceBlocks.length) return () => undefined;

  let cancelled = false;
  const diagramIndexOffset = Number.isInteger(options.diagramIndexOffset) && Number(options.diagramIndexOffset) >= 0
    ? Number(options.diagramIndexOffset)
    : 0;
  const diagrams = sourceBlocks.map((sourceBlock, index) => {
    const diagram = prepareDiagram(sourceBlock, options.labels);
    const skipReason = mermaidRenderSkipReason(diagram.source, diagramIndexOffset + index);
    if (skipReason) {
      showDiagramError(
        diagram,
        skipReason === "source-too-large" ? options.labels.sourceTooLarge : options.labels.diagramLimitReached
      );
    }
    return { diagram, render: skipReason === null };
  });
  const prepared = diagrams.filter((item) => item.render).map((item) => item.diagram);

  renderQueue = renderQueue
    .catch(() => undefined)
    .then(async () => {
      if (cancelled || !prepared.length) return;

      let mermaid: MermaidApi;
      try {
        mermaid = await loadMermaid();
      } catch (error) {
        if (!cancelled) {
          const message = mermaidErrorSummary(error, options.labels.renderFailed);
          prepared.forEach((diagram) => showDiagramError(diagram, message));
        }
        return;
      }

      if (cancelled) return;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        suppressErrorRendering: true,
        theme: options.theme === "dark" ? "dark" : "default",
        htmlLabels: false,
        maxTextSize: MAX_MERMAID_SOURCE_LENGTH,
        maxEdges: 500
      });

      for (const diagram of prepared) {
        if (cancelled) return;
        if (!diagram.host.parentNode) continue;

        try {
          const id = `nya-mermaid-${Date.now().toString(36)}-${(renderId += 1).toString(36)}`;
          const result = await mermaid.render(id, diagram.source, diagram.canvas);
          if (cancelled || !diagram.host.parentNode) continue;

          const svg = parseSvg(result.svg);
          svg.setAttribute("role", "img");
          svg.setAttribute("aria-label", options.labels.diagram);
          diagram.canvas.replaceChildren(svg);
          diagram.host.classList.remove("is-rendering", "is-error");
          diagram.host.classList.add("is-rendered");
          const status = diagram.host.querySelector<HTMLElement>(".markdown-diagram-status");
          if (status) status.textContent = "";
        } catch (error) {
          if (!cancelled) showDiagramError(diagram, mermaidErrorSummary(error, options.labels.renderFailed));
        }
      }
    });

  return () => {
    cancelled = true;
    for (const { diagram } of diagrams) {
      if (diagram.host.parentNode) diagram.host.replaceWith(diagram.sourceBlock);
    }
  };
}

function prepareDiagram(sourceBlock: HTMLPreElement, labels: MermaidPreviewLabels): PreparedDiagram {
  const host = document.createElement("figure");
  host.className = "markdown-diagram is-rendering";
  host.dataset.diagram = "mermaid";

  const header = document.createElement("figcaption");
  header.className = "markdown-diagram-header";

  const badge = document.createElement("span");
  badge.className = "markdown-diagram-badge";
  badge.textContent = "MERMAID";
  header.append(badge);

  const sourceLine = sourceBlock.dataset.sourceLine;
  if (sourceLine !== undefined) {
    const editButton = document.createElement("button");
    editButton.className = "markdown-diagram-edit";
    editButton.type = "button";
    editButton.dataset.diagramSourceLine = sourceLine;
    editButton.title = labels.editSource;
    editButton.setAttribute("aria-label", labels.editSource);
    editButton.textContent = labels.editSource;
    header.append(editButton);
  }

  const canvas = document.createElement("div");
  canvas.className = "markdown-diagram-canvas";
  canvas.setAttribute("aria-label", labels.diagram);

  const status = document.createElement("div");
  status.className = "markdown-diagram-status";
  status.setAttribute("role", "status");
  status.textContent = labels.rendering;

  sourceBlock.classList.add("markdown-diagram-source");
  sourceBlock.replaceWith(host);
  host.append(header, canvas, status, sourceBlock);

  return {
    host,
    canvas,
    sourceBlock,
    source: sourceBlock.textContent ?? ""
  };
}

function showDiagramError(diagram: PreparedDiagram, message: string): void {
  if (!diagram.host.parentNode) return;
  diagram.canvas.replaceChildren();
  diagram.host.classList.remove("is-rendering", "is-rendered");
  diagram.host.classList.add("is-error");
  const status = diagram.host.querySelector<HTMLElement>(".markdown-diagram-status");
  if (!status) return;
  status.setAttribute("role", "alert");
  status.textContent = message;
}

function parseSvg(svgText: string): SVGSVGElement {
  const parsed = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const svg = parsed.documentElement;
  if (svg.localName !== "svg" || parsed.querySelector("parsererror")) {
    throw new Error("Mermaid returned invalid SVG");
  }
  return document.importNode(svg, true) as unknown as SVGSVGElement;
}

async function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid")
      .then((module) => module.default)
      .catch((error) => {
        mermaidPromise = null;
        throw error;
      });
  }
  return mermaidPromise;
}
