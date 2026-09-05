import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BenchmarkOrchestrator } from '../harness/orchestrator.js';
import { formatMarkdownReport } from '../harness/reporter.js';
import { ExecutionTier } from '../harness/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../..');

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let scenarioId: string | undefined;
  let tier: ExecutionTier = 'subprocess_mcp';
  let trials = 1;
  let emitJson = false;
  let verbose = false;
  let compareBaseline: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--scenario' && args[i + 1]) {
      scenarioId = args[++i];
    } else if (arg === '--mode' && args[i + 1]) {
      const m = args[++i];
      if (m === 'naive_mutex') tier = 'naive_mutex';
      else if (m === 'process_pool') tier = 'process_pool';
      else if (m === 'docker') tier = 'docker';
      else tier = 'subprocess_mcp';
    } else if (arg === '--trials' && args[i + 1]) {
      trials = Math.max(1, parseInt(args[++i], 10) || 1);
    } else if (arg === '--verbose' || arg === '-v') {
      verbose = true;
    } else if (arg === '--compare') {
      compareBaseline = (args[i + 1] && !args[i + 1].startsWith('-')) ? args[++i] : path.join(rootDir, 'BASELINE_v1.2.0.json');
    } else if (arg === '--json') {
      emitJson = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: arbiter-live-benchmark [options]

Options:
  --all              Run all benchmark scenarios
  --scenario <id>    Run a specific scenario (e.g. 015-docker-isolated-overhead)
  --mode <mode>      Execution tier: 'deterministic' (default), 'subprocess_mcp', 'agy',
                     'naive_mutex', 'process_pool', or 'docker'
  --trials <N>       Number of iterations to run for statistical aggregation (default: 1)
  --verbose, -v      Output timestamped execution trace logs
  --compare [path]   Compare execution results against baseline JSON (default: BASELINE_v1.2.0.json)
  --json             Output results in raw JSON format
  --help, -h         Show help text
`);
      process.exit(0);
    }
  }

  const scenariosDir = path.join(rootDir, 'scenarios');
  const orchestrator = new BenchmarkOrchestrator();
  const scenarios = orchestrator.loadScenarios(scenariosDir, scenarioId);

  if (scenarios.length === 0) {
    console.error(`Error: No scenarios found matching: ${scenarioId || 'all'}`);
    process.exit(1);
  }

  const summary = await orchestrator.runSuite(scenarios, tier, trials, { verbose });
  summary.$schema = 'https://json-schema.org/draft/2020-12/schema';

  // Write machine readable results
  const resultsDir = path.join(rootDir, 'results');
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.writeFileSync(path.join(resultsDir, 'latest.json'), JSON.stringify(summary, null, 2) + '\n');

  // Append to historical time-series tracking log
  const historicalEntry = {
    timestamp: summary.timestamp,
    commit: process.env.GITHUB_SHA || 'local',
    platform: summary.platform,
    nodeVersion: summary.nodeVersion,
    tier: summary.tier,
    totalScenarios: summary.totalScenarios,
    passedScenarios: summary.passedScenarios,
    failedScenarios: summary.failedScenarios,
    totalDurationMs: summary.totalDurationMs,
    scenarios: summary.results.map(r => ({
      id: r.scenarioId,
      durationMs: r.metrics.durationMs,
      tokens: r.metrics.tokensTotal,
      passed: r.passed
    }))
  };
  fs.appendFileSync(path.join(resultsDir, 'historical.jsonl'), JSON.stringify(historicalEntry) + '\n');

  if (emitJson) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    const report = formatMarkdownReport(summary);
    console.log(report);
    fs.writeFileSync(path.join(resultsDir, 'latest.md'), report + '\n');
  }

  if (compareBaseline) {
    try {
      const { pathToFileURL } = await import('node:url');
      const scriptUrl = pathToFileURL(path.join(rootDir, 'scripts/compare-baseline.mjs')).href;
      const { compareBenchmarks, formatComparisonReport } = await import(scriptUrl);
      const baselineData = JSON.parse(fs.readFileSync(compareBaseline, 'utf8'));
      const tolerancesData = JSON.parse(fs.readFileSync(path.join(rootDir, 'REGRESSION_TOLERANCES.json'), 'utf8'));
      const comparison = compareBenchmarks(summary, baselineData, tolerancesData);
      console.log('\n' + formatComparisonReport(comparison));
      if (!comparison.ok) {
        process.exit(1);
      }
    } catch (cmpErr: unknown) {
      const msg = cmpErr instanceof Error ? cmpErr.message : String(cmpErr);
      console.error('Failed to execute baseline comparison:', msg);
      process.exit(1);
    }
  }

  if (summary.failedScenarios > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal benchmark execution error:', err);
  process.exit(1);
});
