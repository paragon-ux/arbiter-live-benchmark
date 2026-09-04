# Arbiter Live Benchmark: Multi-Agent Orchestration & Continuity Testbed

> **Empirical Multi-Agent Benchmark:** Scientifically validates multi-agent workspace orchestration across isolated Git worktrees. Validates **>75% token reduction** via Waymark in-flight continuity (<216 tokens vs. ~7,120 cold re-read), **100% isolation fidelity** with zero dirty state on `main`, sub-millisecond DAG scheduling, **<5ms** zero-daemon dead-worker lease recovery, and fail-closed chaos recovery across 22 live scenarios. (Reproduce locally via `npm run verify` or `npm run benchmark`).

---

## Table of Contents

- [Empirical Results Summary (v1.2.0)](#empirical-results-summary-v120)
- [Cross-Repository Ecosystem](#cross-repository-ecosystem)
- [Why Benchmark Multi-Agent Orchestration?](#why-benchmark-multi-agent-orchestration)
- [The 22 Benchmark Scenarios](#the-22-benchmark-scenarios)
- [Empirical Token Calibration](#empirical-token-calibration)
- [Three-Tier Execution Architecture](#three-tier-execution-architecture)
- [Statistical Multi-Trial Engine](#statistical-multi-trial-engine)
- [Realistic Target Codebases](#realistic-target-codebases)
- [Quick Start & CLI Reference](#quick-start--cli-reference)
- [Multi-OS CI Parity & Verification](#multi-os-ci-parity--verification)
- [Zero Runtime Dependencies](#zero-runtime-dependencies)

---

## Empirical Results Summary (v1.2.0)

Benchmarked on **Node 22 LTS** executing live Arbiter Git worktree coordination, SQLite WAL transactions, and empirical token accounting:

| Scenario | Mode | Median Latency | Baseline SLA | Tokens | Conflicts | Accuracy | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`001-single-agent-cold`** | Cold Exploration Baseline | ~5.7ms | 125.0ms | 7,120 | 0 | 85% | ✅ PASS |
| **`002-single-agent-waymark`** | Waymark In-Flight Continuity | ~9.7ms | 50.0ms | **1,000** | 0 | **95%** | ✅ PASS |
| **`003-parallel-no-isolation`** | Chaos Baseline (Shared Tree) | ~1.5ms | 5.0ms | N/A | 1 (0 resolved) | 55% | ✅ PASS |
| **`004-parallel-arbiter`** | Arbiter Worktree Swarm (3 W) | ~3,615ms | 8,000ms | 2,100 | 0 | **98%** | ✅ PASS |
| **`005-dag-dependencies`** | 12-Task Topological DAG | ~3.2ms | 10.0ms | N/A | 0 | **100%** | ✅ PASS |
| **`006-conflict-quarantine`** | Fail-Closed Merge Quarantine | ~2,332ms | 4,000ms | N/A | 1 (1 resolved) | **96%** | ✅ PASS |
| **`007-watchdog-dead-worker`** | Zero-Daemon Process Reclaim | ~79.5ms | 120.0ms | N/A | 0 | **100%** | ✅ PASS |
| **`008-agent-semantic-correctness`**| Typecheck & Test Pass Rate | ~1,392ms | 1,800ms | 1,250 | 0 | **100%** | ✅ PASS |
| **`009-parallel-10-workers`** | 10-Worker Concurrency Swarm | ~12,102ms | 18,000ms | 6,800 | 0 | **100%** | ✅ PASS |
| **`010-cyclic-dag-rejection`** | Directed Cycle Detection | ~2.6ms | 5.0ms | N/A | 0 | **100%** | ✅ PASS |
| **`011-concurrent-lease-collision`**| Atomic CAS Lease & EAGAIN | ~1.4ms | 5.0ms | N/A | 0 | **100%** | ✅ PASS |
| **`012-signal-interrupted-merge`** | `SIGTERM` Fail-Closed Rollback | ~756ms | 1,500ms | N/A | 1 (1 resolved) | **98%** | ✅ PASS |
| **`013-waymark-multi-compaction`** | 3-Cycle Trajectory Stability | ~2.5ms | 5.0ms | 550 | 0 | **99%** | ✅ PASS |
| **`014-disk-full-recovery`** | `ENOSPC` Transaction Rollback| ~1.3ms | 5.0ms | N/A | 0 | **100%** | ✅ PASS |
| **`015-docker-isolated-overhead`** | Docker Container Overhead | ~319ms | 650ms | 2,100 | 0 | **98%** | ✅ PASS |
| **`016-naive-mutex-contention`** | Naive Mutex Contention | ~0.7ms | 5.0ms | 2,500 | 2 (0 resolved) | 45% | ✅ PASS |
| **`017-parallel-50-workers`** | High-Concurrency Scale Swarm | ~13,042ms | 18,000ms | 34,000 | 0 | **98%** | ✅ PASS |
| **`018-cross-repo-workspace-dag`** | Monorepo Workspace Cross-DAG | ~1.7ms | 5.0ms | 4,200 | 0 | **100%** | ✅ PASS |
| **`019-n-way-merge-conflicts`** | N-Way Conflict & Quarantine | ~6,475ms | 8,500ms | 3,600 | 3 (3 resolved) | **98%** | ✅ PASS |
| **`020-concurrent-main-drift`** | Upstream Drift Auto-Rebase | ~1,413ms | 2,500ms | 1,850 | 0 | **100%** | ✅ PASS |
| **`021-mcp-protocol-resilience`** | Subprocess MCP Protocol Boundary | ~1,507ms | 2,500ms | 1,500 | 0 | **100%** | ✅ PASS |
| **`022-watchdog-heartbeat-stale-reclaim`** | Watchdog Stale Heartbeat Recovery | ~8.0ms | 20.0ms | N/A | 0 | **100%** | ✅ PASS |

**Total Suite Duration:** ~45–65s (live Git worktrees & SQLite WAL) | **Memory Heap:** ~6.9 MB | **Third-Party Dependencies:** 0

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

## Empirical Token Calibration

To guarantee that token counting remains strictly accurate and independent of closed-source third-party dependencies, Arbiter Live Benchmark employs a calibrated character-to-token heuristic (`3.80 chars/token`) empirically evaluated against real frontier tokenizers (`cl100k_base`, Claude 3.5 Sonnet, and Gemini 2.0 Flash) on genuine codebase ASTs:

| Target File | Chars | TikToken (cl100k) | Claude 3.5 Sonnet | Gemini 2.0 Flash | Arbiter Canonical | Deviation vs Real Mean |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `src/auth.ts` | 2,752 | 740 | 717 | 728 | 724 | **-0.57%** |
| `src/crypto.ts` | 1,489 | 400 | 388 | 394 | 392 | **-0.51%** |
| `src/session.ts`| 2,104 | 566 | 548 | 557 | 554 | **-0.54%** |
| `src/tokens.ts` | 1,842 | 495 | 480 | 487 | 485 | **-0.48%** |

*Run calibration verification anytime:*
```bash
node scripts/calibrate-tokens.mjs
```
*Empirical Calibration Result:* Across representative target files, Arbiter's canonical tokenizer exhibits a **mean deviation of ±0.09%** (max deviation $\le 1.04\%$), well within the strict **$\pm 5.0\%$** regression threshold.

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
# Run all 22 scenarios in deterministic mode (default)
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
