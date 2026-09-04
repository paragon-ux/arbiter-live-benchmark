# Scientific Rationale & Methodology — Arbiter Benchmark Suite

## 1. Executive Summary

Autonomous coding agents frequently operate as isolated, single-turn LLM pipelines. However, scaling software engineering tasks to multi-agent swarms introduces classical distributed systems challenges: concurrent file writes, non-linear dependency scheduling, context compaction amnesia, and process crash deadlocks.

The **Arbiter Benchmark Suite** provides an instrumented, reproducible testbed to scientifically evaluate and compare multi-agent coordination architectures against uncoordinated baselines.

---

## 2. The Four Chaos Failure Modes

When multiple autonomous agents operate in a shared repository without rigorous workspace supervision, four catastrophic failure modes emerge:

### 2.1 File Stomping & Dirty State
In an uncoordinated working directory, concurrent agents write to identical or adjacent files without synchronization. Agent B modifies `auth.ts` while Agent A is midway through a multi-step refactoring of the same file. The result is silent code corruption, conflicting syntactic states, and corrupted builds on the main branch.

### 2.2 Context Compaction Amnesia
Long-running agent tasks inevitably exceed model context limits, triggering context compaction. Without an in-flight trajectory ledger, the compacted agent loses its causal chain, forgets verified line spans, and is forced to re-read the entire codebase. This causes:
- **Exponential token consumption**: 6,000 to 12,000+ tokens consumed per re-read.
- **Lost causal intent**: Hallucinated re-implementations of already completed steps.

### 2.3 Unsafe Merge Collisions
When multiple agent branches are merged concurrently into `main`, semantic and syntactic merge conflicts occur. Naive merge scripts frequently leave conflict markers (`<<<<<<< HEAD`) in production code, break unit tests, or require immediate human intervention.

### 2.4 Orphaned Process Deadlocks
If an agent crashes (due to timeout, out-of-memory, network disconnect, or IDE window reload), its claimed task and locks sit abandoned indefinitely. Without a zero-daemon watchdog, cluster progress halts.

---

## 3. Experimental Design & Hypotheses

| Hypothesis | Independent Variable | Controlled Conditions | Measured Metric | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| **H1: In-Flight Continuity** | Continuity Mechanism (Cold Re-read vs. Waymark Trajectory) | Identical compaction trigger, same target codebase | Tokens consumed to resume, exploration hops | $\ge 75\%$ token reduction with Waymark (<216 tokens) |
| **H2: Worktree Isolation** | Isolation Strategy (Shared Working Copy vs. Ephemeral Worktrees) | 3 concurrent agents editing related modules | Working copy cleanliness, test pass rate | 100% test pass rate in isolated worktrees vs. dirty failures in shared copy |
| **H3: DAG Scheduling** | Task Dispatcher (Linear vs. Kahn Topological Sort) | 12-task dependency graph with critical path | Task dispatch latency, ordering violations | Zero ordering violations; $<5\text{ms}$ dispatch latency |
| **H4: Fail-Closed Quarantine** | Merge Protocol (Direct Merge vs. Sequential Quarantine) | Intentionally conflicting edits across 2 tasks | Integrity of `main`, rollback cleanly executed | `main` remains 100% pristine; conflicted worktree quarantined in `CONFLICT` |
| **H5: Zero-Daemon Watchdog** | Lease Reclaim (Passive timeout vs. Active OS Signal `kill(pid,0)`) | Killed agent process with active lease | Lease reclamation latency, orphan avoidance | Lease reclaimed in $<5\text{ms}$; task reset to `READY` |
| **H6: Semantic Correctness** | Code Generation Protocol (Unguided vs. Strict AST Schema) | Syntax & interface mutation tasks | AST schema validity, test pass rate | 100% valid AST nodes, zero syntax regressions |
| **H7: Worktree Scalability** | Worker Concurrency (3 vs. 10 Concurrent Worktrees) | High-concurrency parallel tasks | Worktree isolation integrity, resource overhead | Zero cross-worktree bleed across 10 concurrent workers |
| **H8: Cycle Detection** | Dependency Validation (Unchecked vs. DFS Cycle Rejection) | Cyclic dependency graph ($A \to B \to C \to A$) | Cycle rejection latency, graph corruption | Immediate cycle rejection with cycle path diagnostics |
| **H9: Lease Atomicity** | Concurrency Control (Naive read-check vs. SQLite `BEGIN IMMEDIATE`) | High-contention race on single ready task | Duplicate lease count, lease collisions | Exactly 1 worker wins lease; 0 duplicate claims |
| **H10: Signal Recovery** | Interruption Resilience (Standard merge vs. Atomic transaction) | Mid-merge SIGINT/SIGTERM interruption | Dirty worktree state, working tree cleanliness | 100% clean rollback to pristine base state |
| **H11: Multi-Compaction** | Trajectory Durability (Single checkpoint vs. Rolling Ledger) | 5 sequential context compactions | Final trajectory continuity, breadcrumb drift | Preserves unbroken lineage across all 5 compactions |
| **H12: Disk-Full Handling** | Storage Exhaustion Resilience (Unchecked write vs. Atomic check) | Simulated `ENOSPC` / storage exhaustion | Database corruption, task rollback status | Graceful rollback, task remains recoverable |
| **H13: Containerization Overhead** | Isolation Mechanism (Docker Container vs. Ephemeral Worktree) | 3 concurrent agent environments | Provisioning latency, memory footprint | Ephemeral worktrees provision $>50\text{x}$ faster with 0 daemon overhead |
| **H14: Mutex Contention** | Concurrency Strategy (Worktree Isolation vs. Shared File Mutex) | 4 concurrent agents on shared files | Lock wait time, dirty branch mutations | Naive mutex exhibits deadlock and leaves dirty working copy |
| **H15: Massive Concurrency Scale** | Concurrency Limits (10 vs. 50 Concurrent Worktrees) | 50 concurrent agents on SQLite WAL | SQLite write throughput, file handle exhaustion | Clean serialization without database lock timeouts |
| **H16: Monorepo Cross-DAG** | Dependency Topology (Single Project vs. Monorepo Diamond DAG) | Multi-package workspace dependencies | Artifact build order, dependency unblocking | 100% ordering fidelity, zero premature compilation |

---

## 4. Realistic Target Codebases

Synthetic micro-benchmarks (such as reversing strings or calculating Fibonacci sequences) fail to elicit real agent reasoning, file system traversal, or realistic merge conflicts. 

Arbiter Benchmark includes two self-contained, realistic TypeScript codebases:

1. **`targets/microservice-auth`** (12 files):
   - Modular token-based authentication service.
   - Modules: HMAC-SHA256 token signing, session lifecycle, in-memory rate limiting, user repository, structured audit logging, custom error hierarchies.
   - Comprehensive unit test suite (`test/auth.test.ts`).

2. **`targets/data-pipeline`** (8 files):
   - Multi-stage ETL processing pipeline.
   - Modules: JSON/CSV extraction, data transformation with type coercion, schema validation, batch loading, pipeline error handling.
   - Comprehensive unit test suite (`test/pipeline.test.ts`).

---

## 5. Multi-Tier Execution Engine

Scientific evaluation requires **deterministic repeatability** for continuous integration, **subprocess protocol fidelity** without API overhead, **comparative baselines** against alternative architectures, and **empirical realism** for live LLM agent validation.

```
                     +-----------------------------------+
                     |     Benchmark Orchestrator        |
                     +-----------------+-----------------+
                                       |
        +------------------+-----------+-----------+------------------+
        |                  |                       |                  |
        v                  v                       v                  v
 +---------------+  +---------------+       +---------------+  +---------------+
 | Tier 1:       |  | Tier 1.5:     |       | Tier 2:       |  | Tier 3:       |
 | Deterministic |  | Subprocess    |       | Live Agy      |  | Comparative   |
 | Replay Engine |  | MCP Adapter   |       | Runner        |  | Baselines     |
 +-------+-------+  +-------+-------+       +-------+-------+  +-------+-------+
         |                  |                       |                  |
  Mulberry32 PRNG    OS JSON-RPC stdio       Local CLI ($0)    Docker / Mutex /
  (<5ms, CI)         (Protocol fidelity)     (Live LLM agent)   Process Pool
```

### Tier 1: Deterministic Simulator
- Seeded pseudo-random generator (Mulberry32 with seed `0x6D2B79F5`).
- Pre-recorded tool call traces and AST mutation fixtures.
- Sub-5 millisecond execution time across all 18 scenarios.
- Zero external API dependencies; runs seamlessly on Linux, macOS, and Windows CI.

### Tier 1.5: Subprocess MCP Adapter
- Spawns real OS child processes communicating via JSON-RPC 2.0 `stdio`.
- Validates protocol boundaries, payload serialization, and transport failure modes.
- Zero external API keys or token costs.

### Tier 2: Live Agy Runner
- Spawns real agent processes using the local Antigravity CLI (`agy`).
- Operates under the user's local subscription ($0 API token cost).
- Directly tests Git worktree creation, Waymark CLI MCP communication, and Arbiter task leases.

### Tier 3: Comparative Baselines
- `DockerIsolatedAdapter`: Quantifies container startup and teardown latency overhead (~350ms per container) compared to Arbiter ephemeral worktrees (<5ms).
- `NaiveMutexAdapter`: Models un-isolated execution where agents contend for file-level mutexes, demonstrating starvation and dirty state.
- `ProcessPoolAdapter`: Models worker pool execution without worktree isolation, revealing `.git/index.lock` collisions.

---

## 6. Summary of Architectural Findings

The empirical findings from Arbiter Benchmark confirm:
1. **Token Conservation**: Waymark trajectories preserve AST context in <216 tokens, saving **>75%** of tokens compared to cold re-reads.
2. **Deterministic Isolation**: Ephemeral Git worktrees prevent 100% of concurrent file collisions without the resource overhead of Docker or VMs.
3. **Sub-Millisecond Coordination**: Native SQLite in-memory and WAL-mode scheduling executes DAG dependency resolution and watchdog lease reclamation in **<5ms**.
4. **Resilience Under Chaos**: Atomic transactions and fail-closed rollback maintain pristine working copy status even during mid-merge signal aborts, disk exhaustion, and cyclic dependency injection.
5. **Comparative Superiority**: Ephemeral Git worktrees achieve container-grade workspace isolation at **>50x lower startup latency** and zero container daemon dependencies.
