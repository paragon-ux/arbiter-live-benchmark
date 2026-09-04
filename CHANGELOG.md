# Changelog

All notable changes to **arbiter-live-benchmark** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.0] — 2026-09-04 ("Failure Mode Expansion & Architectural Hardening")

### Added
- **Scenario 019: N-Way Concurrent Merge Conflicts & Worktree Quarantine (`019-n-way-merge-conflicts.json`)**:
  - Evaluates 5 concurrent workers in isolated worktrees: 2 workers make orthogonal non-conflicting edits and merge cleanly into `main`, while 3 workers introduce colliding modifications on overlapping lines of `src/auth.ts`.
  - Validates that Arbiter cleanly merges independent feature branches, detects 3-way collisions, immediately executes `git merge --abort`, isolates failing worktrees in `CONFLICT`, and keeps `main` pristine.
- **Scenario 020: Concurrent Upstream Main Drift & Auto-Rebase Synchronization (`020-concurrent-main-drift.json`)**:
  - Evaluates a feature worker operating in a worktree while an upstream commit is pushed directly to `main` mid-flight (simulating external team or CI merges).
  - Validates that Arbiter's `MergeQueue` synchronizes upstream drift, cleanly executes 3-way merge/rebase reconciliation, and verifies full commit preservation on `main`.
- **PRNG Multi-Run Determinism Verification**:
  - Added unit test asserting 100% byte-for-byte determinism in token accounting, file scanning, and state recovery across repeated scenario executions.
- **Reference Baseline `BASELINE_v1.1.0.json`**:
  - Established locked empirical reference covering all 20 scenarios with 0 regressions.

### Changed
- **Unified Token Calculation**:
  - Reconciled character-to-token math across `src/harness/tokens.ts` and `src/harness/metrics.ts` to a single canonical standard (3.8 characters per token via `countTokens`).
- **Dynamic Relative Jitter Threshold in Comparator**:
  - Replaced the fixed 25ms absolute jitter floor in `scripts/compare-baseline.mjs` with an adaptive relative threshold: `Math.max(1.5, Math.min(50.0, baseDuration * 0.20))`.
  - Eliminates blind spots for sub-millisecond scenarios while remaining immune to OS scheduling jitter.
- **Scenario Timeout Protection**:
  - Added timeout enforcement via `Promise.race` in `BenchmarkOrchestrator` to prevent hanging processes during scenario execution.
- **Multi-Trial Duration Preservation**:
  - Added `rawDurationMs` and `trialHistory` tracking to `ScenarioResult` to prevent statistical medians from discarding raw multi-trial execution data.
- **Strongly Typed `ScenarioMetrics` & Detail Interfaces**:
  - Added strongly typed detail interfaces (`NWayConflictDetails`, `UpstreamMainDriftDetails`, `ColdExplorationDetails`, etc.) and optional top-level metrics in `src/harness/types.ts`.
- **Platform Tolerance Rationale**:
  - Updated `REGRESSION_TOLERANCES.json` with technical justification for Windows 100% duration tolerance (NTFS filter drivers, mandatory handle locks, and Defender real-time scanning during rapid `git.exe` spawns vs Linux ext4/APFS).
- **BOM Defense & Strict Schema Validation**:
  - Defensively stripped UTF-8 BOM characters in `BenchmarkOrchestrator.loadScenarios` and hardened `test/scenarios.test.ts` to strictly validate all 20 scenario definitions.

---

## [1.0.0] — 2026-09-04 ("Live Empirical Multi-Agent Benchmark")

### Initial Release: Genuine Live Multi-Agent Verification Suite
This release replaces synthetic and mock simulations with genuine live empirical multi-agent orchestration benchmarking against the Arbiter core engine, Waymark continuity ledgers, and Git worktrees.

### Key Architectural Capabilities
- **Live Empirical Engine Execution (`DeterministicAdapter`)**:
  - Direct integration with sibling `arbiter` package (`WorktreeManager`, `TaskGraph`, `MergeQueue`, `LeaseWatchdog`, `WaymarkSupervisor`, `ArbiterDatabase`).
  - Executes real ephemeral Git worktrees on temporary repositories, isolated feature branches (`arbiter/task-*`), SQLite WAL transactions, and fail-closed merge aborts (`git merge --abort`).
- **Empirical Token Accounting**:
  - Measures genuine token spend from target codebase AST files (`targets/microservice-auth`, `targets/data-pipeline`) against serialized Waymark trajectory states (`.waymark/`).
  - Empirically proves **>75% token reduction** on post-compaction recovery (<216 tokens vs. 7,120 cold re-read).
- **Subprocess MCP Child Process Architecture (Tier 1.5)**:
  - Spawns real OS child processes executing Arbiter's native MCP server over JSON-RPC 2.0 `stdio`.
  - Exercises full multi-agent task claims, worktree modifications, and merge queues via stdio communication without external LLM API fees.
- **Comparative Baseline Adapters (Tier 3)**:
  - `DockerIsolatedAdapter`: Quantifies containerization lifecycle startup and teardown latency (~270–650ms vs. sub-5ms for worktrees).
  - `NaiveMutexAdapter`: Empirical negative baseline demonstrating file-level lock contention and corrupted un-isolated `main` branches.
  - `ProcessPoolAdapter`: Worker process pool coordination without worktree filesystem isolation.
- **Eighteen Complete Empirical Scenarios (001–018)**:
  - `001-single-agent-cold`: Cold codebase exploration baseline (~7,120 tokens).
  - `002-single-agent-waymark`: In-flight continuity resume (<216 tokens, >75% token reduction).
  - `003-parallel-no-isolation`: Uncoordinated multi-agent chaos baseline demonstrating file clobbering.
  - `004-parallel-arbiter`: 3-worker Arbiter worktree swarm with clean sequential merges.
  - `005-dag-dependencies`: 12-task DAG dependency topological scheduling via Kahn algorithm.
  - `006-conflict-quarantine`: Real conflicting edits triggering automatic `git merge --abort` and quarantine in `CONFLICT`.
  - `007-watchdog-dead-worker`: Zero-daemon dead worker process detection via `process.kill(pid, 0)` and atomic lease recovery.
  - `008-agent-semantic-correctness`: Multi-step refactoring in worktree verifying TypeScript compilation and 100% test pass rate.
  - `009-parallel-10-workers`: 10 concurrent agent workers stressing SQLite WAL mode and worktree provisioning.
  - `010-cyclic-dag-rejection`: Directed cycle detection rejecting invalid DAGs with rollback.
  - `011-concurrent-lease-collision`: Concurrent task lease collision verifying atomic acquisition and `EAGAIN` backoff.
  - `012-signal-interrupted-merge`: `SIGTERM` interrupt mid-merge verifying fail-closed rollback to clean `main`.
  - `013-waymark-multi-compaction`: 3 sequential context compactions verifying trajectory hash stability.
  - `014-disk-full-recovery`: `ENOSPC` disk-full simulation verifying database rollback and clean lease release.
  - `015-docker-isolated-overhead`: Comparative container startup evaluation showing worktrees provide equivalent isolation at >80x lower latency.
  - `016-naive-mutex-contention`: Contention and starvation baseline under naive file-level mutex.
  - `017-parallel-50-workers`: High-concurrency saturation scale test validating SQLite WAL write serialization.
  - `018-cross-repo-workspace-dag`: Cross-package monorepo workspace DAG dependency resolution.
- **Statistical Multi-Trial Engine**:
  - Supports `--trials <N>` CLI option computing Median (P50), Mean, Standard Deviation ($\sigma$), P95, P99, and Coefficient of Variation (CV).
- **Automated Regression Comparator (`scripts/compare-baseline.mjs`)**:
  - Validates current run against locked reference `BASELINE_v1.0.0.json` with platform-stratified tolerances (`REGRESSION_TOLERANCES.json`).
- **Zero Third-Party Runtime Dependencies**:
  - Exclusively built on native Node.js 22 LTS modules (`node:sqlite`, `node:child_process`, `node:fs`, `node:crypto`) plus the local sibling `arbiter` package.
