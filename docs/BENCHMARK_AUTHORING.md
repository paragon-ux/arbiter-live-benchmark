# Benchmark Scenario Authoring Guide

Comprehensive guide for authoring, validating, and executing benchmark scenarios in the **Arbiter Benchmark Suite** (`arbiter-benchmark`).

---

## 1. Master Scenario Taxonomy (001–023)

| Scenario ID | Title | Tier | Category | Focus / Failure Mode |
| :--- | :--- | :--- | :--- | :--- |
| **`001-single-agent-cold`** | Single Agent Cold Exploration (Baseline) | Tier 1 / 1.5 / 2 | Core Continuity | v2.3.0 baseline cold scenario: 3,079 total tokens. |
| **`002-single-agent-waymark`** | Single Agent Waymark In-Flight Continuity | Tier 1 / 1.5 / 2 | Core Continuity | v2.3.0 baseline: 196-token resume packet inside 781 total tokens; 69% reported continuity savings. |
| **`003-parallel-no-isolation`** | Parallel Multi-Agent Chaos (No Isolation Baseline) | Tier 1 / 1.5 / 2 | Chaos / Isolation | Uncoordinated concurrent agents stomping shared working directory. |
| **`004-parallel-arbiter`** | Parallel Multi-Agent Arbiter Worktree Swarm | Tier 1 / 1.5 / 2 | Workspace Isolation | 3 concurrent agents on dedicated ephemeral worktrees with sequential merge. |
| **`005-dag-dependencies`** | DAG Task Scheduling & Dependency Unblocking | Tier 1 / 1.5 / 2 | Orchestration | 12-task dependency graph resolved via Kahn topological sort. |
| **`006-conflict-quarantine`** | Merge Conflict Fail-Closed Rollback & Quarantine | Tier 1 / 1.5 / 2 | Safety & Rollback | Overlapping edits triggering fail-closed rollback (`git merge --abort`). |
| **`007-watchdog-dead-worker`** | Zero-Daemon Watchdog Dead PID Lease Recovery | Tier 1 / 1.5 / 2 | Process Resilience | Dead worker PID detection via `process.kill(pid, 0)` and lease reclamation. |
| **`008-agent-semantic-correctness`** | Agent Semantic Correctness & Typecheck (Refactoring) | Tier 1 / 1.5 / 2 | Code Quality | Refactoring validated against `tsc --noEmit` and 100% unit tests. |
| **`009-parallel-10-workers`** | High-Concurrency Multi-Agent Swarm (10 Workers) | Tier 1 / 1.5 / 2 | Concurrency Scale | 10 concurrent agent workers stressing SQLite WAL write serialization. |
| **`010-cyclic-dag-rejection`** | Cyclic DAG Dependency Rejection & Rollback | Tier 1 / 1.5 / 2 | Graph Validation | Immediate cycle detection and rejection with clean rollback. |
| **`011-concurrent-lease-collision`** | Concurrent Task Lease Collision & EAGAIN Backoff | Tier 1 / 1.5 / 2 | Race Condition | High-contention race condition testing task lease acquisition atomicity. |
| **`012-signal-interrupted-merge`** | Signal-Interrupted Merge Fail-Closed Rollback (SIGTERM) | Tier 1 / 1.5 / 2 | Crash Recovery | Mid-merge `SIGTERM` interrupt testing fail-closed rollback. |
| **`013-waymark-multi-compaction`** | Multi-Compaction Trajectory Stability (3 Cycles) | Tier 1 / 1.5 / 2 | Continuity Durability | Durability of Waymark in-flight continuity across sequential compactions. |
| **`014-disk-full-recovery`** | SQLite Transaction Rollback Recovery | Tier 1 / 1.5 / 2 | Storage Resilience | Graceful transaction rollback and lease cleanup on forced transaction abort. |
| **`015-docker-isolated-overhead`** | Docker Containerization Overhead Comparative Baseline | Tier 3 (Docker) | Comparative Overhead | Quantifies container spin-up and teardown latency overhead vs. worktrees. |
| **`016-naive-mutex-contention`** | Naive Mutex Contention & Starvation Comparative Baseline | Tier 3 (Naive Mutex)| Comparative Baseline | Negative baseline measuring lock contention, starvation, and deadlock. |
| **`017-parallel-50-workers`** | High-Concurrency Multi-Agent Swarm (50 Workers) | Tier 1 / 1.5 / 2 | Concurrency Limits | 50 concurrent agents stressing WAL concurrency and OS file handle limits. |
| **`018-cross-repo-workspace-dag`** | Monorepo Workspace Cross-Package DAG Resolution | Tier 1 / 1.5 / 2 | Monorepo DAG | Diamond dependency resolution across shared packages in a workspace. |
| **`019-n-way-merge-conflicts`** | N-Way Concurrent Merge Conflict & Worktree Quarantine | Tier 1 / 1.5 / 2 | Conflict Isolation | 5 concurrent workers (2 clean, 3 colliding); quarantines colliders and keeps main intact. |
| **`020-concurrent-main-drift`** | Concurrent Upstream Main Drift & Auto-Rebase Synchronization | Tier 1 / 1.5 / 2 | Upstream Sync | Injected upstream commits during branch work; 3-way synchronization without data loss. |
| **`021-mcp-protocol-resilience`** | Tier 1.5 Subprocess MCP Protocol Boundary & Tool Calling Resilience | Tier 1.5 (Subprocess)| Protocol Interface | Stdio JSON-RPC 2.0 tool calls, schema enforcement, and protocol error isolation. |
| **`022-watchdog-heartbeat-stale-reclaim`**| Watchdog Stale Heartbeat Detection & Fault-Tolerant Task Recovery | Tier 1 / 1.5 / 2 | Process Resilience | Recovers leases when worker PID is alive but heartbeat timed out (frozen/partitioned). |
| **`023-symbol-discovery`** | Real Structured AST Symbol Discovery | Tier 1.5 (Subprocess) | AST Safety | Lease-fenced TypeScript symbol discovery through the real Waymark WASM parser with no-write verification. |

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

## 3. Determinism & Reproducibility Rules

To preserve reproducible regression verification on CI:
1. **Deterministic Scenario Ordering**: Scenarios execute in fixed ID order (001→023) with consistent configuration.
2. **Metric Determinism & Wall-Clock Timing**: Structural and token metrics (pass/fail status, accuracy percentage, branch validity, token consumption) are deterministic across runs. Timing metrics (`durationMs`) measure real wall-clock performance via `performance.now()` and live Git operations, and are subject to hardware variance.
3. **Timing Variance**: Scenarios that perform real Git I/O will produce varying `durationMs` across runs. Non-timing fields (pass/fail, token counts, accuracy) remain stable across runs on the same platform.

---

## 4. Execution Tiers & Comparative Baselines

The benchmark executes across four defined tiers:

- **Tier 1 (Live Arbiter Engine)**: Executes real Arbiter primitives (WorktreeManager, MergeQueue, TaskGraph, ArbiterDatabase) with real Git worktrees and SQLite WAL. Deterministic scenario ordering with real wall-clock timing ($0 cost).
- **Tier 1.5 (Headless Subprocess MCP Runner)**: Spawns real child processes communicating via JSON-RPC 2.0 `stdio` ($0 token cost).
- **Tier 2 (Live Agy Runner)**: Spawns real autonomous agents via local Antigravity CLI (`agy`) across live worktrees.
- **Tier 3 (Comparative Baselines)**:
  - `DockerIsolatedAdapter`: Evaluates containerized isolation overhead.
  - `NaiveMutexAdapter`: Evaluates negative baseline with file-level locks (file stomping, deadlocks).
  - `ProcessPoolAdapter`: Evaluates worker pool without worktree isolation.

---

## 5. Hypothesis Correlation Matrix (H1–H16)

| Hypothesis | Claim Tested | Validating Scenarios | Primary Invariant |
| :--- | :--- | :--- | :--- |
| **H1** | 1:1:1 Invariant (1 worktree per agent per task) | `004`, `009`, `017`, `018`, `019` | Zero workspace stomping, dedicated branch |
| **H2** | Waymark Continuity (69% reported continuity savings) | `001`, `002`, `013` | In-flight state restore in a 194-token resume packet within a 782-token scenario |
| **H3** | Sub-5ms Orchestration Overhead | `005`, `009`, `011`, `017` | Scheduler latency <5.0ms even at 50 workers |
| **H4** | Fail-Closed Conflict Quarantine | `006`, `012`, `019` | Git merge abort, untouched main branch |
| **H5** | Zero-Daemon Dead Worker Lease Reclamation | `007` | `process.kill(pid, 0)` dead PID detection |
| **H6** | Zero-Daemon Stale Heartbeat Recovery | `022` | Heartbeat timeout recovery with alive PID |
| **H7** | Semantic Correctness & Type Integrity | `008` | Zero TypeScript compiler or runtime errors |
| **H8** | High-Concurrency WAL Write Serialization | `009`, `017` | Zero SQLite locked errors, sequential commits |
| **H9** | Kahn DAG Sort & Cycle Rejection | `005`, `010` | O(V+E) task resolution; immediate cycle error |
| **H10** | Atomic Task Lease Acquisition & EAGAIN | `011` | Exactly one winner per task lease race |
| **H11** | Crash Safety & Signal-Interrupted Rollback | `012` | Clean repository state on merge conflict abort |
| **H12** | Transaction Rollback Recovery | `014` | Graceful rollback on forced transaction abort |
| **H13** | Worktree vs Containerization Efficiency | `015` | Worktrees >50x faster than container start |
| **H14** | Worktree Isolation vs Naive File Mutexes | `003`, `016` | Mutex causes starvation/deadlock; worktrees 0 |
| **H15** | Monorepo Diamond Dependency DAG Resolution | `018` | Cross-package topological ordering |
| **H16** | Upstream Main Drift & 3-Way Synchronization | `020` | Concurrent rebase preserving upstream work |
