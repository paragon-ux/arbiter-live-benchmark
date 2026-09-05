import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ArbiterDatabase } from 'arbiter';
import { SubprocessMcpAdapter, spawnWorkerSubprocess } from '../src/harness/adapters/subprocessMcp.js';
import { createTempGitRepo } from '../src/harness/gitHelper.js';

describe('Live Subprocess Worker Suite', () => {
  const adapter = new SubprocessMcpAdapter();

  it('spawns a live worker OS child process with real PID and verifies execution', async () => {
    const { repoPath, cleanup } = createTempGitRepo();
    try {
      const dbPath = path.join(repoPath, '.arbiter', 'arbiter.db');
      const db = new ArbiterDatabase(dbPath);
      db.insertTask({
        id: 'test-task-1',
        title: 'Test Task',
        description: 'Test worker execution',
        baseBranch: 'main',
        branch: 'arbiter/test-task-1',
        status: 'READY',
        worktreePath: null,
        assignedWorkerId: null,
        waymarkTrajectoryId: null,
        resultAnswer: null,
        errorMessage: null,
      });
      db.close();

      const output = await spawnWorkerSubprocess({
        workerId: 'test-worker-1',
        repoPath,
        mode: 'cli',
      });

      assert.ok(output.pid > 0, 'Worker must have real OS PID');
      assert.equal(output.workerId, 'test-worker-1');
      assert.equal(output.success, true, 'Worker process must succeed');
      assert.ok(output.tokensMeasured >= 0);
    } finally {
      cleanup();
    }
  });

  it('fails closed when worker process encounters an error', async () => {
    const { repoPath, cleanup } = createTempGitRepo();
    try {
      const output = await spawnWorkerSubprocess({
        workerId: 'test-worker-err',
        repoPath,
        mode: 'cli',
        shouldFail: true,
        failError: 'Simulated worker failure',
      });

      assert.equal(output.success, false, 'Must fail closed');
      assert.ok(output.error || output.stderr, 'Must report error or stderr');
    } finally {
      cleanup();
    }
  });

  it('runs 001-single-agent-cold with live token counting', async () => {
    const res = await adapter.execute({
      id: '001-single-agent-cold',
      title: 'Single Agent Cold',
      description: 'Test cold exploration with live token counts',
      targetRepo: 'targets/microservice-auth',
      mode: 'cold',
    });

    assert.ok(res.passed);
    assert.equal(res.tier, 'subprocess_mcp');
    assert.ok(res.metrics.tokensTotal > 0, 'Must have real counted tokens');
    assert.equal(res.metrics.details?.compactionRecoveryType, 'COLD_REREAD');
  });

  it('runs 002-single-agent-waymark with live Waymark integration', async () => {
    const res = await adapter.execute({
      id: '002-single-agent-waymark',
      title: 'Single Agent Waymark',
      description: 'Test Waymark continuity with live worker subprocess',
      targetRepo: 'targets/microservice-auth',
      mode: 'waymark',
    });

    assert.ok(res.passed);
    assert.equal(res.tier, 'subprocess_mcp');
    assert.ok(res.metrics.tokensTotal > 0);
  });

  it('runs 003-parallel-no-isolation capturing unisolated git state', async () => {
    const res = await adapter.execute({
      id: '003-parallel-no-isolation',
      title: 'Parallel Chaos',
      description: 'Test unisolated git state',
      targetRepo: 'targets/microservice-auth',
      mode: 'unisolated_chaos',
    });

    assert.ok(res.passed);
    assert.equal(res.metrics.mainBranchValid, false);
  });

  it('runs 004-parallel-arbiter with live isolated worktrees', async () => {
    const res = await adapter.execute({
      id: '004-parallel-arbiter',
      title: 'Parallel Arbiter',
      description: 'Test 3 isolated worktrees',
      targetRepo: 'targets/microservice-auth',
      mode: 'arbiter_swarm',
    });

    assert.ok(res.passed);
    assert.equal(res.metrics.worktreesProvisioned, 3);
    assert.equal(res.metrics.worktreesIsolated, true);
    assert.equal(res.metrics.mainBranchValid, true);
  });

  it('runs 005-dag-dependencies sorting topological tasks live', async () => {
    const res = await adapter.execute({
      id: '005-dag-dependencies',
      title: 'DAG Dependencies',
      description: 'Test DAG execution',
      targetRepo: 'targets/data-pipeline',
      mode: 'dag_scheduling',
    });

    assert.ok(res.passed);
    assert.equal(res.metrics.details?.topologicalSortValid, true);
  });

  it('runs 006-conflict-quarantine rolling back conflict live', async () => {
    const res = await adapter.execute({
      id: '006-conflict-quarantine',
      title: 'Conflict Quarantine',
      description: 'Test conflict detection and rollback',
      targetRepo: 'targets/microservice-auth',
      mode: 'conflict_quarantine',
    });

    assert.ok(res.passed);
    assert.equal(res.metrics.conflictsDetected, 1);
    assert.equal(res.metrics.conflictsResolved, 1);
    assert.equal(res.metrics.mainBranchValid, true);
  });

  it('runs 007-watchdog-dead-worker reclaiming task from dead PID', async () => {
    const res = await adapter.execute({
      id: '007-watchdog-dead-worker',
      title: 'Watchdog Dead Worker',
      description: 'Test dead worker lease reclamation',
      targetRepo: 'targets/microservice-auth',
      mode: 'watchdog_recovery',
    });

    assert.ok(res.passed);
    assert.equal(res.metrics.details?.pidAlive, false);
    assert.equal(res.metrics.details?.leaseReclaimed, true);
  });

  it('runs 008-agent-semantic-correctness with real compiler and test runner', async () => {
    const res = await adapter.execute({
      id: '008-agent-semantic-correctness',
      title: 'Semantic Correctness',
      description: 'Live compiler typecheck and unit test execution',
      targetRepo: 'targets/microservice-auth',
      mode: 'refactor',
    });

    assert.ok(res.passed);
    assert.ok(res.metrics.accuracyPercent > 0, 'Accuracy must be calculated from real test results');
    assert.equal(res.metrics.details?.typeErrors, 0);
  });
});



