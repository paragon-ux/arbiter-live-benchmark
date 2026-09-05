import { describe, it } from 'node:test';
import assert from 'node:assert';
import { NaiveMutexAdapter } from '../src/harness/adapters/naiveMutex.js';
import { ProcessPoolAdapter } from '../src/harness/adapters/processPool.js';
import { DockerIsolatedAdapter } from '../src/harness/adapters/dockerIsolated.js';
import { BaseScenario } from '../src/harness/types.js';

describe('Comparative Adapters Suite (Tier 3)', () => {
  it('NaiveMutexAdapter detects lock contention on concurrent chaos scenarios', async () => {
    const adapter = new NaiveMutexAdapter();
    const scenario: BaseScenario = {
      id: '016-naive-mutex-contention',
      title: 'Naive Mutex Contention',
      description: 'Tests file mutex contention',
      targetRepo: 'targets/microservice-auth',
      mode: 'naive_mutex',
      concurrency: 4
    };

    const res = await adapter.execute(scenario);
    assert.strictEqual(res.tier, 'naive_mutex');
    assert.strictEqual(res.metrics.worktreesProvisioned, 0);
    assert.strictEqual(res.metrics.worktreesIsolated, false);
    assert.strictEqual(res.metrics.lockContentionCount! > 0, true);
    assert.strictEqual(res.metrics.mainBranchValid, false);
  });

  it('ProcessPoolAdapter measures pool dispatch overhead without worktree isolation', async () => {
    const adapter = new ProcessPoolAdapter();
    const scenario: BaseScenario = {
      id: '003-parallel-no-isolation',
      title: 'Parallel No Isolation',
      description: 'Tests process pool on shared checkout',
      targetRepo: 'targets/microservice-auth',
      mode: 'process_pool',
      concurrency: 3
    };

    const res = await adapter.execute(scenario);
    assert.strictEqual(res.tier, 'process_pool');
    assert.strictEqual(res.metrics.worktreesProvisioned, 0);
    assert.strictEqual(res.metrics.worktreesIsolated, false);
    assert.strictEqual(res.metrics.mainBranchValid, false);
  });

  it('DockerIsolatedAdapter measures container initialization latency overhead', async () => {
    const adapter = new DockerIsolatedAdapter();
    const scenario: BaseScenario = {
      id: '015-docker-isolated-overhead',
      title: 'Docker Overhead',
      description: 'Tests container lifecycle latency',
      targetRepo: 'targets/microservice-auth',
      mode: 'docker',
      concurrency: 3
    };

    const res = await adapter.execute(scenario);
    assert.strictEqual(res.tier, 'docker');
    if (res.metrics.details?.dockerDaemonAvailable) {
      assert.strictEqual(res.metrics.worktreesIsolated, true);
      assert.strictEqual(res.metrics.containerStartupMs! > 100, true);
      assert.strictEqual(res.metrics.overheadRatio! >= 1, true);
      assert.strictEqual(res.passed, true);
    } else {
      assert.strictEqual(res.passed, false);
      assert.match(res.error || '', /Docker daemon unreachable/);
    }
  });
});
