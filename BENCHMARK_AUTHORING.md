# Benchmark Scenario Authoring Guide

Comprehensive guide for authoring, validating, and executing benchmark scenarios in the **Arbiter Benchmark Suite** (`arbiter-benchmark`).

---

## 1. Master Scenario Taxonomy (001–018)

| Scenario ID | Title | Tier | Category | Focus / Failure Mode |
| :--- | :--- | :--- | :--- | :--- |
| **`001-single-agent-cold`** | Single Agent Cold Exploration | Tier 1 / 1.5 / 2 | Core Continuity | Cold exploration baseline after context compaction (~7,120 tokens). |
| **`002-single-agent-waymark`** | Single Agent Waymark In-Flight Continuity | Tier 1 / 1.5 / 2 | Core Continuity | In-flight continuity resume (<216 tokens, >75% token reduction). |
| **`003-parallel-no-isolation`** | Parallel Chaos Baseline (No Isolation) | Tier 1 / 1.5 / 2 | Chaos / Isolation | Uncoordinated concurrent agents stomping shared working directory. |
| **`004-parallel-arbiter`** | Parallel Multi-Agent Arbiter Worktree Swarm | Tier 1 / 1.5 / 2 | Workspace Isolation | 3 concurrent agents on dedicated ephemeral worktrees with sequential merge. |
| **`005-dag-dependencies`** | DAG Task Scheduling & Dependency Unblocking | Tier 1 / 1.5 / 2 | Orchestration | 12-task dependency graph resolved via Kahn topological sort. |
| **`006-conflict-quarantine`** | Merge Conflict Fail-Closed Quarantine | Tier 1 / 1.5 / 2 | Safety & Rollback | Overlapping edits triggering fail-closed rollback (`git merge --abort`). |
| **`007-watchdog-dead-worker`** | Zero-Daemon Watchdog Dead PID Recovery | Tier 1 / 1.5 / 2 | Process Resilience | Dead worker PID detection via `process.kill(pid, 0)` and lease reclamation. |
| **`008-agent-semantic-correctness`** | Agent Semantic Correctness & Typecheck | Tier 1 / 1.5 / 2 | Code Quality | Refactoring validated against `tsc --noEmit` and 100% unit tests. |
| **`009-parallel-10-workers`** | High-Concurrency Swarm (10 Workers) | Tier 1 / 1.5 / 2 | Concurrency Scale | 10 concurrent agent workers stressing SQLite WAL write serialization. |
| **`010-cyclic-dag-rejection`** | Cyclic DAG Dependency Rejection | Tier 1 / 1.5 / 2 | Graph Validation | Immediate cycle detection and rejection with clean rollback. |
| **`011-concurrent-lease-collision`** | Concurrent Lease Collision & EAGAIN | Tier 1 / 1.5 / 2 | Race Condition | High-contention race condition testing task lease acquisition atomicity. |
| **`012-signal-interrupted-merge`** | Signal-Interrupted Merge Rollback | Tier 1 / 1.5 / 2 | Crash Recovery | Mid-merge `SIGTERM` interrupt testing fail-closed rollback. |
| **`013-waymark-multi-compaction`** | Multi-Compaction Trajectory Stability | Tier 1 / 1.5 / 2 | Continuity Durability | Durability of Waymark in-flight continuity across sequential compactions. |
| **`014-disk-full-recovery`** | Disk-Full (ENOSPC) Fault Recovery | Tier 1 / 1.5 / 2 | Storage Resilience | Graceful transaction rollback and lease cleanup on storage exhaustion. |
| **`015-docker-isolated-overhead`** | Docker Containerization Overhead | Tier 3 (Docker) | Comparative Overhead | Quantifies container spin-up and teardown latency overhead vs. worktrees. |
| **`016-naive-mutex-contention`** | Naive Mutex Contention & Starvation | Tier 3 (Naive Mutex)| Comparative Baseline | Negative baseline measuring lock contention, starvation, and deadlock. |
| **`017-parallel-50-workers`** | Massive Concurrency Scale (50 Workers) | Tier 1 / 1.5 / 2 | Concurrency Limits | 50 concurrent agents stressing WAL concurrency and OS file handle limits. |
| **`018-cross-repo-workspace-dag`** | Monorepo Workspace Cross-Package DAG | Tier 1 / 1.5 / 2 | Monorepo DAG | Diamond dependency resolution across shared packages in a workspace. |

---

## 2. JSON Scenario Schema

Every scenario fixture lives in `scenarios/<id>.json` and must adhere to the following schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "id": "015-docker-isolated-overhead",
  "title": "Docker Containerization Overhead Baseline",
  "description": "Quantifies container spin-up and image footprint overhead compared to ephemeral Git worktrees.",
  "target": "microservice-auth",
  "concurrency": 3,
  "config": {
    "isolation": "docker",
    "baseContainerInitMs": 350,
    "worktreeInitMs": 4
  },
  "expected": {
    "passed": true,
    "overheadRatioMin": 50,
    "mainBranchValid": true
  }
}
```

### Required Fields:
- `id` (string): Unique identifier matching filename without `.json` (e.g. `001-single-agent-cold`).
- `title` (string): Human-readable scenario title.
- `description` (string): Concise summary of the controlled chaos or condition being tested.
- `target` (string): Associated target codebase (`microservice-auth` or `data-pipeline`).
- `concurrency` (number): Number of concurrent agent workers involved.
- `expected` (object): Verification assertions checked by orchestrator.

---

## 3. PRNG Determinism & Seeding Rules

To preserve reproducible regression verification on CI:
1. **Zero OS Entropy**: Never use `Math.random()` or unseeded `crypto.randomBytes()`.
2. **Mulberry32 PRNG**: Use the `SeededRNG` instance initialized with seed `0x6D2B79F5`.
3. **Byte-Identical Outputs**: 10 consecutive executions of any scenario in deterministic mode must yield byte-identical results.

---

## 4. Execution Tiers & Comparative Baselines

The benchmark executes across four defined tiers:

- **Tier 1 (Deterministic Simulator)**: Seeded replay simulation with pre-recorded I/O fixtures ($0 cost, sub-5ms).
- **Tier 1.5 (Headless Subprocess MCP Runner)**: Spawns real child processes communicating via JSON-RPC 2.0 `stdio` ($0 token cost).
- **Tier 2 (Live Agy Runner)**: Spawns real autonomous agents via local Antigravity CLI (`agy`) across live worktrees.
- **Tier 3 (Comparative Baselines)**:
  - `DockerIsolatedAdapter`: Evaluates containerized isolation overhead.
  - `NaiveMutexAdapter`: Evaluates negative baseline with file-level locks (file stomping, deadlocks).
  - `ProcessPoolAdapter`: Evaluates worker pool without worktree isolation.
