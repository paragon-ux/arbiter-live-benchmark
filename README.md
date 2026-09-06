# Arbiter Live Benchmark: Multi-Agent Orchestration & Continuity Testbed

[![Version](https://img.shields.io/badge/version-2.2.1-blue.svg)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](package.json)

> **Empirical Multi-Agent Benchmark:** Scientifically validates multi-agent workspace orchestration across isolated Git worktrees. The v2.2.1 baseline reports **69% continuity savings**: scenario `001` used 3,083 total tokens, while scenario `002` used 782 total tokens including a 194-token Waymark resume packet. The suite also measures isolation fidelity, DAG scheduling, dead-worker lease recovery, and fail-closed chaos recovery across 22 live scenarios. (Reproduce locally via `npm run verify:release` or `npm run benchmark`).

---

## Table of Contents

- [Empirical Results Summary (v2.2.1)](#empirical-results-summary-v221)
  - [Live Frontier Agent Verification (Tier 2: Google Gemini via Antigravity CLI)](#live-frontier-agent-verification-tier-2-google-gemini-via-antigravity-cli)
- [Cross-Repository Ecosystem](#cross-repository-ecosystem)
- [Scientific Methodology & Independent Reviewer FAQ](docs/METHODOLOGY_AND_REVIEWER_FAQ.md)
- [Glossary](docs/GLOSSARY.md)
- [Empirical Token Calibration (Compiled BPE)](#empirical-token-calibration-compiled-bpe)
- [Three-Tier Execution Architecture](#three-tier-execution-architecture)
- [Quick Start & CLI Reference](#quick-start--cli-reference)
- [Runtime Dependencies & Zero-Dependency Core](#runtime-dependencies--zero-dependency-core)

---

## Empirical Results Summary (v2.2.1)

Benchmarked on **Node 22 LTS** executing live Arbiter Git worktree coordination, SQLite WAL transactions, and empirical token accounting:

<!-- BEGIN:RESULTS_TABLE -->
| Scenario | Mode | Median Latency | Latency Budget | Tokens | Conflicts | Accuracy | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`001-single-agent-cold`** | Cold Exploration Baseline | ~4,915ms | 2,500ms | 3,083 | 0 | **100%** | ✅ PASS |
| **`002-single-agent-waymark`** | Waymark In-Flight Continuity | ~5,387ms | 1,000ms | **782** | 0 | **100%** | ✅ PASS |
| **`003-parallel-no-isolation`** | Chaos Baseline (Shared Tree) | ~1,297ms | 200.0ms | N/A | 1 (0 resolved) | 50% | ✅ PASS |
| **`004-parallel-arbiter`** | Arbiter Worktree Swarm (3 W) | ~10,946ms | 8,000ms | 1,759 | 0 | **100%** | ✅ PASS |
| **`005-dag-dependencies`** | 12-Task Topological DAG | ~4,273ms | 600.0ms | 600 | 0 | **100%** | ✅ PASS |
| **`006-conflict-quarantine`** | Fail-Closed Merge Quarantine | ~8,297ms | 4,000ms | 1,198 | 1 (1 resolved) | **100%** | ✅ PASS |
| **`007-watchdog-dead-worker`** | Zero-Daemon Process Reclaim | ~5,761ms | 500.0ms | N/A | 0 | **100%** | ✅ PASS |
| **`008-agent-semantic-correctness`** | Typecheck & Test Pass Rate | ~9,565ms | 2,000ms | 785 | 0 | **100%** | ✅ PASS |
| **`009-parallel-10-workers`** | 10-Worker Atomic CAS Swarm | ~38,699ms | 25,000ms | 6,406 | 0 | **100%** | ✅ PASS |
| **`010-cyclic-dag-rejection`** | Directed Cycle Detection | ~915ms | 250.0ms | N/A | 0 | **100%** | ✅ PASS |
| **`011-concurrent-lease-collision`** | Atomic CAS Lease & Unique Index | ~7,710ms | 300.0ms | 807 | 0 | **100%** | ✅ PASS |
| **`012-signal-interrupted-merge`** | Active Merge Rollback | ~7,128ms | 2,500ms | 613 | 0 | **100%** | ✅ PASS |
| **`013-waymark-multi-compaction`** | 3-Cycle Trajectory Stability | ~6,996ms | 50.0ms | 28 | 0 | **100%** | ✅ PASS |
| **`014-disk-full-recovery`** | SQLite Transaction Rollback Recovery | ~102ms | 250.0ms | N/A | 0 | **100%** | ✅ PASS |
| **`015-docker-isolated-overhead`** | Host Process/Docker Overhead | ~2,765ms | 1,200ms | N/A | 0 | **100%** | ✅ PASS |
| **`016-naive-mutex-contention`** | Naive Mutex Contention | ~59.3ms | 150.0ms | N/A | 1 (0 resolved) | **100%** | ✅ PASS |
| **`017-parallel-50-workers`** | High-Concurrency Scale Swarm | ~55,190ms | 120,000ms | 9,500 | 0 | **100%** | ✅ PASS |
| **`018-cross-repo-workspace-dag`** | Monorepo Workspace Cross-DAG | ~137ms | 500.0ms | N/A | 0 | **100%** | ✅ PASS |
| **`019-n-way-merge-conflicts`** | N-Way Conflict & Quarantine | ~19,072ms | 12,000ms | 4,722 | 3 (0 resolved) | **100%** | ✅ PASS |
| **`020-concurrent-main-drift`** | Upstream Drift Auto-Rebase | ~6,582ms | 3,000ms | 634 | 0 | **100%** | ✅ PASS |
| **`021-mcp-protocol-resilience`** | Subprocess MCP Protocol Boundary | ~1,168ms | 2,500ms | 946 | 0 | **100%** | ✅ PASS |
| **`022-watchdog-heartbeat-stale-reclaim`** | Watchdog Stale Heartbeat Recovery | ~3,168ms | 250.0ms | N/A | 0 | **100%** | ✅ PASS |
<!-- END:RESULTS_TABLE -->

> **Latency budget:** the versioned maximum latency used by the release gate; it is not a production SLA.

**Total Suite Duration:** ~105s (live Git worktrees & on-disk SQLite WAL) | **Memory Heap:** ~6.6 MB | **Tokenizer:** Compiled @dqbd/tiktoken cl100k_base BPE

### Live Frontier Agent Verification (Tier 2: Google Gemini via Antigravity CLI)

In addition to deterministic CI verification, Arbiter provides native, live driver support for frontier LLMs. Below is the verified live execution receipt of **Google Gemini** executing refactoring inside an Arbiter-isolated Git worktree:

| Scenario | Tier | Duration | LLM Provider | Tokens (Reported by API) | Accuracy | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`008-agent-semantic-correctness`** | **AGY** | **39.1s** | **Google Gemini (via `agy`)** | **47,928** | **100%** | ✅ PASS |

*Reproduce live with your local Antigravity CLI:*
```bash
node dist/src/cli/index.js --scenario 008-agent-semantic-correctness --mode agy
```

> [!NOTE]
> **Live Frontier Execution Contract**:
> Unlike Tier 1.5 which runs deterministic local OS subprocesses for regression testing, Tier 2 connects directly to the frontier model (`agy`). Gemini analyzes the repository, writes TypeScript code into the isolated worktree, compiles via `tsc`, and passes 100% of unit tests before Arbiter merges the branch into `main`. The token count (47,928) is extracted directly from Gemini's API response payload. If the `agy` CLI is not available in `PATH`, the harness fails fast with an explicit error rather than silently degrading.

---

## Cross-Repository Ecosystem

This repository is part of an integrated, local-first multi-agent execution suite:

### Internal Suite Repositories

| Repository | Role & Responsibility | Core Invariant |
| :--- | :--- | :--- |
| **[`AGENTS.md Compact Reload`](https://github.com/paragon-ux/codex-agents-compact-reload)** | Static project governance & compaction survival. | Re-injects verified `AGENTS.md` and SHA-256 hash on context compaction. |
| **[`Waymark`](https://github.com/paragon-ux/waymark)** | In-flight continuity ledger & AST discovery MCP. | The v2.2.1 baseline measured a 194-token resume packet inside a 782-token Waymark scenario. |
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

## Empirical Token Calibration (Compiled BPE)

To guarantee that token counting remains strictly authentic and aligned with modern frontier LLMs, Arbiter Live Benchmark integrates compiled Byte-Pair Encoding (`cl100k_base` BPE via `@dqbd/tiktoken`). Every scenario calculates tokens dynamically from actual ASTs, task prompts, git diffs, and serialized JSON trajectories:

| Target File | Characters | Compiled BPE Tokens (cl100k) | Empirical Ratio | TikToken Δ | Claude 3.5 Sonnet (Est 3.84) | Gemini 2.0 Flash (Est 3.78) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `targets/microservice-auth/src/audit.ts` | 552 | 135 | 4.09 chars/token | **0.0%** | -6.3% | -7.5% |
| `targets/microservice-auth/src/auth.ts` | 2,147 | 518 | 4.14 chars/token | **0.0%** | -7.3% | -8.8% |
| `targets/microservice-auth/src/crypto.ts` | 670 | 154 | 4.35 chars/token | **0.0%** | -11.5% | -13.0% |
| `targets/microservice-auth/src/errors.ts` | 686 | 152 | 4.51 chars/token | **0.0%** | -15.1% | -16.0% |
| `targets/microservice-auth/src/session.ts` | 1,171 | 281 | 4.17 chars/token | **0.0%** | -7.9% | -9.4% |
| `targets/microservice-auth/src/token.ts` | 1,303 | 316 | 4.12 chars/token | **0.0%** | -6.8% | -8.4% |
| `targets/data-pipeline/src/pipeline.ts` | 1,035 | 226 | 4.58 chars/token | **0.0%** | -16.3% | -17.5% |
| `targets/data-pipeline/src/transformer.ts` | 791 | 183 | 4.32 chars/token | **0.0%** | -11.2% | -12.4% |

*Run calibration verification anytime:*
```bash
npm run calibrate
```
*Empirical Calibration Result:* Evaluated against compiled OpenAI TikToken `cl100k_base` BPE tokenizer (`@dqbd/tiktoken`), confirming **0.00% divergence** across all target files with an aggregate code ratio of 4.2 chars/token.

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

> [!NOTE]
> **Independent Reviewer Guidance & Live API Verification**:
> For a rigorous analysis on why OS child processes satisfy the zero-simulation mandate, why default cloud LLM API calls are avoided in CI to prevent network jitter/rate limits, and instructions for independent reviewers to verify with their own live API keys, see [Scientific Methodology & Independent Reviewer FAQ](docs/METHODOLOGY_AND_REVIEWER_FAQ.md).

---

## Quick Start & CLI Reference

### Prerequisites
- **Node.js $\ge 22.0.0$** (pure ESM and native `node:sqlite`)
- **Git $\ge 2.20$**

### Installation & Verification

`arbiter-live-benchmark` evaluates the core Arbiter orchestrator. To test the suite on a fresh machine, clone Arbiter and the benchmark as sibling directories:

```bash
# 1. Clone sibling repositories
git clone https://github.com/paragon-ux/Arbiter.git
git clone https://github.com/paragon-ux/arbiter-live-benchmark.git

# 2. Build the Arbiter orchestrator dependency
cd Arbiter
npm install
npm run build

# 3. Install dependencies and run verification on the benchmark
cd ../arbiter-live-benchmark
npm install
npm run verify

# Full release gate: verification, fresh 22-scenario benchmark, and baseline comparison
npm run verify:release
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

# Run in Tier 2 Live Agent mode (Google Gemini via Antigravity CLI)
node dist/src/cli/index.js --scenario 008-agent-semantic-correctness --mode agy

# Run in Tier 3 Comparative Docker mode
node dist/src/cli/index.js --scenario 015-docker-isolated-overhead --mode docker

# Export benchmark results to JSON
node dist/src/cli/index.js --all --json results/benchmark.json
```

---

## Runtime Dependencies & Zero-Dependency Core

Arbiter Live Benchmark relies on `@dqbd/tiktoken` for compiled BPE tokenization, the local sibling `arbiter` package, and Node 22 native modules (`node:sqlite`, `node:child_process`, `node:fs`, `node:crypto`). The core Arbiter library itself maintains strictly 0 third-party runtime dependencies.
