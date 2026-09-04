import fs from 'node:fs';
import path from 'node:path';
import { BaseScenario, BenchmarkSummary, ExecutionTier, ScenarioResult } from './types.js';
import { DeterministicAdapter } from './adapters/deterministic.js';
import { SubprocessMcpAdapter } from './adapters/subprocessMcp.js';
import { AgyRunnerAdapter } from './adapters/agyRunner.js';
import { NaiveMutexAdapter } from './adapters/naiveMutex.js';
import { ProcessPoolAdapter } from './adapters/processPool.js';
import { DockerIsolatedAdapter } from './adapters/dockerIsolated.js';
import { computeStatisticalMetrics, estimateMemoryUsage } from './metrics.js';

export class BenchmarkOrchestrator {
  private deterministicAdapter = new DeterministicAdapter();
  private subprocessMcpAdapter = new SubprocessMcpAdapter();
  private agyAdapter = new AgyRunnerAdapter();
  private naiveMutexAdapter = new NaiveMutexAdapter();
  private processPoolAdapter = new ProcessPoolAdapter();
  private dockerIsolatedAdapter = new DockerIsolatedAdapter();

  loadScenarios(scenariosDir: string, scenarioId?: string): BaseScenario[] {
    const files = fs.readdirSync(scenariosDir).filter(f => f.endsWith('.json')).sort();
    const scenarios: BaseScenario[] = [];

    for (const f of files) {
      const content = fs.readFileSync(path.join(scenariosDir, f), 'utf8');
      const parsed: BaseScenario = JSON.parse(content);
      if (!scenarioId || parsed.id === scenarioId) {
        scenarios.push(parsed);
      }
    }

    return scenarios;
  }

  async runSuite(
    scenarios: BaseScenario[],
    tier: ExecutionTier = 'deterministic',
    trials: number = 1,
    options: { verbose?: boolean } = {}
  ): Promise<BenchmarkSummary> {
    const startTime = performance.now();
    const results: ScenarioResult[] = [];

    for (const scenario of scenarios) {
      const trialDurations: number[] = [];
      let finalResult: ScenarioResult | undefined;

      for (let t = 0; t < trials; t++) {
        if (options.verbose) {
          const nowIso = new Date().toISOString();
          console.log(`[TRACE] [${nowIso}] Scenario: ${scenario.id} | Tier: ${tier} | Trial: ${t + 1}/${trials}`);
        }

        let currentResult: ScenarioResult;
        if (tier === 'agy') {
          currentResult = await this.agyAdapter.execute(scenario);
        } else if (tier === 'subprocess_mcp') {
          currentResult = await this.subprocessMcpAdapter.execute(scenario);
        } else if (tier === 'naive_mutex') {
          currentResult = await this.naiveMutexAdapter.execute(scenario);
        } else if (tier === 'process_pool') {
          currentResult = await this.processPoolAdapter.execute(scenario);
        } else if (tier === 'docker') {
          currentResult = await this.dockerIsolatedAdapter.execute(scenario);
        } else {
          currentResult = await this.deterministicAdapter.execute(scenario);
        }

        trialDurations.push(currentResult.metrics.durationMs);
        if (!finalResult || (t === trials - 1)) {
          finalResult = currentResult;
        }
      }

      if (finalResult) {
        if (trials > 1) {
          finalResult.stats = computeStatisticalMetrics(trialDurations);
          finalResult.metrics.durationMs = finalResult.stats.medianDurationMs;
        }
        results.push(finalResult);
      }
    }

    const totalDuration = performance.now() - startTime;
    const passedCount = results.filter(r => r.passed).length;
    const mem = estimateMemoryUsage();

    let totalSavings = 0;
    let savingsCount = 0;
    for (const r of results) {
      if (r.metrics.continuitySavingsPercent !== undefined && r.metrics.continuitySavingsPercent > 0) {
        totalSavings += r.metrics.continuitySavingsPercent;
        savingsCount++;
      }
    }
    const avgSavings = savingsCount > 0 ? Math.round(totalSavings / savingsCount) : 0;

    return {
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      platform: `${process.platform} (${process.arch})`,
      tier,
      trials,
      totalScenarios: scenarios.length,
      passedScenarios: passedCount,
      failedScenarios: scenarios.length - passedCount,
      totalDurationMs: Math.round(totalDuration * 100) / 100,
      averageSavingsPercent: avgSavings,
      heapUsedMb: mem.heapUsedMb,
      results
    };
  }
}
