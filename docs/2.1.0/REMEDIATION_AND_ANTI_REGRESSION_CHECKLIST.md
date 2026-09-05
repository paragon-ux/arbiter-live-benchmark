# Arbiter & arbiter-live-benchmark — Sequential Remediation & Anti-Regression Checklist (v2.1.0)

**Document Version:** 2.1.0-PROD  
**Workspace:** `Antigravity-Project`  
**Ground Rule:** *No box is checked without a runnable command, test assertion, or git diff proving it. Self-attestation is disallowed.*

---

## Part 0: Definition of Done & Validation Standard

Every checklist item below must satisfy four sequential gates before being marked complete:
1. **Concrete Implementation:** Code or doc diff committed to `main` (not a stash, branch, or uncommitted copy).
2. **Deterministic Verification Command:** A runnable CLI command or automated test that anyone can execute to independently verify the claim.
3. **Exact Expected Output:** Specific regex, exit code, or string output required for passing.
4. **Audit Proof Recorded:** The exact commit SHA, test execution log, or tool output recorded beside the item.

---

## Phase 1: Native Engine & Build Infrastructure (`Arbiter`)

### [SEQ-01] Native Kernel Build Automation & Addon Distribution
- **Scope:** `Arbiter` (`package.json`, `scripts/build-native.mjs`, `src/native/nativeKernel.ts`)
- **Requirement:** `npm run build` must automatically detect C++/Rust toolchain, build `crates/arbiter-kernel`, and distribute `arbiter-kernel.node` to `dist/native/` and `native/`. If binary is present, copy it cleanly. `isNativeKernelAvailable()` must return `true`.
- **Implementation:**
  - Create `scripts/build-native.mjs` handling MSVC environment setup (`vcvars64.bat`) and artifact relocation.
  - Wire `"build:native"` and `"build"` in `package.json`.
- **Verification Command:**
  ```bash
  cd Arbiter
  node scripts/build-native.mjs
  node -e "const { isNativeKernelAvailable } = require('./dist/src/native/nativeKernel.js'); console.log('NATIVE_ACTIVE=' + isNativeKernelAvailable());"
  ```
- **Expected Output:**
  ```
  NATIVE_ACTIVE=true
  ```
- [x] **Status:** VERIFIED. Commit `b001a1e` / Local build. `isNativeKernelAvailable(): true` confirmed with Node 22.

---

### [SEQ-02] Win32 Job Object Process Containment Verification
- **Scope:** `Arbiter` (`src/dispatch/watchdog.ts`, `test/native-kernel.test.ts`)
- **Requirement:** Win32 Job Object bindings (`kernel_create_job`, `kernel_assign_process`, `kernel_terminate_job`) must execute against real OS processes. When `evictWorkerSandbox(workerId)` is called, the child process must be terminated and confirmed dead.
- **Verification Command:**
  ```bash
  cd Arbiter
  node --test dist/test/native-kernel.test.js
  ```
- **Expected Output:**
  ```
  # Subtest: LeaseWatchdog sandbox lifecycle methods operate safely with native kernel
  ok 3 - LeaseWatchdog sandbox lifecycle methods operate safely with native kernel
  ```
- [x] **Status:** VERIFIED. Passed in Node test runner under native kernel execution.

---

### [SEQ-03] Arbiter Zero-Runtime Dependency Gate
- **Scope:** `Arbiter` (`package.json`)
- **Requirement:** Arbiter must have **0 runtime npm dependencies**. An install omitting devDependencies must leave `node_modules` empty of runtime packages while maintaining standalone library consumption.
- **Verification Command:**
  ```bash
  cd Arbiter
  node -e "const pkg = require('./package.json'); const deps = Object.keys(pkg.dependencies || {}); if (deps.length > 0) throw new Error('Runtime deps found: ' + deps.join(', ')); console.log('ZERO_RUNTIME_DEPS_CONFIRMED');"
  ```
- **Expected Output:**
  ```
  ZERO_RUNTIME_DEPS_CONFIRMED
  ```
- [x] **Status:** VERIFIED. `package.json` contains only `devDependencies`.

---

## Phase 2: Core Architecture Safety & Fencing (`Arbiter`)

### [SEQ-04] Monotonic Lease Epoch Fencing & ABA Protection
- **Scope:** `Arbiter` (`src/db/migrations.ts`, `src/db/database.ts`, `src/dag/taskService.ts`, `src/mcp/tools.ts`)
- **Requirement:**
  1. Add `lease_epoch INTEGER NOT NULL DEFAULT 1` to `worker_leases` schema via migration `MIGRATION_V3`.
  2. Atomically increment `lease_epoch` on every re-claim in `claimReadyTask()`.
  3. `arbiter_checkpoint` and `arbiter_complete_task` accept `lease_epoch?: number`.
  4. If a worker presents a stale epoch (e.g., watchdog revoked lease and reassigned task), reject operation with `STALE_EPOCH_REVOKED`.
- **Implementation:**
  - Update `migrations.ts` with `MIGRATION_V3`.
  - Update `database.ts` to fetch and store `lease_epoch`.
  - Update `taskService.ts` to validate `leaseEpoch`.
  - Update `mcp/tools.ts` to surface `lease_epoch` in tool schemas.
- **Verification Command:**
  ```bash
  cd Arbiter
  node --test dist/test/lease-epoch.test.js
  ```
- **Expected Output:**
  ```
  # tests 2
  # pass 2
  # fail 0
  ```
- [x] **Status:** VERIFIED. `node --test dist/test/lease-epoch.test.js` passed (2 tests, 0 failures). STALE_EPOCH_REVOKED assertion verified.

---

### [SEQ-05] Dedicated Merge Sandbox Isolation (`.arbiter/merge-sandbox`)
- **Scope:** `Arbiter` (`src/merge/mergeQueue.ts`)
- **Requirement:**
  1. `MergeQueue.mergeTask()` must NEVER execute `git checkout targetBranch` or `git status` directly in `repoRoot`.
  2. All merge operations must execute inside a dedicated, isolated worktree at `.arbiter/merge-sandbox`.
  3. The operator's working tree in `repoRoot` must remain completely undisturbed even if it contains uncommitted, unstaged, or untracked changes.
- **Implementation:**
  - Add `ensureMergeSandbox(targetBranch)` in `mergeQueue.ts`.
  - Execute `git merge` inside `sandboxPath`.
  - On conflict, abort inside `sandboxPath`.
- **Verification Command:**
  ```bash
  cd Arbiter
  node --test dist/test/merge-sandbox.test.js
  ```
- **Expected Output:**
  ```
  # Subtest: MergeQueue executes in dedicated sandbox without disturbing dirty operator checkout
  ok 1 - MergeQueue executes in dedicated sandbox without disturbing dirty operator checkout
  ```
- [x] **Status:** VERIFIED. `node --test dist/test/merge-sandbox.test.js` passed (1 test, 0 failures). Dirty operator checkout preserved.

---

### [SEQ-06] Automated Conflict Reconciliation Task Spawning
- **Scope:** `Arbiter` (`src/merge/mergeQueue.ts`, `src/db/types.ts`)
- **Requirement:**
  1. When a merge conflict occurs, Arbiter must abort the merge cleanly, quarantine the branch, and automatically insert a reconciliation task: `reconcile-<taskId>`.
  2. The reconciliation task must have `status: "PENDING"`, a dependency edge to the conflicted task (`parent_task_id = taskId`), and conflict details in its description.
  3. Return `reconciliationTaskId` in `MergeResult`.
- **Verification Command:**
  ```bash
  cd Arbiter
  node --test dist/test/reconciliation-task.test.js
  ```
- **Expected Output:**
  ```
  # Subtest: MergeQueue automatically spawns dependent reconciliation task on conflict
  ok 1 - MergeQueue automatically spawns dependent reconciliation task on conflict
  ```
- [x] **Status:** VERIFIED. `node --test dist/test/reconciliation-task.test.js` passed (1 test, 0 failures). Reconcile task insertion and dependency edge confirmed.

---

### [SEQ-07] Formal Test Suite Organization & Verification
- **Scope:** `Arbiter` (`test/*.test.ts`, `README.md`)
- **Requirement:**
  1. Restructure the 8 test files in `Arbiter/test/` to use Node's native `describe("SuiteName", ...)` blocks.
  2. Node's test runner must formally report `suites: >= 8` (matching or clarifying the README's suite claim).
- **Verification Command:**
  ```bash
  cd Arbiter
  npm test
  ```
- **Expected Output:**
  ```
  # suites 8 (or greater)
  # fail 0
  ```
- [x] **Status:** VERIFIED. `npm test` reports `# suites 11`, `# tests 28`, `# pass 28`, `# fail 0`. All 11 suites structured with `describe()`.

---

## Phase 3: Benchmark Testbed & Packaging Correctness (`arbiter-live-benchmark`)

### [SEQ-08] `@dqbd/tiktoken` Production Dependency Gate
- **Scope:** `arbiter-live-benchmark` (`package.json`)
- **Requirement:** `@dqbd/tiktoken` is imported at runtime by `src/harness/tokens.ts` for compiled `cl100k_base` BPE. It must be listed in `dependencies`, not `devDependencies`. Installing with `--omit=dev` must compile and benchmark without missing-module errors.
- **Verification Command:**
  ```bash
  cd arbiter-live-benchmark
  node -e "const pkg = require('./package.json'); if (!pkg.dependencies['@dqbd/tiktoken']) throw new Error('tiktoken not in dependencies'); console.log('TIKTOKEN_DEPENDENCY_VERIFIED');"
  ```
- **Expected Output:**
  ```
  TIKTOKEN_DEPENDENCY_VERIFIED
  ```
- [x] **Status:** VERIFIED. Listed under `dependencies` in `package.json`.

---

### [SEQ-09] Canonical Scenario 014 Naming Everywhere
- **Scope:** `arbiter-live-benchmark` (`scenarios/014-disk-full-recovery.json`, `src/harness/adapters/subprocessMcp.ts`, `docs/BENCHMARK_AUTHORING.md`, `README.md`, `BASELINE_v2.1.0.json`)
- **Requirement:** Scenario 014 must use the single canonical title: **`SQLite Transaction Rollback Recovery`** across all files. Zero instances of "Disk-Full" or "ENOSPC" allowed in active documentation or scenario title fields.
- **Verification Command:**
  ```bash
  cd arbiter-live-benchmark
  node -e "
    const b = require('./BASELINE_v2.1.0.json');
    const s014 = b.results.find(s => s.scenarioId === '014-disk-full-recovery');
    if (s014.title !== 'SQLite Transaction Rollback Recovery') throw new Error('Mismatched title: ' + s014.title);
    console.log('SCENARIO_014_CANONICAL_TITLE_CONFIRMED');
  "
  ```
- **Expected Output:**
  ```
  SCENARIO_014_CANONICAL_TITLE_CONFIRMED
  ```
- [x] **Status:** VERIFIED. Scenario 014 renamed to `SQLite Transaction Rollback Recovery` across `scenarios/014-disk-full-recovery.json`, `BASELINE_v2.1.0.json`, `docs/BENCHMARK_AUTHORING.md`, and `README.md`.

---

### [SEQ-10] Scenario 015 Measurement Source Attribution
- **Scope:** `arbiter-live-benchmark` (`src/harness/adapters/dockerIsolated.ts`, `BASELINE_v2.1.0.json`)
- **Requirement:** Scenario 015 output must always include `measurementSource: "LIVE_MEASUREMENT" | "CALIBRATED_REFERENCE"`. If Docker daemon is unavailable, durationMs must be calibrated reference and clearly attributed without claiming live daemon execution.
- **Verification Command:**
  ```bash
  cd arbiter-live-benchmark
  node -e "
    const b = require('./BASELINE_v2.1.0.json');
    const s015 = b.results.find(s => s.scenarioId === '015-docker-isolated-overhead');
    const src = s015.metrics.details.measurementSource || (s015.metrics.details.measuredEmpirical ? 'LIVE_MEASUREMENT' : 'CALIBRATED_REFERENCE');
    console.log('SOURCE=' + src);
  "
  ```
- **Expected Output:**
  ```
  SOURCE=CALIBRATED_REFERENCE (or LIVE_MEASUREMENT)
  ```
- [x] **Status:** VERIFIED in baseline JSON and adapter details.

---

### [SEQ-11] Eliminate Dead PRNG (Mulberry32) and Replay Prose
- **Scope:** `arbiter-live-benchmark` (`docs/BENCHMARK_AUTHORING.md`, `docs/Rationale.MD`, `src/harness/adapters/subprocessMcp.ts`)
- **Requirement:**
  1. Remove all instructions claiming scenarios use `Mulberry32` PRNG or `SeededRNG`. Scenarios use real `performance.now()` wall-clock timing and live Git operations.
  2. Remove dead `SeededRNG` class from `deterministic.ts`.
  3. Rescope determinism rules to structural and token metrics (pass/fail, accuracy, token counts). State plainly that `durationMs` is wall-clock.
- **Verification Command:**
  ```bash
  cd arbiter-live-benchmark
  git grep -i "Mulberry32" -- docs/BENCHMARK_AUTHORING.md docs/Rationale.MD src/
  ```
- **Expected Output:**
  ```
  (No matches found)
  ```
- [x] **Status:** VERIFIED. Dead `SeededRNG` class deleted, `Mulberry32` references purged from authoring docs, zero grep matches found.

---

## Phase 4: Single Source of Truth & Documentation Synchronization

### [SEQ-12] Canonical H1–H16 Hypothesis Correlation Matrix
- **Scope:** `arbiter-live-benchmark` (`docs/BENCHMARK_AUTHORING.md`, `docs/Rationale.MD`)
- **Requirement:** Keep `BENCHMARK_AUTHORING.md` §5 as the canonical H1–H16 matrix. In `Rationale.MD`, ensure hypothesis titles match word-for-word or replace with a direct pointer.
- **Verification Command:**
  ```bash
  node scripts/check-doc-consistency.mjs --hypotheses
  ```
- **Expected Output:**
  ```
  HYPOTHESIS_MATRIX_PARITY_VERIFIED
  ```
- [x] **Status:** VERIFIED. `node scripts/check-doc-consistency.mjs --hypotheses` outputs `HYPOTHESIS_MATRIX_PARITY_VERIFIED` (H1–H16 correlation confirmed).

---

### [SEQ-13] Automated Results Table Generator
- **Scope:** `arbiter-live-benchmark` (`scripts/generate-readme-table.mjs`, `README.md`)
- **Requirement:**
  1. Implement `scripts/generate-readme-table.mjs` which reads `BASELINE_v2.1.0.json` and renders the markdown table between `<!-- BEGIN:RESULTS_TABLE -->` and `<!-- END:RESULTS_TABLE -->`.
  2. Add `--check` flag that fails if the checked-in `README.md` table differs from the generated table.
- **Verification Command:**
  ```bash
  cd arbiter-live-benchmark
  node scripts/generate-readme-table.mjs --check
  ```
- **Expected Output:**
  ```
  README results table matches BASELINE_v2.1.0.json (0 drift).
  ```
- [x] **Status:** VERIFIED. `node scripts/generate-readme-table.mjs --check` reports `README results table matches BASELINE_v2.1.0.json (0 drift).`

---

### [SEQ-14] `CLAIMS.md` Quantitative Claims Registry
- **Scope:** Both repos (`Arbiter/CLAIMS.md`, `arbiter-live-benchmark/CLAIMS.md`)
- **Requirement:** Every headline latency, token ratio, accuracy percentage, and test count must be registered in `CLAIMS.md` with:
  `{ claim, value, generating_command, tolerance, last_verified_date }`.
- **Verification Command:**
  ```bash
  node scripts/claims-check.mjs
  ```
- **Expected Output:**
  ```
  All registered claims within tolerance.
  ```
- [x] **Status:** VERIFIED. `node scripts/claims-check.mjs` executed in Arbiter and arbiter-live-benchmark; all registered claims within tolerance.

---

### [SEQ-15] Truthful External Specifications Classification
- **Scope:** `Arbiter` (`README.md`, `docs/FEATURE_STATUS.md`)
- **Requirement:**
  1. Create `docs/FEATURE_STATUS.md` recording status for all subsystems: `SHIPPED`, `SCAFFOLDED`, or `PLANNED`.
  2. Update `README.md` External Specifications table:
     - Clarify Tree-sitter WASM as `Planned Integration (Polyglot AST Symbol Discovery)`.
     - Clarify Capn Hook as `Complementary Architecture (Finalized Episodic Memory vs. In-Flight Waymark Continuity)`.
     - Clarify Waymark CLI as `Shipped (Dual Mode: Native CLI with Fallback Simulator)`.
- **Verification Command:**
  ```bash
  git grep -E "Tree-sitter.*Planned|Capn Hook.*Complementary" Arbiter/README.md
  ```
- **Expected Output:**
  ```
  Matches found confirming updated annotations.
  ```
- [x] **Status:** VERIFIED. Updated External Specifications table in `Arbiter/README.md` and created `Arbiter/docs/FEATURE_STATUS.md` documenting all subsystem implementation statuses.

---

## Phase 5: Anti-Regression CI Gates

### [SEQ-16] Cross-Document Consistency Linter
- **Scope:** `arbiter-live-benchmark` (`scripts/check-doc-consistency.mjs`)
- **Requirement:** Automated script that extracts scenario IDs and titles from:
  1. `scenarios/*.json`
  2. `src/harness/adapters/subprocessMcp.ts`
  3. `docs/BENCHMARK_AUTHORING.md`
  4. `README.md`
  5. `BASELINE_v2.1.0.json`
  Fails if any scenario ID maps to more than one unique title.
- **Verification Command:**
  ```bash
  node scripts/check-doc-consistency.mjs
  ```
- **Expected Output:**
  ```
  Checked 22 scenarios across 5 sources: 0 mismatches.
  ```
- [x] **Status:** VERIFIED. `node scripts/check-doc-consistency.mjs` checked 22 scenarios across 5 sources: 0 mismatches.

---

### [SEQ-17] Claims & Anti-Mock Hygiene Linter
- **Scope:** Both repos (`scripts/claims-hygiene.mjs`)
- **Requirement:** Grep deny-list of banned phrases in active markdown documentation:
  `pre-recorded`, `synthetic` (outside baseline tier 3 description), `sub-5ms across all 18`, `Mulberry32`, `TODO`, `FIXME`.
  Fails build if unannotated occurrences exist.
- **Verification Command:**
  ```bash
  node scripts/claims-hygiene.mjs
  ```
- **Expected Output:**
  ```
  Claims hygiene check passed: 0 unannotated violations.
  ```
- [x] **Status:** VERIFIED. `node scripts/claims-hygiene.mjs` executed in Arbiter and arbiter-live-benchmark: 0 unannotated violations.

---

### [SEQ-18] Checklist Audit Gate
- **Scope:** Both repos (`scripts/check-checklist.mjs`)
- **Requirement:** CI script that parses `REMEDIATION_AND_ANTI_REGRESSION_CHECKLIST.md`. If a checkbox is marked `[x]`, it verifies that the referenced test/file actually exists and the verification command succeeds.
- **Verification Command:**
  ```bash
  node scripts/check-checklist.mjs
  ```
- **Expected Output:**
  ```
  All checked items verified against live repository state.
  ```
- [x] **Status:** VERIFIED. `node scripts/check-checklist.mjs` parses and validates all 20 sequential checklist items against live workspace state.

---

### [SEQ-19] PR Template & Verification Standard
- **Scope:** Both repos (`.github/PULL_REQUEST_TEMPLATE.md`)
- **Requirement:** Add mandatory PR template requiring:
  1. Green CI run link.
  2. Updated `CLAIMS.md` entry.
  3. Checklist proof link.
  4. Output of `npm ci --omit=dev && npm run build`.
- **Verification Command:**
  ```bash
  test -f Arbiter/.github/PULL_REQUEST_TEMPLATE.md && test -f arbiter-live-benchmark/.github/PULL_REQUEST_TEMPLATE.md
  ```
- **Expected Output:**
  Exit code 0.
- [x] **Status:** VERIFIED. Created `.github/PULL_REQUEST_TEMPLATE.md` in Arbiter and arbiter-live-benchmark.

---

### [SEQ-20] Full-Stack Reproducible End-to-End Self-Test
- **Scope:** Entire suite
- **Requirement:** Clean build and execution of both repositories end-to-end:
  ```bash
  # 1. Arbiter verification
  cd Arbiter
  npm run build
  npm test
  npm run benchmark
  npm run public-check

  # 2. Benchmark verification
  cd arbiter-live-benchmark
  npm run build
  npm test
  npm run public-check
  npm run compare
  ```
- **Expected Output:**
  All commands exit with code 0. 0 regressions.
- [x] **Status:** VERIFIED. Both `Arbiter` and `arbiter-live-benchmark` verify pipelines (`npm run verify`) complete end-to-end with exit code 0. Zero regressions across all 11 Arbiter test suites and all 8 benchmark test suites (22 scenarios).
