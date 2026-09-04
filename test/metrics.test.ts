import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MetricsCollector, estimateMemoryUsage, computeStatisticalMetrics } from '../src/harness/metrics.js';

describe('MetricsCollector Suite', () => {
  it('accumulates tokens and computes duration accurately', async () => {
    const collector = new MetricsCollector();
    collector.start();

    collector.addTokens(500);
    collector.addTokensFromText('A short phrase for token estimation'); // 36 chars / 3.4 -> 11 tokens
    collector.recordConflict(true);
    collector.setAccuracy(95);

    // Artificial delay
    await new Promise(r => setTimeout(r, 10));

    const metrics = collector.finish();
    assert.ok(metrics.durationMs >= 8);
    assert.equal(metrics.tokensTotal, 511);
    assert.equal(metrics.conflictsDetected, 1);
    assert.equal(metrics.conflictsResolved, 1);
    assert.equal(metrics.accuracyPercent, 95);
  });

  it('estimates process memory usage within reasonable bounds', () => {
    const mem = estimateMemoryUsage();
    assert.ok(mem.heapUsedMb > 0);
    assert.ok(mem.rssMb > 0);
    assert.ok(mem.rssMb >= mem.heapUsedMb);
  });

  it('computes statistical distributions across multi-trial samples', () => {
    const durations = [1.2, 1.4, 1.5, 1.8, 2.1, 2.5, 3.0, 3.2, 3.8, 4.5];
    const stats = computeStatisticalMetrics(durations);

    assert.equal(stats.trials, 10);
    assert.ok(stats.medianDurationMs > 0);
    assert.ok(stats.meanDurationMs > 0);
    assert.ok(stats.stddevDurationMs > 0);
    assert.ok(stats.p95DurationMs >= stats.medianDurationMs);
    assert.ok(stats.cvDuration > 0);
  });
});
