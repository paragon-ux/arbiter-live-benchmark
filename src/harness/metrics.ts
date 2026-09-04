import { ScenarioMetrics, StatisticalMetrics } from './types.js';

export class MetricsCollector {
  private startTime = 0;
  private metrics: ScenarioMetrics = {
    durationMs: 0,
    tokensTotal: 0,
    conflictsDetected: 0,
    conflictsResolved: 0,
    mainBranchValid: true,
    accuracyPercent: 100,
    details: {}
  };

  start(): void {
    this.startTime = performance.now();
  }

  addTokens(count: number): void {
    this.metrics.tokensTotal += count;
  }

  addTokensFromText(text: string): void {
    // Weighted tokenization heuristic (3.4 chars/token for code ASTs, braces, indentations)
    const tokens = Math.ceil(text.length / 3.4);
    this.metrics.tokensTotal += tokens;
  }

  recordConflict(resolved = false): void {
    this.metrics.conflictsDetected++;
    if (resolved) this.metrics.conflictsResolved++;
  }

  setMainValidity(valid: boolean): void {
    this.metrics.mainBranchValid = valid;
  }

  setAccuracy(percent: number): void {
    this.metrics.accuracyPercent = percent;
  }

  setDetail(key: string, value: unknown): void {
    this.metrics.details[key] = value;
  }

  finish(): ScenarioMetrics {
    this.metrics.durationMs = Math.round((performance.now() - this.startTime) * 100) / 100;
    return { ...this.metrics };
  }
}

export function computeStatisticalMetrics(durations: number[]): StatisticalMetrics {
  const n = durations.length;
  if (n === 0) {
    return {
      trials: 0,
      medianDurationMs: 0,
      meanDurationMs: 0,
      stddevDurationMs: 0,
      p95DurationMs: 0,
      p99DurationMs: 0,
      cvDuration: 0,
      trialDurations: []
    };
  }

  const sorted = [...durations].sort((a, b) => a - b);
  const mean = sorted.reduce((sum, d) => sum + d, 0) / n;

  const variance = n > 1
    ? sorted.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / (n - 1)
    : 0;
  const stddev = Math.sqrt(variance);

  const p50 = getPercentile(sorted, 50);
  const p95 = getPercentile(sorted, 95);
  const p99 = getPercentile(sorted, 99);
  const cv = mean > 0 ? stddev / mean : 0;

  return {
    trials: n,
    medianDurationMs: Math.round(p50 * 100) / 100,
    meanDurationMs: Math.round(mean * 100) / 100,
    stddevDurationMs: Math.round(stddev * 100) / 100,
    p95DurationMs: Math.round(p95 * 100) / 100,
    p99DurationMs: Math.round(p99 * 100) / 100,
    cvDuration: Math.round(cv * 1000) / 1000,
    trialDurations: sorted.map(d => Math.round(d * 100) / 100)
  };
}

function getPercentile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0];
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function estimateMemoryUsage(): { heapUsedMb: number; rssMb: number } {
  const mem = process.memoryUsage();
  return {
    heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
    rssMb: Math.round((mem.rss / 1024 / 1024) * 100) / 100
  };
}
