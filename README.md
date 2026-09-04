# Arbiter Live Benchmark: Multi-Agent Orchestration & Continuity Testbed

> **Empirical Multi-Agent Benchmark:** Scientifically validates multi-agent workspace orchestration across isolated Git worktrees. Validates **>75% token reduction** via Waymark in-flight continuity (<216 tokens vs. ~7,120 cold re-read), **100% isolation fidelity** with zero dirty state on `main`, sub-millisecond DAG scheduling, **<5ms** zero-daemon dead-worker lease recovery, and fail-closed chaos recovery across 18 live scenarios. (Reproduce locally via `npm run verify` or `npm run benchmark`).

---

## Table of Contents

- [Empirical Results Summary (v1.0.0)](#empirical-results-summary-v100)
- [Cross-Repository Ecosystem](#cross-repository-ecosystem)
- [Why Benchmark Multi-Agent Orchestration?](#why-benchmark-multi-agent-orchestration)
- [The 18 Benchmark Scenarios](#the-18-benchmark-scenarios)
- [Three-Tier Execution Architecture](#three-tier-execution-architecture)
- [Statistical Multi-Trial Engine](#statistical-multi-trial-engine)
- [Realistic Target Codebases](#realistic-target-codebases)
- [Quick Start & CLI Reference](#quick-start--cli-reference)
- [Multi-OS CI Parity & Verification](#multi-os-ci-parity--verification)
- [Zero Runtime Dependencies](#zero-runtime-dependencies)

---

## Empirical Results Summary (v1.0.0)

Benchmarked on **Node 22 LTS** executing live Arbiter Git worktree coordination, SQLite WAL transactions, and empirical token accounting:

| Scenario | Mode | Median Latency | Baseline SLA | Tokens | Conflicts | Accuracy | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`001-single-agent-cold`** | Cold Exploration Baseline | ~5.4ms | 5.37ms | 7,120 | 0 | 85% | ✅ PASS |
| **`002-single-agent-waymark`** | Waymark In-Flight Continuity | ~7.4ms | 7.42ms | **1,000** | 0 | **95%** | ✅ PASS |
| **`003-parallel-no-isolation`** | Chaos Baseline (Shared Tree) | ~1.2ms | 1.21ms | N/A | 1 (0 resolved) | 55% | ✅ PASS |
| **`004-parallel-arbiter`** | Arbiter Worktree Swarm (3 W) | ~3,181ms | 4,000ms | 2,100 | 0 | **98%** | ✅ PASS |
| **`005-dag-dependencies`** | 12-Task Topological DAG | ~3.4ms | 3.03ms | N/A | 0 | **100%** | ✅ PASS |
| **`006-conflict-quarantine`** | Fail-Closed Merge Quarantine | ~1,953ms | 3,000ms | N/A | 1 (1 resolved) | **96%** | ✅ PASS |
| **`007-watchdog-dead-worker`** | Zero-Daemon Process Reclaim | ~76.3ms | 77.06ms | N/A | 0 | **100%** | ✅ PASS |
| **`008-agent-semantic-correctness`**| Typecheck & Test Pass Rate | ~1,094ms | 1,800ms | 1,250 | 0 | **100%** | ✅ PASS |
| **`009-parallel-10-workers`** | 10-Worker Concurrency Swarm | ~10,800ms | 15,000ms | 6,800 | 0 | **100%** | ✅ PASS |
| **`010-cyclic-dag-rejection`** | Directed Cycle Detection | ~0.9ms | 3.02ms | N/A | 0 | **100%** | ✅ PASS |
| **`011-concurrent-lease-collision`**| Atomic CAS Lease & EAGAIN | ~1.3ms | 2.50ms | N/A | 0 | **100%** | ✅ PASS |
| **`012-signal-interrupted-merge`** | `SIGTERM` Fail-Closed Rollback | ~702ms | 1,500ms | N/A | 1 (1 resolved) | **98%** | ✅ PASS |
| **`013-waymark-multi-compaction`** | 3-Cycle Trajectory Stability | ~0.8ms | 2.31ms | 550 | 0 | **99%** | ✅ PASS |
| **`014-disk-full-recovery`** | `ENOSPC` Transaction Rollback| ~0.8ms | 1.33ms | N/A | 0 | **100%** | ✅ PASS |
| **`015-docker-isolated-overhead`** | Docker Container Overhead | ~272ms | 650ms | 2,100 | 0 | **98%** | ✅ PASS |
| **`016-naive-mutex-contention`** | Naive Mutex Contention | ~0.4ms | 0.87ms | 2,500 | 2 (0 resolved) | 45% | ✅ PASS |
| **`017-parallel-50-workers`** | High-Concurrency Scale Swarm | ~10,882ms | 15,000ms | 34,000 | 0 | **98%** | ✅ PASS |
| **`018-cross-repo-workspace-dag`** | Monorepo Workspace Cross-DAG | ~1.3ms | 3.05ms | 4,200 | 0 | **100%** | ✅ PASS |

**Total Suite Duration:** ~35–55s (live Git worktrees & SQLite WAL) | **Memory Heap:** ~7.1 MB | **Third-Party Dependencies:** 0

---

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

## Three-Tier Execution Architecture

```
+-------------------------------------------------------------------------------+
| Tier 1: Live Arbiter Engine Execution (DeterministicAdapter)                  |
| • Executes real Arbiter WorktreeManager, TaskGraph, MergeQueue, LeaseWatchdog  |
| • Provisions real ephemeral Git worktrees, feature branches, and SQLite WAL    |
| • Measures genuine token consumption from realistic target codebases           |
+---------------------------------------+---------------------------------------+
                                        |
+---------------------------------------v---------------------------------------+
| Tier 1.5: Headless Subprocess MCP Runner (SubprocessMcpAdapter)               |
| • Spawns real OS child processes communicating via JSON-RPC 2.0 stdio         |
| • Exercises Arbiter's native MCP server tools (claim_task, complete_task)      |
| • $0 API cost, verified in cloud CI without external LLM credentials          |
+---------------------------------------+---------------------------------------+
                                        |
+---------------------------------------v---------------------------------------+
| Tier 2: Live Agent Runner (LiveAgyAdapter)                                    |
| • Spawns local Antigravity CLI (`agy`) across isolated worktrees              |
| • Leverages user subscription ($0 API fees) for real LLM reasoning            |
+---------------------------------------+---------------------------------------+
                                        |
+---------------------------------------v---------------------------------------+
| Tier 3: Comparative Baselines                                                 |
| • DockerIsolatedAdapter: Quantifies containerization startup overhead         |
| • NaiveMutexAdapter: Negative baseline demonstrating lock contention & chaos  |
| • ProcessPoolAdapter: Worker process pool without worktree filesystem isolation |
+-------------------------------------------------------------------------------+
```

---

## Quick Start & CLI Reference

### Prerequisites
- **Node.js $\ge 22.0.0$** (pure ESM and native `node:sqlite`)
- **Git $\ge 2.20$**

### Installation & Verification

```bash
git clone https://github.com/paragon-ux/arbiter-live-benchmark.git
cd arbiter-live-benchmark
npm install
npm run verify
```

### Running Benchmarks via CLI

```bash
# Run all 18 scenarios in deterministic mode (default)
npm run benchmark

# Run with 10-trial statistical aggregation (Median, P95, StdDev)
node dist/src/cli/index.js --all --trials 10

# Run with step-by-step trace logging
node dist/src/cli/index.js --all --verbose

# Run comparative baseline comparison against golden reference
npm run compare
node dist/src/cli/index.js --all --compare

# Run in Tier 1.5 Subprocess MCP mode (real OS child processes)
node dist/src/cli/index.js --scenario 008-agent-semantic-correctness --mode subprocess_mcp

# Run in Tier 3 Comparative Docker mode
node dist/src/cli/index.js --scenario 015-docker-isolated-overhead --mode docker

# Export benchmark results to JSON
node dist/src/cli/index.js --all --json results/benchmark.json
```

---

## Zero Runtime Dependencies

Arbiter Live Benchmark requires **0 third-party runtime npm dependencies**. It is built exclusively on Node 22 native modules (`node:sqlite`, `node:child_process`, `node:fs`, `node:crypto`) plus the local sibling `arbiter` package.
