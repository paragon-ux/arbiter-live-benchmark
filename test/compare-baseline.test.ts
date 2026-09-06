import { describe, it } from 'node:test';
import assert from 'node:assert';
// @ts-ignore
import { compareBenchmarks } from '../../scripts/compare-baseline.mjs';

describe('CompareBaseline Suite', () => {
  const tolerances = {
    version: '1.1.0',
    tolerances: {
      ubuntu: { platform_pattern: 'linux', latency_percent: 5, tokens_percent: 2 },
      windows: { platform_pattern: 'win32', latency_percent: 20, tokens_percent: 2 }
    }
  };

  it('passes when metrics are identical to baseline', () => {
    const baseline = {
      results: [
        { scenarioId: '001-single-agent-cold', passed: true, metrics: { durationMs: 1.0, tokensTotal: 1000, accuracyPercent: 100 } }
      ]
    };
    const current = {
      results: [
        { scenarioId: '001-single-agent-cold', passed: true, metrics: { durationMs: 1.0, tokensTotal: 1000, accuracyPercent: 100 } }
      ]
    };

    const res = compareBenchmarks(current, baseline, tolerances, { platform: 'win32' });
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.regressionsCount, 0);
  });

  it('flags regression when token count grows beyond tolerance', () => {
    const baseline = {
      results: [
        { scenarioId: '001-single-agent-cold', passed: true, metrics: { durationMs: 1.0, tokensTotal: 1000, accuracyPercent: 100 } }
      ]
    };
    const current = {
      results: [
        // 1000 -> 1100 (+10% > 2% tolerance)
        { scenarioId: '001-single-agent-cold', passed: true, metrics: { durationMs: 1.0, tokensTotal: 1100, accuracyPercent: 100 } }
      ]
    };

    const res = compareBenchmarks(current, baseline, tolerances, { platform: 'win32' });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.regressionsCount, 1);
    assert.strictEqual(res.comparisons[0].regressed, true);
  });

  it('marks new scenarios as non-regressing new additions', () => {
    const baseline = { results: [] };
    const current = {
      results: [
        { scenarioId: '015-docker-isolated-overhead', passed: true, metrics: { durationMs: 2.0, tokensTotal: 2100 } }
      ]
    };

    const res = compareBenchmarks(current, baseline, tolerances, { platform: 'win32' });
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.comparisons[0].isNew, true);
  });

  it('does not treat an unavailable capability as a regression', () => {
    const baseline = {
      results: [
        { scenarioId: '015-docker-isolated-overhead', passed: true, metrics: { durationMs: 100.0, tokensTotal: 0, accuracyPercent: 100 } }
      ]
    };
    const current = {
      results: [
        { scenarioId: '015-docker-isolated-overhead', passed: false, skipped: true, metrics: { durationMs: 4.0, tokensTotal: 0, accuracyPercent: 0 } }
      ]
    };

    const res = compareBenchmarks(current, baseline, tolerances, { platform: 'win32' });
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.regressionsCount, 0);
    assert.strictEqual(res.comparisons[0].reason, 'SKIPPED_CAPABILITY_UNAVAILABLE');
  });
});
