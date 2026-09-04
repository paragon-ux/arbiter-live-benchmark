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
      const content = fs.readFileSync(path.join(scenariosDir, f), 'utf8').replace(/^\uFEFF/, '');
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
    options: { verbose?: boolean; timeoutMs?: number } = {}
  ): Promise<BenchmarkSummary> {
    const startTime = performance.now();
    const results: ScenarioResult[] = [];

    for (const scenario of scenarios) {
      const trialDurations: number[] = [];
      const trialHistory: { trialIndex: number; durationMs: number; passed: boolean }[] = [];
      let finalResult: ScenarioResult | undefined;

      for (let t = 0; t < trials; t++) {
        if (options.verbose) {
          const nowIso = new Date().toISOString();
          console.log(`[TRACE] [${nowIso}] Scenario: ${scenario.id} | Tier: ${tier} | Trial: ${t + 1}/${trials}`);
        }

        const scenarioTimeout = (scenario.timeoutMs as number) || options.timeoutMs || 120_000;
        let timer: NodeJS.Timeout | undefined;
        const timeoutPromise = new Promise<ScenarioResult>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`Scenario ${scenario.id} timed out after ${scenarioTimeout}ms`)), scenarioTimeout);
        });

        const executeAdapter = async (): Promise<ScenarioResult> => {
          if (tier === 'agy') return this.agyAdapter.execute(scenario);
          if (tier === 'subprocess_mcp') return this.subprocessMcpAdapter.execute(scenario);
          if (tier === 'naive_mutex') return this.naiveMutexAdapter.execute(scenario);
          if (tier === 'process_pool') return this.processPoolAdapter.execute(scenario);
          if (tier === 'docker') return this.dockerIsolatedAdapter.execute(scenario);
          return this.deterministicAdapter.execute(scenario);
        };

        let currentResult: ScenarioResult;
        try {
          currentResult = await Promise.race([executeAdapter(), timeoutPromise]);
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          currentResult = {
            scenarioId: scenario.id,
            title: scenario.title,
            tier,
            passed: false,
            metrics: {
              durationMs: scenarioTimeout,
              tokensTotal: 0,
              conflictsDetected: 0,
              conflictsResolved: 0,
              mainBranchValid: false,
              accuracyPercent: 0,
              details: { error: errorMsg }
            },
            error: errorMsg
          };
        } finally {
          if (timer) clearTimeout(timer);
        }

        trialDurations.push(currentResult.metrics.durationMs);
        trialHistory.push({
          trialIndex: t + 1,
          durationMs: currentResult.metrics.durationMs,
          passed: currentResult.passed
        });

        if (!finalResult || (t === trials - 1)) {
          finalResult = currentResult;
        }
      }

      if (finalResult) {
        finalResult.rawDurationMs = finalResult.metrics.durationMs;
        finalResult.trialHistory = trialHistory;
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
