import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BenchmarkOrchestrator } from '../src/harness/orchestrator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scenariosDir = path.resolve(__dirname, '../../scenarios');

describe('BenchmarkOrchestrator Suite', () => {
  it('loads all 22 scenario files from scenarios directory', () => {
    const orchestrator = new BenchmarkOrchestrator();
    const scenarios = orchestrator.loadScenarios(scenariosDir);
    assert.equal(scenarios.length, 22);
    const ids = scenarios.map(s => s.id);
    assert.ok(ids.includes('001-single-agent-cold'));
    assert.ok(ids.includes('004-parallel-arbiter'));
    assert.ok(ids.includes('008-agent-semantic-correctness'));
    assert.ok(ids.includes('014-disk-full-recovery'));
    assert.ok(ids.includes('015-docker-isolated-overhead'));
    assert.ok(ids.includes('018-cross-repo-workspace-dag'));
    assert.ok(ids.includes('019-n-way-merge-conflicts'));
    assert.ok(ids.includes('020-concurrent-main-drift'));
    assert.ok(ids.includes('021-mcp-protocol-resilience'));
    assert.ok(ids.includes('022-watchdog-heartbeat-stale-reclaim'));
  });

  it('filters scenarios by scenarioId when specified', () => {
    const orchestrator = new BenchmarkOrchestrator();
    const scenarios = orchestrator.loadScenarios(scenariosDir, '004-parallel-arbiter');
    assert.equal(scenarios.length, 1);
    assert.equal(scenarios[0].id, '004-parallel-arbiter');
  });

  it('executes suite and aggregates summary metrics', async () => {
    const orchestrator = new BenchmarkOrchestrator();
    const scenarios = orchestrator.loadScenarios(scenariosDir, '001-single-agent-cold');
    const summary = await orchestrator.runSuite(scenarios, 'subprocess_mcp');

    assert.equal(summary.totalScenarios, 1);
    assert.equal(summary.passedScenarios, 1);
    assert.equal(summary.failedScenarios, 0);
    assert.ok(summary.totalDurationMs >= 0);
    assert.ok(summary.heapUsedMb > 0);
    assert.equal(summary.tier, 'subprocess_mcp');
  });

  it('executes Tier 3 comparative adapter via orchestrator', async () => {
    const orchestrator = new BenchmarkOrchestrator();
    const scenarios = orchestrator.loadScenarios(scenariosDir, '015-docker-isolated-overhead');
    const summary = await orchestrator.runSuite(scenarios, 'docker');

    assert.equal(summary.totalScenarios, 1);
    assert.equal(summary.tier, 'docker');
    assert.equal(summary.results[0].tier, 'docker');
  });

  it('executes multi-trial suite and aggregates statistical distributions', async () => {
    const orchestrator = new BenchmarkOrchestrator();
    const scenarios = orchestrator.loadScenarios(scenariosDir, '002-single-agent-waymark');
    const summary = await orchestrator.runSuite(scenarios, 'subprocess_mcp', 2);

    assert.equal(summary.trials, 2);
    assert.equal(summary.passedScenarios, 1);
    const result = summary.results[0];
    assert.ok(result.stats);
    assert.equal(result.stats.trials, 2);
    assert.ok(result.stats.medianDurationMs >= 0);
  });
});
