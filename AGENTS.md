# Arbiter-Live-Benchmark — Multi-Agent Orchestration & Continuity Benchmark Suite

Instrumented benchmark suite scientifically validating Arbiter multi-agent orchestration, Waymark in-flight continuity, and fail-closed conflict quarantine across isolated Git worktrees.

## Cross-Repository Ecosystem

This repository is part of an integrated, local-first multi-agent execution suite:

### Internal Suite Repositories

| Repository | Role & Responsibility | Core Invariant |
| :--- | :--- | :--- |
| **[`AGENTS.md Compact Reload`](https://github.com/paragon-ux/codex-agents-compact-reload)** | Static project governance & compaction survival. | Re-injects verified `AGENTS.md` and SHA-256 hash on context compaction. |
| **[`Waymark`](https://github.com/paragon-ux/waymark)** | In-flight continuity ledger & AST discovery MCP. | Preserves verified code hops (`.waymark/`) across compactions (<216 tokens). |
| **[`Arbiter`](https://github.com/paragon-ux/Arbiter)** | Multi-agent DAG orchestrator & worktree supervisor. | Enforces `1 Task : 1 Worktree : 1 Trajectory`; fail-closed merge quarantine. |
| **[`arbiter-live-benchmark`](https://github.com/paragon-ux/arbiter-live-benchmark)** | Empirical validation & regression benchmark testbed. | Quantifies isolation, token efficiency, DAG scheduling, and rollback safety. |

#### When to Use What

- **Use [`AGENTS.md Compact Reload`](https://github.com/paragon-ux/codex-agents-compact-reload)** when an agent harness compacts context and you must deterministically guarantee that static project instructions, safety guardrails, and coding conventions are restored into the active session without spending agent recovery turns.
- **Use [`Waymark`](https://github.com/paragon-ux/waymark)** when an agent is deep in a multi-file investigation or code trace and needs to preserve dynamic, verified line spans and causal breadcrumbs across compactions without repetitive, token-expensive codebase re-reads.
- **Use [`Arbiter`](https://github.com/paragon-ux/Arbiter)** when running multiple autonomous coding agents in parallel and you need ephemeral Git worktree isolation, DAG task dependencies, zero-daemon dead-worker recovery, and conflict-quarantined sequential merges.
- **Use [`arbiter-live-benchmark`](https://github.com/paragon-ux/arbiter-live-benchmark)** to benchmark and empirically verify multi-agent performance, reproduce merge conflict quarantine, evaluate context compaction token savings, or test agent execution pipelines.

> [!IMPORTANT]
> **The 1:1:1 Invariant Contract**:
> Every concurrent agent worker provisioned by **Arbiter** operates in exactly **one isolated Git worktree** and records exactly **one active Waymark trajectory**. Context compaction reloads static rules via **`AGENTS.md Compact Reload`** and in-flight hops via **`Waymark`** without mutating the task lease or crossing branch boundaries.

---

## Architecture & Scenarios

The suite evaluates 18 standardized benchmark and resilience scenarios:

1. `001-single-agent-cold`: Baseline cold exploration after context compaction (~7,120 tokens).
2. `002-single-agent-waymark`: In-flight continuity resume (<216 tokens, >75% token reduction).
3. `003-parallel-no-isolation`: Chaos baseline; uncoordinated concurrent agents stomping working trees.
4. `004-parallel-arbiter`: 3 parallel agents in isolated worktrees with clean sequential merge.
5. `005-dag-dependencies`: 12-task dependency DAG resolved via Kahn topological sort.
6. `006-conflict-quarantine`: Overlapping edits triggering fail-closed rollback and quarantine.
7. `007-watchdog-dead-worker`: Dead worker PID detection via `process.kill(pid, 0)` and lease reclamation.
8. `008-agent-semantic-correctness`: AST validation of agent-generated code against strict syntax/type schemas.
9. `009-parallel-10-workers`: Stress scale testing 10 concurrent agent workers across isolated worktrees.
10. `010-cyclic-dag-rejection`: Verification of immediate cycle detection and rejection in task dependency graphs.
11. `011-concurrent-lease-collision`: High-contention race condition testing for task lease acquisition atomicity.
12. `012-signal-interrupted-merge`: Mid-merge SIGINT/SIGTERM interruption testing clean rollback to pristine state.
13. `013-waymark-multi-compaction`: Durability of Waymark in-flight continuity across 5 successive compactions.
14. `014-disk-full-recovery`: Graceful degradation and atomic rollback when storage limits or ENOSPC errors occur.
15. `015-docker-isolated-overhead`: Containerization lifecycle overhead evaluation vs. lightweight ephemeral worktrees.
16. `016-naive-mutex-contention`: Negative baseline showing deadlock, starvation, and dirty working tree state.
17. `017-parallel-50-workers`: Massive concurrency scale stress test with 50 concurrent agent workers.
18. `018-cross-repo-workspace-dag`: Complex multi-package monorepo diamond dependency resolution and artifact building.

## Multi-Tier Execution Engine

- **Tier 1 (Deterministic Replay Engine)**: Fast, seeded replay simulation via Mulberry32 PRNG with pre-recorded I/O fixtures ($0 cost, runs on GitHub Actions CI across Ubuntu, macOS, Windows in <5ms).
- **Tier 1.5 (Subprocess MCP Adapter)**: Spawns real OS child processes communicating via JSON-RPC 2.0 stdio with mock MCP tool contracts, validating transport boundaries without external API keys.
- **Tier 2 (Live Agy Runner)**: Invokes the local Antigravity CLI (`agy`) across isolated worktrees using user subscription ($0 API cost) for live empirical validation.
- **Tier 3 (Comparative Baselines)**:
  - `DockerIsolatedAdapter`: Measures containerized isolation overhead.
  - `NaiveMutexAdapter`: Demonstrates negative baseline lock contention and file corruption.
  - `ProcessPoolAdapter`: Evaluates worker pool execution without worktree isolation.

## Agent Workflow & Commands

Autonomous agents modifying or verifying this repository must follow these rules:

1. **Zero Runtime Dependencies**: The package must remain strictly zero runtime npm dependencies, relying exclusively on Node 22 native modules (`node:sqlite`, `node:child_process`, `node:fs`, `node:crypto`).
2. **Build**: `npm run build` (`tsc -p tsconfig.json`).
3. **Test Suite**: `npm test` (`node --test "dist/test/**/*.test.js"`).
4. **Coverage**: `npm run test:coverage`.
5. **Hygiene Scan**: `npm run public-check`.
6. **Full Benchmark Run**: `npm run benchmark`.
7. **Verification Pipeline**: `npm run verify` (build + test + public-check + benchmark). All checks must pass before opening PRs or merging.
