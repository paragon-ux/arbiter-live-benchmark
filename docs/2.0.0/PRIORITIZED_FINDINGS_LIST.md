# PRIORITIZED FINDINGS LIST: ARBITER & ARBITER-LIVE-BENCHMARK

**Document Purpose:** Prioritized inventory of missing dependencies, missing features, architectural vulnerabilities, and unsubstantiated claims identified during the secondary audit of Arbiter v1.0.0 and Arbiter Live Benchmark v1.2.0.  
**Classification System:**
- **P1 (Critical):** Core architectural integrity risks, data-loss vulnerabilities, and false claims disguising race conditions.
- **P2 (High):** Concurrency bottlenecks, feature incompleteness, and unvalidated failure modes.
- **P3 (Medium-to-Low):** Benchmarking rigor, metric derivation hygiene, and operational ergonomics.

---

## Priority 1 (P1) — Critical Architectural Defects & Discrepant Claims

### 1. [Missing Feature / Vulnerability] Non-Atomic Task Claim & Worktree Stomping Race Condition
* **Category:** Missing Feature / Concurrency Flaw
* **Affected Component:** [`../../Arbiter/src/dag/taskService.ts:L80-135`](https://github.com/paragon-ux/Arbiter/blob/v1.0.0/src/dag/taskService.ts#L80-L135) and [`../../Arbiter/src/db/database.ts:L100-123`](https://github.com/paragon-ux/Arbiter/blob/v1.0.0/src/db/database.ts#L100-L123)
* **Description:** Task claiming via `claimNextTask()` reads unblocked ready tasks (`getReadyTasks()`) and subsequently calls `updateTask(id, { status: "ASSIGNED" })` without an atomic SQLite transaction (`BEGIN IMMEDIATE`) or a Compare-And-Swap (CAS) condition (`WHERE status = 'READY'`).
* **Impact:** Two autonomous agent processes calling `claimNextTask()` concurrently will both claim the same task. The second worker calls [`createWorktree()`](https://github.com/paragon-ux/Arbiter/blob/v1.0.0/src/worktrees/worktreeManager.ts#L38-L48), which executes `git worktree remove --force` and `git branch -D`, **destroying the first worker's in-flight worktree and wiping its uncommitted work**.
* **Remediation:** Implement an atomic CAS query with `RETURNING *`:
  ```sql
  UPDATE tasks SET status = 'ASSIGNED', assigned_worker_id = ?
  WHERE id = (SELECT id FROM tasks WHERE status IN ('READY', 'PENDING') ... LIMIT 1)
  RETURNING *;
  ```

---

### 2. [Unsubstantiated Claim] Falsified Multi-Agent Swarm Concurrency (Scenarios 009 & 017)
* **Category:** Unsubstantiated Claim
* **Affected Component:** [`../FINAL_VERIFICATION_AUDIT_v1.2.0.md:L45`](https://github.com/paragon-ux/arbiter-live-benchmark/blob/v2.0.0/FINAL_VERIFICATION_AUDIT_v1.2.0.md#L45) vs [`../src/harness/adapters/deterministic.ts:L564-585`](https://github.com/paragon-ux/arbiter-live-benchmark/blob/v2.0.0/src/harness/adapters/deterministic.ts#L564-L585) & [`L917-952`](https://github.com/paragon-ux/arbiter-live-benchmark/blob/v2.0.0/src/harness/adapters/deterministic.ts#L917-L952)
* **Description:** The primary audit claims that *“10-worker and 50-worker swarms perform concurrent SQLite WAL transactions with 0 locked errors and 0 data loss (PROVEN 100%).”* In reality, the benchmark executes workers inside a single-threaded, synchronous `for (let i = 1; i <= n; i++)` loop. Furthermore, Scenario 017 caps execution at `Math.min(requestedWorkers, 10)` in standard runs, yet manually overwrites `metrics.worktreesProvisioned = 50`.
* **Impact:** High-concurrency WAL serialization, multi-process SQLite write contention (`SQLITE_BUSY`), and concurrent Git branch locking have **never been tested or proven under true parallel workloads**.
* **Remediation:** Refactor the test harness to launch real concurrent OS child processes via `Promise.all(workers.map(...))` competing for the database and repository.

---

### 3. [Unsubstantiated Claim] Falsified Atomic CAS & EAGAIN Backoff (Scenario 011 / H10)
* **Category:** Unsubstantiated Claim
* **Affected Component:** [`../FINAL_VERIFICATION_AUDIT_v1.2.0.md:L47`](https://github.com/paragon-ux/arbiter-live-benchmark/blob/v2.0.0/FINAL_VERIFICATION_AUDIT_v1.2.0.md#L47) vs [`../src/harness/adapters/deterministic.ts:L664-675`](https://github.com/paragon-ux/arbiter-live-benchmark/blob/v2.0.0/src/harness/adapters/deterministic.ts#L664-L675)
* **Description:** The audit claims: *“Atomic Task Lease Acquisition & EAGAIN: High-contention race condition guarantees exactly one winner... losers receive EAGAIN backoff (PROVEN 100%).”* The benchmark executes sequentially: Worker A writes to the DB, Worker B reads the task, checks `status === 'READY'`, and the string `'EAGAIN'` is hardcoded into `collector.setDetail()`.
* **Impact:** Neither SQLite nor Arbiter returns `EAGAIN`. Claiming mathematical and empirical proof of CAS atomicity hides the critical race condition identified in Finding #1.
* **Remediation:** Remove the claim or implement an actual CAS lease acquisition mechanism that returns a standardized error code when another process wins the lease.

---

### 4. [Missing Feature / Schema Defect] Lack of Active Lease Mutual Exclusion in SQLite
* **Category:** Missing Feature / Schema Invariant
* **Affected Component:** [`../../Arbiter/src/db/migrations.ts:L34-43`](https://github.com/paragon-ux/Arbiter/blob/v1.0.0/src/db/migrations.ts#L34-L43)
* **Description:** The `worker_leases` table defines `PRIMARY KEY (worker_id, task_id)`.
* **Impact:** Because the primary key is composite with `worker_id`, SQLite allows **multiple concurrent workers to hold `status = 'ACTIVE'` leases for the exact same `task_id`**. When queried via `getWorkerLease(taskId)`, SQLite returns whichever row it encounters first.
* **Remediation:** Add a partial unique index ensuring only one active lease can exist per task:
  ```sql
  CREATE UNIQUE INDEX idx_unique_active_task_lease ON worker_leases(task_id) WHERE status = 'ACTIVE';
  ```

---

## Priority 2 (P2) — High Priority Architectural Debt & Incomplete Implementations

### 5. [Missing Feature] Tier 2 Live Agy Runner is a Pass-Through Facade
* **Category:** Missing Feature / Unsubstantiated Claim
* **Affected Component:** [`../src/harness/adapters/agyRunner.ts:L20-37`](https://github.com/paragon-ux/arbiter-live-benchmark/blob/v2.0.0/src/harness/adapters/agyRunner.ts#L20-L37)
* **Description:** `AGENTS.md` and the architecture spec state that Tier 2 invokes the local Antigravity CLI (`agy`) for live empirical code generation. In code, `AgyRunnerAdapter` executes `agy --version`, ignores the scenario instructions, and invokes `this.fallbackAdapter.execute(scenario)` (the deterministic mock).
* **Impact:** No live LLM agents, coding models, or autonomous prompts are ever benchmarked via `agy`.
* **Remediation:** Implement real `agy` task dispatch via CLI invocation (e.g., `agy exec --prompt ...`) inside the provisioned worktree, or document Tier 2 as a planned roadmap feature.

---

### 6. [Missing Feature] Head-of-Line Blocking in Sequential Merge Queue
* **Category:** Missing Feature / Bottleneck
* **Affected Component:** [`../../Arbiter/src/merge/mergeQueue.ts:L80-93`](https://github.com/paragon-ux/Arbiter/blob/v1.0.0/src/merge/mergeQueue.ts#L80-L93)
* **Description:** In `mergeAllCompleted()`, when an individual task encounters a merge conflict, the loop executes `break`:
  ```ts
  if (res.conflict) {
    break; // Stops entire queue
  }
  ```
* **Impact:** If Task #1 modifies a file that conflicts with `main`, Tasks #2 through #10 (which may touch completely independent, orthogonal modules) are **indefinitely blocked from merging** until an operator manually intervenes.
* **Remediation:** Change `break` to `continue` so non-conflicting, independent branches continue merging sequentially into `main`.

---

### 7. [Missing Feature] Subprocess MCP (Tier 1.5) Multi-Worker Scaling
* **Category:** Missing Feature / Benchmark Discrepancy
* **Affected Component:** [`../src/harness/adapters/subprocessMcp.ts:L37-78`](https://github.com/paragon-ux/arbiter-live-benchmark/blob/v2.0.0/src/harness/adapters/subprocessMcp.ts#L37-L78) & [`../test/subprocess-mcp.test.ts:L22-35`](https://github.com/paragon-ux/arbiter-live-benchmark/blob/v2.0.0/test/subprocess-mcp.test.ts#L22-L35)
* **Description:** In `SubprocessMcpAdapter`, when a scenario specifies `workersCount: 10`, it launches exactly **one child process**, claims **one task**, and overrides `metrics.worktreesProvisioned = count` (10).
* **Impact:** Multi-client JSON-RPC concurrency across multiple stdio subprocesses is not exercised.
* **Remediation:** Update `SubprocessMcpAdapter` to spawn `N` separate child processes communicating with the MCP server concurrently.

---

### 8. [Unsubstantiated Claim] Simulated Fault Injections (SIGTERM & ENOSPC)
* **Category:** Unsubstantiated Claim
* **Affected Component:** [`../FINAL_VERIFICATION_AUDIT_v1.2.0.md:L48-49`](https://github.com/paragon-ux/arbiter-live-benchmark/blob/v2.0.0/FINAL_VERIFICATION_AUDIT_v1.2.0.md#L48-L49) vs [`../src/harness/adapters/deterministic.ts:L701-725`](https://github.com/paragon-ux/arbiter-live-benchmark/blob/v2.0.0/src/harness/adapters/deterministic.ts#L701-L725) & [`L783-814`](https://github.com/paragon-ux/arbiter-live-benchmark/blob/v2.0.0/src/harness/adapters/deterministic.ts#L783-L814)
* **Description:** The audit claims Jepsen-style fault injection of mid-merge `SIGTERM` signals and `ENOSPC` disk exhaustion.
  - In Scenario 012 (`runSignalInterruptedMerge`), `git merge --abort` is called when no merge is active, yielding `fatal: There is no merge to abort (MERGE_HEAD missing)`. No signal is sent.
  - In Scenario 014 (`runDiskFullRecovery`), standard SQL `ROLLBACK` is executed on an in-memory database (`:memory:`). No disk-full or filesystem write failure is triggered.
* **Impact:** The crash-resilience claims overstate the testing rigor.
* **Remediation:** Author genuine chaos tests: issue an actual OS `kill -TERM` to an in-flight `git merge` child process, and mock or restrict temporary partition quotas for `ENOSPC`.

---

### 9. [Missing Feature / Defect] Silent Task Completion on Failed Worktree Commit
* **Category:** Missing Feature / Error Handling
* **Affected Component:** [`../../Arbiter/src/dag/taskService.ts:L168-185`](https://github.com/paragon-ux/Arbiter/blob/v1.0.0/src/dag/taskService.ts#L168-L185)
* **Description:** In `completeTask()`, if `this.worktrees.commitAll()` throws an error, the error is caught, logged as a warning event, and execution proceeds:
  ```ts
  try {
    this.worktrees.commitAll(...);
  } catch (commitErr) {
    this.db.logEvent(taskId, "task.commit_warning", ...);
  }
  // Proceeds to mark COMPLETED and release lease
  const updated = this.db.updateTask(taskId, { status: "COMPLETED" });
  ```
* **Impact:** If git staging or committing fails (e.g., due to file permission errors or git lock files), the task is marked `COMPLETED` and downstream DAG tasks are unblocked, even though **no commit was generated on the branch**.
* **Remediation:** Either roll back the trajectory and fail the task, or re-throw the error so the task remains `IN_PROGRESS`.

---

## Priority 3 (P3) — Medium-to-Low Priority Polish, Hygiene & Benchmarking Rigor

### 10. [Missing Dependencies] Real LLM Tokenizer Calibration Packages
* **Category:** Missing Dependencies / Tautological Testing
* **Affected Component:** [`../package.json`](https://github.com/paragon-ux/arbiter-live-benchmark/blob/v2.0.0/package.json) and [`../scripts/calibrate-tokens.mjs`](https://github.com/paragon-ux/arbiter-live-benchmark/blob/v2.0.0/scripts/calibrate-tokens.mjs)
* **Description:** `scripts/calibrate-tokens.mjs` claims to validate against TikToken, Claude, and Gemini tokenizers, but lacks the dependencies to do so. It compares its internal regex heuristic with `3.8 chars/token` against the same regex heuristic with `3.72` and `3.84`.
* **Impact:** The `±0.09%` error rate is self-referential.
* **Remediation:** Add devDependencies (e.g., `@dqbd/tiktoken` or `@anthropic-ai/tokenizer`) and execute real BPE tokenization in `calibrate-tokens.mjs`, or update documentation to describe the script as an *Internal Heuristic Sensitivity Test*.

---

### 11. [Unsubstantiated Claim] Adversarial Negative Baselines Rely on Hardcoded Metrics
* **Category:** Unsubstantiated Claim
* **Affected Component:** [`../src/harness/adapters/deterministic.ts:L872-880`](https://github.com/paragon-ux/arbiter-live-benchmark/blob/v2.0.0/src/harness/adapters/deterministic.ts#L872-L880) and [`../src/harness/adapters/naiveMutex.ts:L60-65`](https://github.com/paragon-ux/arbiter-live-benchmark/blob/v2.0.0/src/harness/adapters/naiveMutex.ts#L60-L65)
* **Description:** In Scenario 016 (Naive Mutex Contention), `accuracyPercent = 45`, `contentionCount = 8`, and `mutexWaitMs = 12.5` are hardcoded in both adapters whenever `scenario.id.includes('mutex')`. In Scenario 015 (Docker), startup latency defaults to a hardcoded `350.0ms` constant whenever Docker CLI is not installed.
* **Impact:** The numbers in Table 1 and Table 2 of the audit are scripted rather than emergent results.
* **Remediation:** Derive accuracy and contention directly from the number of failed lock acquisitions and unhandled file collisions.

---

### 12. [Missing Feature] Operator Working Tree Pollution Protection
* **Category:** Missing Feature / Operational Hygiene
* **Affected Component:** [`../../Arbiter/src/merge/mergeQueue.ts:L33`](https://github.com/paragon-ux/Arbiter/blob/v1.0.0/src/merge/mergeQueue.ts#L33)
* **Description:** `MergeQueue.mergeTask()` executes `git checkout targetBranch` directly inside `repoRoot`.
* **Impact:** If a developer or operator has dirty, uncommitted changes in the root workspace, `git checkout targetBranch` will fail or clobber unstaged files.
* **Remediation:** Verify working tree cleanliness (`git status --porcelain`) prior to checkout, or perform merges inside a dedicated, bare merge worker worktree.

---

### 13. [Missing Feature] Waymark CLI Binary Path Fallback Reliance
* **Category:** Missing Feature / Integration Gap
* **Affected Component:** [`../../Arbiter/src/waymark/waymarkSupervisor.ts:L52-83`](https://github.com/paragon-ux/Arbiter/blob/v1.0.0/src/waymark/waymarkSupervisor.ts#L52-L83)
* **Description:** `WaymarkSupervisor` searches for hardcoded relative paths (`../../Deepseek-Project/Waymark/dist/src/cli.js`). In all benchmark scenarios, `customCliPath` is set to `/non/existent/path` to force fallback mode.
* **Impact:** Fallback mode bypasses real Waymark CLI calls; `recoverLock()` and `checkIntegrity()` become dummy stubs that unconditionally return `{ ok: true, recovered: true }`.
* **Remediation:** Support standard npm/npx package resolution or path configuration via environment variables for Waymark CLI integration testing.
