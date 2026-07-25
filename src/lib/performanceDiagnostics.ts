export type EditorPerformanceMode = "source" | "rich";

export type PerformanceSampleSummary = {
  count: number;
  latestMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
};

export type PerformanceDiagnosticsSnapshot = {
  startupMs: Record<string, number>;
  input: Record<EditorPerformanceMode, {
    commit: PerformanceSampleSummary;
    nextFrame: PerformanceSampleSummary;
  }>;
  operations: Record<string, PerformanceSampleSummary>;
};

export type NyaPerformanceDiagnostics = {
  reset: () => void;
  snapshot: () => PerformanceDiagnosticsSnapshot;
};

type InputSamples = {
  commit: number[];
  nextFrame: number[];
};

const SAMPLE_LIMIT = 200;
const MAX_INPUT_SAMPLE_AGE_MS = 2_000;
const startupMilestones = new Map<string, number>();
const inputStarts = new Map<EditorPerformanceMode, number>();
const inputSamples: Record<EditorPerformanceMode, InputSamples> = {
  source: { commit: [], nextFrame: [] },
  rich: { commit: [], nextFrame: [] }
};
const operationSamples = new Map<string, number[]>();

export function markStartupMilestone(name: string): void {
  if (!name || startupMilestones.has(name)) return;

  const elapsed = now();
  startupMilestones.set(name, elapsed);
  try {
    globalThis.performance?.mark?.(`nya:${name}`);
  } catch {
    // Performance marks are optional diagnostics.
  }
}

export function beginEditorInput(mode: EditorPerformanceMode): void {
  inputStarts.set(mode, now());
}

export function commitEditorInput(mode: EditorPerformanceMode): void {
  const startedAt = inputStarts.get(mode);
  inputStarts.delete(mode);
  if (startedAt === undefined) return;

  const committedAt = now();
  if (committedAt - startedAt > MAX_INPUT_SAMPLE_AGE_MS) return;

  pushSample(inputSamples[mode].commit, committedAt - startedAt);
  scheduleFrame(() => {
    pushSample(inputSamples[mode].nextFrame, now() - startedAt);
  });
}

export function recordPerformanceDuration(name: string, durationMs: number): void {
  if (!name || !Number.isFinite(durationMs) || durationMs < 0) return;

  const samples = operationSamples.get(name) ?? [];
  pushSample(samples, durationMs);
  operationSamples.set(name, samples);
}

export function measurePerformance<T>(name: string, run: () => T): T {
  const startedAt = now();
  try {
    return run();
  } finally {
    recordPerformanceDuration(name, now() - startedAt);
  }
}

export async function measurePerformanceAsync<T>(name: string, run: () => Promise<T>): Promise<T> {
  const startedAt = now();
  try {
    return await run();
  } finally {
    recordPerformanceDuration(name, now() - startedAt);
  }
}

export function performanceDiagnosticsSnapshot(): PerformanceDiagnosticsSnapshot {
  const operations: Record<string, PerformanceSampleSummary> = {};
  for (const [name, samples] of operationSamples) operations[name] = summarizeSamples(samples);

  return {
    startupMs: Object.fromEntries(startupMilestones),
    input: {
      source: {
        commit: summarizeSamples(inputSamples.source.commit),
        nextFrame: summarizeSamples(inputSamples.source.nextFrame)
      },
      rich: {
        commit: summarizeSamples(inputSamples.rich.commit),
        nextFrame: summarizeSamples(inputSamples.rich.nextFrame)
      }
    },
    operations
  };
}

export function resetPerformanceDiagnostics(): void {
  startupMilestones.clear();
  inputStarts.clear();
  inputSamples.source.commit.length = 0;
  inputSamples.source.nextFrame.length = 0;
  inputSamples.rich.commit.length = 0;
  inputSamples.rich.nextFrame.length = 0;
  operationSamples.clear();
}

function summarizeSamples(samples: readonly number[]): PerformanceSampleSummary {
  if (!samples.length) {
    return {
      count: 0,
      latestMs: 0,
      maxMs: 0,
      p50Ms: 0,
      p95Ms: 0
    };
  }

  const sorted = [...samples].sort((left, right) => left - right);
  return {
    count: samples.length,
    latestMs: roundMs(samples[samples.length - 1]),
    maxMs: roundMs(sorted[sorted.length - 1]),
    p50Ms: roundMs(percentile(sorted, 0.5)),
    p95Ms: roundMs(percentile(sorted, 0.95))
  };
}

function percentile(sorted: readonly number[], quantile: number): number {
  const index = Math.max(0, Math.ceil(sorted.length * quantile) - 1);
  return sorted[index] ?? 0;
}

function pushSample(samples: number[], value: number): void {
  samples.push(value);
  if (samples.length > SAMPLE_LIMIT) samples.splice(0, samples.length - SAMPLE_LIMIT);
}

function scheduleFrame(callback: () => void): void {
  if (typeof globalThis.requestAnimationFrame === "function") {
    globalThis.requestAnimationFrame(callback);
    return;
  }
  globalThis.setTimeout(callback, 0);
}

function now(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}

const diagnostics: NyaPerformanceDiagnostics = {
  reset: resetPerformanceDiagnostics,
  snapshot: performanceDiagnosticsSnapshot
};

Object.defineProperty(globalThis, "__NYA_PERFORMANCE__", {
  configurable: true,
  value: diagnostics
});

markStartupMilestone("module-evaluated");

declare global {
  var __NYA_PERFORMANCE__: NyaPerformanceDiagnostics | undefined;
}
