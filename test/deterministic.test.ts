import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DeterministicAdapter, SeededRNG } from '../src/harness/adapters/deterministic.js';

describe('DeterministicAdapter Suite', () => {
  const adapter = new DeterministicAdapter();

  it('guarantees byte-identical PRNG determinism across consecutive runs', () => {
    const rng1 = new SeededRNG(0x6D2B79F5);
    const rng2 = new SeededRNG(0x6D2B79F5);

    for (let i = 0; i < 20; i++) {
      assert.equal(rng1.next(), rng2.next());
      assert.equal(rng1.nextInt(1, 100), rng2.nextInt(1, 100));
    }
  });

  it('simulates 001-single-agent-cold with heavy token re-read', async () => {
    const res = await adapter.execute({
      id: '001-single-agent-cold',
      title: 'Single Agent Cold',
      description: 'Test',
      targetRepo: 'targets/microservice-auth',
      mode: 'cold'
    });

    assert.ok(res.passed);
    assert.ok(res.metrics.tokensTotal >= 6000);
    assert.equal(res.metrics.details.compactionRecoveryType, 'COLD_REREAD');
  });

  it('simulates 002-single-agent-waymark with bounded resume tokens', async () => {
    const res = await adapter.execute({
      id: '002-single-agent-waymark',
      title: 'Single Agent Waymark',
      description: 'Test',
      targetRepo: 'targets/microservice-auth',
      mode: 'waymark'
    });

    assert.ok(res.passed);
    assert.ok(res.metrics.tokensTotal <= 2200);
    assert.equal(res.metrics.waymarkResumeTokens, 180);
    assert.ok((res.metrics.continuitySavingsPercent || 0) >= 70);
  });

  it('simulates 003-parallel-no-isolation capturing corrupted main', async () => {
    const res = await adapter.execute({
      id: '003-parallel-no-isolation',
      title: 'Parallel Chaos',
      description: 'Test',
      targetRepo: 'targets/microservice-auth',
      mode: 'unisolated_chaos'
    });

    assert.ok(res.passed);
    assert.equal(res.metrics.mainBranchValid, false);
    assert.equal(res.metrics.conflictsDetected, 1);
    assert.equal(res.metrics.conflictsResolved, 0);
  });

  it('simulates 004-parallel-arbiter with 3 isolated worktrees', async () => {
    const res = await adapter.execute({
      id: '004-parallel-arbiter',
      title: 'Parallel Arbiter',
      description: 'Test',
      targetRepo: 'targets/microservice-auth',
      mode: 'arbiter_swarm'
    });

    assert.ok(res.passed);
    assert.equal(res.metrics.worktreesProvisioned, 3);
    assert.equal(res.metrics.worktreesIsolated, true);
    assert.equal(res.metrics.mainBranchValid, true);
  });

  it('simulates 005-dag-dependencies sorting 12 nodes without cycles', async () => {
    const res = await adapter.execute({
      id: '005-dag-dependencies',
      title: 'DAG Dependencies',
      description: 'Test',
      targetRepo: 'targets/data-pipeline',
      mode: 'dag_scheduling',
      dag: {
        tasks: [
          { id: 'T-1', deps: [] },
          { id: 'T-2', deps: ['T-1'] },
          { id: 'T-3', deps: ['T-2'] }
        ]
      }
    });

    assert.ok(res.passed);
    assert.equal(res.metrics.details.dagNodesResolved, 3);
    assert.equal(res.metrics.details.topologicalSortValid, true);
  });

  it('simulates 006-conflict-quarantine cleanly executing rollback', async () => {
    const res = await adapter.execute({
      id: '006-conflict-quarantine',
      title: 'Conflict Quarantine',
      description: 'Test',
      targetRepo: 'targets/microservice-auth',
      mode: 'conflict_quarantine'
    });

    assert.ok(res.passed);
    assert.equal(res.metrics.conflictsDetected, 1);
    assert.equal(res.metrics.conflictsResolved, 1);
    assert.equal(res.metrics.mainBranchValid, true);
    assert.equal(res.metrics.details.quarantineStatus, 'CONFLICT');
  });

  it('simulates 007-watchdog-dead-worker detecting dead PID and re-queuing', async () => {
    const res = await adapter.execute({
      id: '007-watchdog-dead-worker',
      title: 'Watchdog Dead Worker',
      description: 'Test',
      targetRepo: 'targets/microservice-auth',
      mode: 'watchdog_recovery'
    });

    assert.ok(res.passed);
    assert.equal(res.metrics.details.pidAlive, false);
    assert.equal(res.metrics.details.leaseReclaimed, true);
    assert.equal(res.metrics.details.taskResetStatus, 'READY');
  });

  it('simulates 008-agent-semantic-correctness verifying typecheck and unit tests', async () => {
    const res = await adapter.execute({
      id: '008-agent-semantic-correctness',
      title: 'Semantic Correctness',
      description: 'Test',
      targetRepo: 'targets/microservice-auth',
      mode: 'refactor'
    });

    assert.ok(res.passed);
    assert.equal(res.metrics.accuracyPercent, 100);
    assert.equal(res.metrics.details.typeErrors, 0);
    assert.equal(res.metrics.details.unitTestsPassed, 14);
  });

  it('simulates 009-parallel-10-workers stressing SQLite WAL write concurrency', async () => {
    const res = await adapter.execute({
      id: '009-parallel-10-workers',
      title: '10 Workers',
      description: 'Test',
      targetRepo: 'targets/microservice-auth',
      mode: 'parallel',
      workersCount: 10
    });

    assert.ok(res.passed);
    assert.equal(res.metrics.worktreesProvisioned, 10);
    assert.equal(res.metrics.mainBranchValid, true);
  });

  it('simulates 010-cyclic-dag-rejection detecting cycle in graph', async () => {
    const res = await adapter.execute({
      id: '010-cyclic-dag-rejection',
      title: 'Cyclic DAG Rejection',
      description: 'Test',
      targetRepo: 'targets/data-pipeline',
      mode: 'dag',
      dag: {
        tasks: [
          { id: 'task-A', deps: ['task-C'] },
          { id: 'task-B', deps: ['task-A'] },
          { id: 'task-C', deps: ['task-B'] }
        ]
      }
    });

    assert.ok(res.passed);
    assert.equal(res.metrics.details.cycleDetected, true);
    assert.equal(res.metrics.mainBranchValid, true);
  });

  it('simulates 011-concurrent-lease-collision handling atomic CAS and EAGAIN', async () => {
    const res = await adapter.execute({
      id: '011-concurrent-lease-collision',
      title: 'Lease Collision',
      description: 'Test',
      targetRepo: 'targets/microservice-auth',
      mode: 'lease'
    });

    assert.ok(res.passed);
    assert.equal(res.metrics.details.workerA_status, 'ACQUIRED');
    assert.equal(res.metrics.details.workerB_status, 'EAGAIN');
  });

  it('simulates 012-signal-interrupted-merge rolling back cleanly on SIGTERM', async () => {
    const res = await adapter.execute({
      id: '012-signal-interrupted-merge',
      title: 'Interrupted Merge',
      description: 'Test',
      targetRepo: 'targets/microservice-auth',
      mode: 'merge'
    });

    assert.ok(res.passed);
    assert.equal(res.metrics.mainBranchValid, true);
    assert.equal(res.metrics.details.signalCaught, 'SIGTERM');
  });

  it('simulates 013-waymark-multi-compaction maintaining stable SHA across cycles', async () => {
    const res = await adapter.execute({
      id: '013-waymark-multi-compaction',
      title: 'Multi Compaction',
      description: 'Test',
      targetRepo: 'targets/microservice-auth',
      mode: 'continuity'
    });

    assert.ok(res.passed);
    assert.ok((res.metrics.continuitySavingsPercent || 0) >= 75);
    assert.equal(res.metrics.details.hashStability, 'VERIFIED_IDENTICAL');
  });

  it('simulates 014-disk-full-recovery rolling back transaction on ENOSPC', async () => {
    const res = await adapter.execute({
      id: '014-disk-full-recovery',
      title: 'Disk Full',
      description: 'Test',
      targetRepo: 'targets/data-pipeline',
      mode: 'fault_injection'
    });

    assert.ok(res.passed);
    assert.equal(res.metrics.details.transactionRolledBack, true);
    assert.equal(res.metrics.details.orphanLocksRemaining, 0);
  });

  it('simulates 015-docker-isolated-overhead measuring container spinup latency', async () => {
    const res = await adapter.execute({
      id: '015-docker-isolated-overhead',
      title: 'Docker Overhead',
      description: 'Test',
      targetRepo: 'targets/microservice-auth',
      mode: 'docker_comparative'
    });

    assert.ok(res.passed);
    assert.equal(res.metrics.worktreesProvisioned, 3);
    assert.equal(res.metrics.worktreesIsolated, true);
    assert.ok(res.metrics.containerStartupMs! > 100);
    assert.ok(res.metrics.overheadRatio! > 10);
  });

  it('simulates 016-naive-mutex-contention reporting lock contention and corrupted main', async () => {
    const res = await adapter.execute({
      id: '016-naive-mutex-contention',
      title: 'Naive Mutex Contention',
      description: 'Test',
      targetRepo: 'targets/microservice-auth',
      mode: 'naive_mutex_comparative'
    });

    assert.ok(res.passed);
    assert.equal(res.metrics.worktreesIsolated, false);
    assert.equal(res.metrics.mainBranchValid, false);
    assert.equal(res.metrics.lockContentionCount, 8);
  });

  it('simulates 017-parallel-50-workers stressing SQLite WAL concurrency at scale', async () => {
    const res = await adapter.execute({
      id: '017-parallel-50-workers',
      title: 'Parallel 50 Workers',
      description: 'Test',
      targetRepo: 'targets/microservice-auth',
      mode: 'arbiter_swarm_50'
    });

    assert.ok(res.passed);
    assert.equal(res.metrics.worktreesProvisioned, 50);
    assert.equal(res.metrics.worktreesIsolated, true);
    assert.equal(res.metrics.mainBranchValid, true);
  });

  it('simulates 018-cross-repo-workspace-dag resolving monorepo package order', async () => {
    const res = await adapter.execute({
      id: '018-cross-repo-workspace-dag',
      title: 'Monorepo Workspace DAG',
      description: 'Test',
      targetRepo: 'targets/data-pipeline',
      mode: 'monorepo_dag'
    });

    assert.ok(res.passed);
    assert.equal(res.metrics.accuracyPercent, 100);
    assert.equal(res.metrics.details.topologicalResolution, 'KAHN_SORT_SUCCESS');
  });

  it('simulates 019-n-way-merge-conflicts cleanly merging orthogonal branches and quarantining conflicts', async () => {
    const res = await adapter.execute({
      id: '019-n-way-merge-conflicts',
      title: 'N-Way Merge Conflicts',
      description: 'Test',
      targetRepo: 'targets/microservice-auth',
      mode: 'n_way_merge_conflicts'
    });

    assert.ok(res.passed, 'Scenario 019 must pass');
    assert.equal(res.metrics.conflictsDetected, 3, 'Must detect 3 merge conflicts');
    assert.equal(res.metrics.conflictsResolved, 3, 'Must rollback and resolve 3 conflicts');
    assert.equal(res.metrics.mainBranchValid, true, 'Main branch must remain valid');
    assert.equal(res.metrics.details.contendingWorkers, 5);
    assert.equal(res.metrics.details.conflictsQuarantined, 3);
    assert.equal(res.metrics.details.mainBranchIntact, true);
  });

  it('simulates 020-concurrent-main-drift cleanly synchronizing upstream main commits', async () => {
    const res = await adapter.execute({
      id: '020-concurrent-main-drift',
      title: 'Concurrent Upstream Main Drift',
      description: 'Test',
      targetRepo: 'targets/microservice-auth',
      mode: 'concurrent_main_drift'
    });

    assert.ok(res.passed, 'Scenario 020 must pass');
    assert.equal(res.metrics.mainBranchValid, true, 'Main branch must remain valid');
    assert.equal(res.metrics.details.upstreamCommitsInjected, 1);
    assert.equal(res.metrics.details.mergeClean, true);
  });

  it('simulates 021-mcp-protocol-resilience exercising JSON-RPC tool calls', async () => {
    const res = await adapter.execute({
      id: '021-mcp-protocol-resilience',
      title: 'MCP Protocol Resilience',
      description: 'Test stdio JSON-RPC tool calling',
      targetRepo: 'targets/microservice-auth',
      mode: 'mcp_protocol'
    });

    assert.ok(res.passed, 'Scenario 021 must pass');
    assert.equal(res.metrics.mainBranchValid, true);
    assert.equal(res.metrics.details.protocolCompliant, true);
    assert.equal(res.metrics.details.toolCallsExecuted, 3);
  });

  it('simulates 022-watchdog-heartbeat-stale-reclaim recovering expired lease with alive PID', async () => {
    const res = await adapter.execute({
      id: '022-watchdog-heartbeat-stale-reclaim',
      title: 'Watchdog Stale Heartbeat Recovery',
      description: 'Test heartbeat expiration with alive PID',
      targetRepo: 'targets/microservice-auth',
      mode: 'stale_heartbeat'
    });

    assert.ok(res.passed, 'Scenario 022 must pass');
    assert.equal(res.metrics.details.workerPidAlive, true, 'Worker PID must still be alive');
    assert.equal(res.metrics.details.leaseExpired, true, 'Lease must be expired by watchdog');
    assert.equal(res.metrics.details.taskResetToReady, true, 'Task must be returned to READY');
    assert.equal(res.metrics.mainBranchValid, true);
  });

  it('verifies multi-run determinism produces identical token and behavioral metrics', async () => {
    const runA = await adapter.execute({
      id: '001-single-agent-cold',
      title: 'Determinism Test A',
      description: 'Test A',
      targetRepo: 'targets/microservice-auth',
      mode: 'cold'
    });

    const runB = await adapter.execute({
      id: '001-single-agent-cold',
      title: 'Determinism Test B',
      description: 'Test B',
      targetRepo: 'targets/microservice-auth',
      mode: 'cold'
    });

    assert.equal(runA.metrics.tokensTotal, runB.metrics.tokensTotal, 'Tokens must be 100% deterministic');
    assert.equal(runA.metrics.details.filesScanned, runB.metrics.details.filesScanned, 'Files scanned must match exactly');
    assert.equal(runA.metrics.details.compactionRecoveryType, runB.metrics.details.compactionRecoveryType, 'Recovery type must match');
  });
});


