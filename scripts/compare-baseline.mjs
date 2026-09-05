#!/usr/bin/env node

/**
 * Automated Baseline Regression Comparator
 * 
 * Evaluates current benchmark execution results against a locked baseline (e.g. BASELINE_v1.1.0.json)
 * using platform-stratified tolerances defined in REGRESSION_TOLERANCES.json.
 * 
 * Invariants: Zero external npm dependencies; pure Node 22 native modules.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function getPlatformConfig(tolerancesData, platform = process.platform) {
  const tolerances = tolerancesData.tolerances || tolerancesData;
  for (const [key, config] of Object.entries(tolerances)) {
    if (key === 'token_tolerance_percent') continue;
    const patterns = Array.isArray(config.platform_pattern) ? config.platform_pattern : [config.platform_pattern];
    if (patterns.includes(platform)) {
      return { name: key, ...config };
    }
  }
  // Fallback to linux/ubuntu
  return { name: 'ubuntu', ...tolerances.ubuntu };
}

export function compareBenchmarks(currentData, baselineData, tolerancesData, options = {}) {
  const platform = options.platform || process.platform;
  const platformConfig = getPlatformConfig(tolerancesData, platform);
  const maxLatencyPercent = platformConfig.latency_percent ?? 10;
  const maxTokenPercent = tolerancesData.token_tolerance_percent ?? platformConfig.tokens_percent ?? 2;

  const baselineMap = new Map();
  for (const s of baselineData.results || []) {
    baselineMap.set(s.scenarioId, s);
  }

  const comparisons = [];
  let regressionsCount = 0;

  for (const current of currentData.results || []) {
    const baseline = baselineMap.get(current.scenarioId);
    if (!baseline) {
      // New scenario not present in baseline (e.g. additions in newer versions)
      comparisons.push({
        scenarioId: current.scenarioId,
        baselineDuration: null,
        currentDuration: current.metrics?.durationMs ?? 0,
        latencyDeltaPercent: 0,
        baselineTokens: null,
        currentTokens: current.metrics?.tokensTotal ?? null,
        tokenDeltaPercent: 0,
        passed: current.passed,
        isNew: true,
        regressed: false,
        reason: 'NEW_SCENARIO'
      });
      continue;
    }

    const baseDuration = baseline.metrics?.durationMs ?? 0;
    const currDuration = current.metrics?.durationMs ?? 0;
    const latencyDeltaMs = currDuration - baseDuration;
    const latencyDeltaPercent = baseDuration > 0
      ? ((currDuration - baseDuration) / baseDuration) * 100
      : 0;

    const baseTokens = baseline.metrics?.tokensTotal ?? null;
    const currTokens = current.metrics?.tokensTotal ?? null;
    let tokenDeltaPercent = 0;
    if (baseTokens !== null && currTokens !== null && baseTokens > 0) {
      tokenDeltaPercent = ((currTokens - baseTokens) / baseTokens) * 100;
    }

    // Regressions:
    // 1. If scenario failed in current run
    // 2. If accuracy dropped
    // 3. If tokens increased beyond tolerance
    // 4. If latency increased beyond tolerance AND absolute delta > 1.0ms (avoid micro-jitter on 0.1ms runs)
    let regressed = false;
    const reasons = [];

    if (!current.passed) {
      regressed = true;
      reasons.push('FAILED');
    }

    if ((current.metrics?.accuracyPercent ?? 100) < (baseline.metrics?.accuracyPercent ?? 100)) {
      regressed = true;
      reasons.push(`ACCURACY_DROP (${baseline.metrics.accuracyPercent}% -> ${current.metrics.accuracyPercent}%)`);
    }

    if (tokenDeltaPercent > maxTokenPercent) {
      regressed = true;
      reasons.push(`TOKEN_GROWTH (+${tokenDeltaPercent.toFixed(1)}% > ${maxTokenPercent}%)`);
    }

    // Relative latency jitter threshold: scales with baseline to catch sub-ms regressions without micro-jitter noise
    const jitterFloor = platformConfig.jitter_floor_ms ?? 5.0;
    const minAbsoluteDeltaMs = Math.max(jitterFloor, Math.min(50.0, baseDuration * 0.20));
    if (latencyDeltaPercent > maxLatencyPercent && latencyDeltaMs > minAbsoluteDeltaMs) {
      regressed = true;
      reasons.push(`LATENCY_SPIKE (+${latencyDeltaPercent.toFixed(1)}% > ${maxLatencyPercent}%, +${latencyDeltaMs.toFixed(2)}ms > ${minAbsoluteDeltaMs.toFixed(2)}ms)`);
    }

    if (regressed) {
      regressionsCount++;
    }

    comparisons.push({
      scenarioId: current.scenarioId,
      baselineDuration: baseDuration,
      currentDuration: currDuration,
      latencyDeltaMs,
      latencyDeltaPercent,
      baselineTokens: baseTokens,
      currentTokens: currTokens,
      tokenDeltaPercent,
      passed: current.passed,
      isNew: false,
      regressed,
      reason: reasons.join(', ') || 'OK'
    });
  }

  return {
    platform: platformConfig.name,
    platformPattern: platform,
    maxLatencyPercent,
    maxTokenPercent,
    totalScenarios: comparisons.length,
    regressionsCount,
    ok: regressionsCount === 0,
    comparisons
  };
}

export function formatComparisonReport(result) {
  const lines = [
    `# Arbiter Benchmark Regression Comparison Report`,
    `**Platform Target:** ${result.platform} (${result.platformPattern}) | **Allowed Latency Var:** ±${result.maxLatencyPercent}% | **Allowed Token Var:** ±${result.maxTokenPercent}%`,
    `**Result:** ${result.ok ? '✅ WITHIN TOLERANCE (0 Regressions)' : `❌ REGRESSION DETECTED (${result.regressionsCount} violation(s))`}`,
    ``,
    `| Scenario | Base Latency | Curr Latency | Latency Δ | Base Tokens | Curr Tokens | Status |`,
    `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |`
  ];

  for (const c of result.comparisons) {
    const baseLat = c.baselineDuration !== null ? `${c.baselineDuration.toFixed(2)}ms` : 'N/A';
    const currLat = `${c.currentDuration.toFixed(2)}ms`;
    const latDelta = c.isNew ? 'NEW' : `${c.latencyDeltaPercent >= 0 ? '+' : ''}${c.latencyDeltaPercent.toFixed(1)}%`;
    const baseTok = c.baselineTokens !== null ? c.baselineTokens.toLocaleString() : 'N/A';
    const currTok = c.currentTokens !== null ? c.currentTokens.toLocaleString() : 'N/A';
    const status = c.regressed ? `❌ ${c.reason}` : (c.isNew ? '🆕 NEW' : '✅ PASS');

    lines.push(`| **${c.scenarioId}** | ${baseLat} | ${currLat} | ${latDelta} | ${baseTok} | ${currTok} | ${status} |`);
  }

  lines.push('');
  return lines.join('\n');
}

// CLI Execution
if (process.argv[1] && process.argv[1].endsWith('compare-baseline.mjs')) {
  const currentPath = resolve(process.argv[2] || 'results/latest.json');
  const defaultBaseline = existsSync(resolve('BASELINE_v1.2.0.json'))
    ? 'BASELINE_v1.2.0.json'
    : (existsSync(resolve('BASELINE_v1.1.0.json')) ? 'BASELINE_v1.1.0.json' : 'BASELINE_v1.0.0.json');
  const baselinePath = resolve(process.argv[3] || defaultBaseline);
  const tolerancesPath = resolve(process.argv[4] || 'REGRESSION_TOLERANCES.json');

  try {
    const currentData = JSON.parse(readFileSync(currentPath, 'utf8'));
    const baselineData = JSON.parse(readFileSync(baselinePath, 'utf8'));
    const tolerancesData = JSON.parse(readFileSync(tolerancesPath, 'utf8'));

    const comparison = compareBenchmarks(currentData, baselineData, tolerancesData);
    const report = formatComparisonReport(comparison);
    console.log(report);

    if (!comparison.ok) {
      console.error(`Baseline comparison failed with ${comparison.regressionsCount} regression(s).`);
      process.exit(1);
    } else {
      console.log(`Baseline comparison passed cleanly.`);
      process.exit(0);
    }
  } catch (err) {
    console.error(`Error executing baseline comparison:`, err.message);
    process.exit(1);
  }
}
