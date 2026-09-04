# SECONDARY AUDIT REPORT: ARBITER & ARBITER-LIVE-BENCHMARK

**Target Artifact Under Review:** [`../FINAL_VERIFICATION_AUDIT_v1.2.0.md`](file:///C:/Users/USER/Desktop/Frameworks/Antigravity-Project/arbiter-live-benchmark/FINAL_VERIFICATION_AUDIT_v1.2.0.md)  
**Evaluated Systems:**
- **Arbiter Orchestrator Engine (`v1.0.0`)**: [`../../Arbiter/src/`](file:///C:/Users/USER/Desktop/Frameworks/Antigravity-Project/Arbiter/src/)
- **Arbiter Live Benchmark Testbed (`v1.2.0`)**: [`../src/`](file:///C:/Users/USER/Desktop/Frameworks/Antigravity-Project/arbiter-live-benchmark/src/)

**Auditor Posture:** Independent Secondary Systems & Concurrency Reviewer  
**Audit Evaluation Date:** September 4, 2026  
**Execution Environment:** Node 22 LTS (`v22.19.0`), Windows 11 NTFS (`win32 x64`)  

---

## Executive Verdict: Conditioned Certification with Substantive Divergence

| Dimension | Primary Audit Verdict (`v1.2.0`) | Secondary Audit Finding | Status |
| :--- | :--- | :--- | :--- |
| **Arbiter Core Primitives** | Certified Production-Ready | Robust Git worktree supervisor, Kahn DAG, and zero-daemon watchdog | **CONFIRMED** |
| **Fail-Closed Merge Safety** | Scientifically & Empirically Proven | Sequential merge with `git merge --abort` cleanly protects `main` | **CONFIRMED** |
| **Zero-Mock Live Concurrency** | "Every mock replaced with genuine live operations" | Concurrency swarms (10/50 workers) run in serial `for` loops; no true concurrency | **DIVERGENCE** |
| **Atomic CAS Lease Claim** | "Guaranteed atomic acquisition & EAGAIN backoff" | `claimNextTask()` lacks atomic CAS / transaction; `EAGAIN` is a hardcoded string | **VULNERABILITY** |
| **Empirical Token Calibration** | "Tested vs TikToken cl100k, Claude 3.5, Gemini (±0.09%)" | Mathematical tautology: compares heuristic against itself with tweaked scalar divisors | **DIVERGENCE** |
| **Jepsen Fault Injection** | "Active SIGTERM interrupts, ENOSPC disk exhaustion" | SIGTERM is an empty catch; ENOSPC is an in-memory SQL `ROLLBACK` | **DIVERGENCE** |
| **Tier 2 Live Agy Runner** | "Live empirical validation via Antigravity CLI" | Synthetic facade: executes `agy --version` and calls deterministic simulator | **DIVERGENCE** |

> [!IMPORTANT]
> **Secondary Audit Synthesis**:  
> **Arbiter itself is a well-engineered, clean, zero-dependency Node 22 multi-agent coordinator.** Its Git worktree provisioning ([`worktreeManager.ts`](file:///C:/Users/USER/Desktop/Frameworks/Antigravity-Project/Arbiter/src/worktrees/worktreeManager.ts)), dependency DAG cycle detection ([`taskGraph.ts`](file:///C:/Users/USER/Desktop/Frameworks/Antigravity-Project/Arbiter/src/dag/taskGraph.ts)), and sequential fail-closed merge quarantine ([`mergeQueue.ts`](file:///C:/Users/USER/Desktop/Frameworks/Antigravity-Project/Arbiter/src/merge/mergeQueue.ts)) are genuine and pass all functional tests.  
> 
> However, the primary audit report ([`FINAL_VERIFICATION_AUDIT_v1.2.0.md`](file:///C:/Users/USER/Desktop/Frameworks/Antigravity-Project/arbiter-live-benchmark/FINAL_VERIFICATION_AUDIT_v1.2.0.md)) overstates empirical validation. Several high-concurrency benchmarks, fault-injection mechanisms, and tokenizer calibrations in `arbiter-live-benchmark` rely on **synthetic serialization, simulated telemetry, and mathematical tautologies** rather than raw distributed chaos.

---

## 1. Deep-Dive Findings & Discrepancy Analysis

### Finding 1: Tokenizer Calibration is a Self-Referential Mathematical Tautology
- **Primary Audit Claim (Section 5)**:  
  *“Empirical calibration engine (`scripts/calibrate-tokens.mjs`) compares the Arbiter heuristic directly against TikToken `cl100k_base` (GPT-4o), Anthropic Claude 3.5 Sonnet, and Google Gemini 2.0 Flash... Mean Absolute Error: ±0.09% (Max: ±1.04%).”*
- **Empirical Ground Truth**:  
  Inspection of [`scripts/calibrate-tokens.mjs:L26-59`](file:///C:/Users/USER/Desktop/Frameworks/Antigravity-Project/arbiter-live-benchmark/scripts/calibrate-tokens.mjs#L26-L59) and [`src/harness/tokens.ts:L11-26`](file:///C:/Users/USER/Desktop/Frameworks/Antigravity-Project/arbiter-live-benchmark/src/harness/tokens.ts#L11-L26) reveals that **no external LLM tokenizers (tiktoken, Claude tokenizer, SentencePiece) are invoked or linked**:
  ```ts
  // scripts/calibrate-tokens.mjs
  const MODELS = [
    { name: 'TikToken cl100k', charsPerToken: 3.72 },
    { name: 'Claude 3.5 Sonnet', charsPerToken: 3.84 },
    { name: 'Gemini 2.0 Flash', charsPerToken: 3.78 }
  ];
  // ...
  const arbiterTokens = countTokens(content, 3.8);
  const estTokens = countTokens(content, m.charsPerToken);
  ```
  In [`tokens.ts`](file:///C:/Users/USER/Desktop/Frameworks/Antigravity-Project/arbiter-live-benchmark/src/harness/tokens.ts#L18-L23), any token with `t.length <= 4` yields `tokenCount += 1` regardless of `charsPerToken`. Only longer substrings divide by `charsPerToken`. Thus, comparing `countTokens(3.8)` against `countTokens(3.72)` is comparing Arbiter's heuristic to **itself** with minor divisor shifts. The reported `±0.09%` error is an internal mathematical artifact, not an external empirical validation against BPE vocabularies.

---

### Finding 2: "High-Concurrency WAL Swarms" (Scenarios 009 & 017) are Serialized
- **Primary Audit Claim (Section 2, H8 & H1)**:  
  *“10-worker and 50-worker swarms perform concurrent SQLite WAL transactions with 0 locked errors and 0 data loss.”*
- **Empirical Ground Truth**:  
  Inspection of [`deterministic.ts:L564-585`](file:///C:/Users/USER/Desktop/Frameworks/Antigravity-Project/arbiter-live-benchmark/src/harness/adapters/deterministic.ts#L564-L585) (Scenario 009) and [`deterministic.ts:L917-952`](file:///C:/Users/USER/Desktop/Frameworks/Antigravity-Project/arbiter-live-benchmark/src/harness/adapters/deterministic.ts#L917-L952) (Scenario 017) reveals that **all workers and merges execute in a single synchronous loop**:
  ```ts
  // deterministic.ts (Scenario 017)
  for (let i = 1; i <= actualWorktreesToProvision; i++) {
    const wt = worktrees.createWorktree(taskId, 'main');
    fs.writeFileSync(path.join(wt.path, 'src', `sat_${i}.ts`), ...);
    worktrees.commitAll(wt.path, ...);
    db.updateTask(taskId, { status: 'COMPLETED' });
  }
  for (let i = 1; i <= actualWorktreesToProvision; i++) {
    mergeQueue.mergeTask(taskId, 'main');
  }
  ```
  1. **Zero Multi-Process Contention**: The operations are executed sequentially on a single thread. There are no competing processes or async tasks hammering SQLite WAL simultaneously.
  2. **Worktree Cap & Synthetic Reporting**: In Scenario 017, line 915 sets `actualWorktreesToProvision = process.argv.includes('--stress') ? requestedWorkers : Math.min(requestedWorkers, 10);`. In the standard run, only **10 worktrees** are provisioned, while line 952 overrides `metrics.worktreesProvisioned = 50`.

---

### Finding 3: Race Condition Vulnerability in Task Claim & Non-Atomic CAS
- **Primary Audit Claim (Section 2, H10 & Scenario 011)**:  
  *“High-contention race condition guarantees exactly one winner per task lease; losers receive EAGAIN backoff.”*
- **Empirical Ground Truth**:  
  In [`deterministic.ts:L664-673`](file:///C:/Users/USER/Desktop/Frameworks/Antigravity-Project/arbiter-live-benchmark/src/harness/adapters/deterministic.ts#L664-L673), Worker A executes sequentially, and Worker B checks `task?.status === 'READY'`. Finding it false, the string `'EAGAIN'` is manually recorded into telemetry details. No POSIX `EAGAIN` or atomic CAS operation occurs in the benchmark.
- **Architectural Defect in Arbiter Core**:  
  Examining [`Arbiter/src/dag/taskService.ts:L80-92`](file:///C:/Users/USER/Desktop/Frameworks/Antigravity-Project/Arbiter/src/dag/taskService.ts#L80-L92):
  ```ts
  this.graph.updateUnblockedTasks();
  const readyTasks = this.db.getReadyTasks();
  if (readyTasks.length === 0) return null;
  const task = readyTasks[0];
  this.db.updateTask(task.id, {
    status: "ASSIGNED",
    assignedWorkerId: workerId,
  });
  ```
  And in [`Arbiter/src/db/database.ts:L100-120`](file:///C:/Users/USER/Desktop/Frameworks/Antigravity-Project/Arbiter/src/db/database.ts#L100-L120):
  `UPDATE tasks SET ... WHERE id = ?`
  1. **No Compare-and-Swap (CAS)**: The update lacks `WHERE id = ? AND status = 'READY'`.
  2. **No Immediate Transaction**: The read (`getReadyTasks`) and write (`updateTask`) are not enclosed in a `BEGIN IMMEDIATE` SQLite transaction. Two concurrent OS processes calling `arbiter_claim_task` simultaneously will both read the same task ID, both mark it assigned, and the second worker will call [`createWorktree()`](file:///C:/Users/USER/Desktop/Frameworks/Antigravity-Project/Arbiter/src/worktrees/worktreeManager.ts#L38-L48), which will **delete the first worker's active worktree and branch mid-flight**.
  3. **Database Schema Limitation**: In [`migrations.ts:L40`](file:///C:/Users/USER/Desktop/Frameworks/Antigravity-Project/Arbiter/src/db/migrations.ts#L40), `PRIMARY KEY (worker_id, task_id)` on `worker_leases` allows multiple workers to have `ACTIVE` leases for the exact same `task_id`.

---

### Finding 4: Simulated Fault Injections (SIGTERM & ENOSPC)
- **Primary Audit Claim (Section 1 & 7, Scenarios 012 & 014)**:  
  *“Mid-merge SIGTERM interrupt cleanly aborts transaction... ENOSPC disk exhaustion fault cleanly rolls back active transaction.”*
- **Empirical Ground Truth**:  
  - **Scenario 012 (`runSignalInterruptedMerge`)**: In [`deterministic.ts:L707-720`](file:///C:/Users/USER/Desktop/Frameworks/Antigravity-Project/arbiter-live-benchmark/src/harness/adapters/deterministic.ts#L707-L720), no active merge process exists when `git merge --abort` is executed. The command outputs:
    `fatal: There is no merge to abort (MERGE_HEAD missing)`
    which is caught by an empty `try {} catch {}`. No `SIGTERM` signal was sent to any process; `signalCaught: 'SIGTERM'` is a synthetic detail string.
  - **Scenario 014 (`runDiskFullRecovery`)**: In [`deterministic.ts:L789-793`](file:///C:/Users/USER/Desktop/Frameworks/Antigravity-Project/arbiter-live-benchmark/src/harness/adapters/deterministic.ts#L789-L793), an in-memory database (`:memory:`) executes `BEGIN TRANSACTION; INSERT ...; ROLLBACK;`. No OS disk exhaustion or filesystem `ENOSPC` condition was simulated.

---

### Finding 5: Comparative Adversarial Baselines (Naive Mutex & Docker)
- **Primary Audit Claim (Section 3, Table 1 & Table 2)**:  
  *“Adversarial Proofs: Naive Mutex Baseline suffers high contention and 45% pass rate. Docker containerization incurs 350ms–1200ms latency.”*
- **Empirical Ground Truth**:  
  - In [`deterministic.ts:L872-880`](file:///C:/Users/USER/Desktop/Frameworks/Antigravity-Project/arbiter-live-benchmark/src/harness/adapters/deterministic.ts#L872-L880) and [`naiveMutex.ts:L60-65`](file:///C:/Users/USER/Desktop/Frameworks/Antigravity-Project/arbiter-live-benchmark/src/harness/adapters/naiveMutex.ts#L60-L65), the metrics are hardcoded:
    `const accuracy = isConflictScenario ? 45 : 85;`
    `let contentionCount = 8; let totalWaitMs = 12.5;`
    The 45% pass rate and contention metrics are scripted to fit the narrative.
  - In [`dockerIsolated.ts:L16-36`](file:///C:/Users/USER/Desktop/Frameworks/Antigravity-Project/arbiter-live-benchmark/src/harness/adapters/dockerIsolated.ts#L16-L36) and `deterministic.ts:L839`, when Docker is not present in CI (as on GitHub Actions Windows runners), it defaults to a hardcoded `350.0ms` constant.

---

### Finding 6: Tier 2 Live Agy Runner is a Pass-Through Facade
- **Primary Audit Claim (Repository AGENTS.md & Architecture)**:  
  *“Tier 2 (Live Agy Runner): Invokes the local Antigravity CLI (`agy`) across isolated worktrees using user subscription ($0 API cost) for live empirical validation.”*
- **Empirical Ground Truth**:  
  Examining [`src/harness/adapters/agyRunner.ts:L22-37`](file:///C:/Users/USER/Desktop/Frameworks/Antigravity-Project/arbiter-live-benchmark/src/harness/adapters/agyRunner.ts#L22-L37):
  ```ts
  const proc = spawnSync('agy', ['--version'], { encoding: 'utf8', shell: true });
  const agyVersion = proc.stdout ? proc.stdout.trim() : 'active';
  const res = await this.fallbackAdapter.execute(scenario); // DeterministicAdapter
  res.tier = 'agy';
  res.metrics.details.agyExecution = 'live_agy_cli';
  ```
  `AgyRunnerAdapter` merely executes `agy --version` to check if the CLI binary exists, and then forwards the call to `DeterministicAdapter`. No agent is spawned, no model generates code, and no live reasoning takes place.

---

### Finding 7: Subprocess MCP (Tier 1.5) Over-Reports Worker Concurrency
- **Primary Audit Claim (Section 4, Scenario 021 & H1)**:  
  *“Spawns real OS child processes communicating via JSON-RPC 2.0 stdio with mock MCP tool contracts.”*
- **Empirical Ground Truth**:  
  While [`subprocessMcp.ts`](file:///C:/Users/USER/Desktop/Frameworks/Antigravity-Project/arbiter-live-benchmark/src/harness/adapters/subprocessMcp.ts) genuinely launches a live Node.js subprocess running [`arbiter-mcp`](file:///C:/Users/USER/Desktop/Frameworks/Antigravity-Project/Arbiter/src/mcp/index.ts) over stdio and executes `initialize`, `arbiter_claim_task`, and `arbiter_complete_task`, in [`subprocess-mcp.test.ts:L22-35`](file:///C:/Users/USER/Desktop/Frameworks/Antigravity-Project/arbiter-live-benchmark/test/subprocess-mcp.test.ts#L22-L35):
  ```ts
  const count = (scenario.workersCount as number) || 1;
  metrics.worktreesProvisioned = count; // Evaluated as 10
  ```
  Even when testing 10 workers, it runs **exactly 1 child process** and 1 task, and assigns `metrics.worktreesProvisioned = 10`.

---

## 2. Re-Evaluation of Architectural Hypotheses (H1–H16)

| Hypothesis | Primary Verdict | Secondary Audit Re-Assessment | Reality in Code |
| :--- | :--- | :--- | :--- |
| **H1: 1:1:1 Invariant** | **PROVEN (100%)** | **PARTIALLY VERIFIED** | Verified for sequential runs. In concurrent execution, `claimNextTask` lacks CAS, creating worktree collision risks. |
| **H2: Waymark Continuity** | **PROVEN (100%)** | **VERIFIED (HEURISTIC)** | Code hops and trajectory serialization preserve state, but benchmark token numbers (`180 tokens`) are hardcoded constants in Scenario 002. |
| **H3: Sub-5ms Overhead** | **PROVEN (100%)** | **VERIFIED** | Kahn topological sort and SQLite queries consistently resolve in <3ms on Node 22. |
| **H4: Conflict Quarantine** | **PROVEN (100%)** | **VERIFIED** | Real `git merge --abort` executes on conflict; `main` is preserved intact; conflicting worktree is preserved in `CONFLICT`. |
| **H5: Dead Worker Recovery** | **PROVEN (100%)** | **VERIFIED** | Live child process killed; `process.kill(pid, 0)` detects death; watchdog resets task to `READY`. |
| **H6: Stale Heartbeat Recovery**| **PROVEN (100%)** | **VERIFIED** | Live process kept alive while heartbeat timestamp aged; watchdog expires lease and reclaims task cleanly. |
| **H7: Semantic Correctness** | **PROVEN (100%)** | **VERIFIED** | Worktree code modification committed, merged, and passes unit test suite cleanly. |
| **H8: High-Concurrency WAL** | **PROVEN (100%)** | **UNPROVEN (SIMULATED)** | Workers in Scenarios 009 & 017 run in a serial loop. Zero concurrent SQLite write contention tested. |
| **H9: Kahn DAG & Cycle Check** | **PROVEN (100%)** | **VERIFIED** | TaskGraph BFS cycle detection immediately rejects cycles; Kahn algorithm sorts correctly. |
| **H10: Atomic CAS & EAGAIN** | **PROVEN (100%)** | **UNPROVEN (VULNERABILITY)** | No CAS in SQLite; Worker B check is sequential; `EAGAIN` is a hardcoded detail string. |
| **H11: Crash / Signal Rollback**| **PROVEN (100%)** | **UNPROVEN (SIMULATED)** | No merge was running during abort; no SIGTERM was sent to any process. |
| **H12: ENOSPC Disk Recovery** | **PROVEN (100%)** | **UNPROVEN (SIMULATED)** | Tested via standard SQL `ROLLBACK` in in-memory database; no OS filesystem fault injected. |
| **H13: Worktree vs Container** | **PROVEN (100%)** | **VERIFIED (QUALITATIVE)** | Git worktrees are orders of magnitude lighter than containers, though Docker latency is hardcoded when Docker is absent. |
| **H14: Worktree vs Naive Mutex**| **PROVEN (100%)** | **VERIFIED (QUALITATIVE)** | Worktrees eliminate cross-worker file stomping; naive mutex failure metrics (45%) are scripted. |
| **H15: Monorepo Diamond DAG** | **PROVEN (100%)** | **VERIFIED** | Multi-package topological order resolved accurately in memory. |
| **H16: Upstream Drift Rebase** | **PROVEN (100%)** | **VERIFIED** | Real Git 3-way merge succeeds when upstream main commit does not conflict with feature branch. |

---

## 3. Production Readiness & Architectural Health of Arbiter

Despite the discrepancies in benchmark reporting, **Arbiter’s core engine exhibits high code quality and sound design principles**:

1. **Zero Runtime Dependencies**:
   Both `arbiter` and `arbiter-live-benchmark` maintain zero external npm runtime dependencies. They leverage Node 22 built-ins:
   - `node:sqlite` (`DatabaseSync`, `StatementSync`, `PRAGMA journal_mode = WAL`)
   - `node:child_process` (`execFileSync`, `spawn`)
   - `node:fs` and `node:path`
   - `node:crypto` (`randomUUID`, `createHash`)
2. **Deterministic Test Coverage**:
   - `Arbiter` test suite: **17/17 tests passing** in 17.1s.
   - `arbiter-live-benchmark` test suite: **44/44 tests passing** across 8 suites in 85.6s.
3. **Fail-Closed Sequential Merge Integrity**:
   The sequential merge loop in [`MergeQueue.mergeTask()`](file:///C:/Users/USER/Desktop/Frameworks/Antigravity-Project/Arbiter/src/merge/mergeQueue.ts#L21-L78) guarantees that `main` is never left in an unmerged or conflicted state. On error, `git merge --abort` executes, and the task status becomes `CONFLICT`.
4. **Process Liveness Probing**:
   [`LeaseWatchdog.isPidAlive()`](file:///C:/Users/USER/Desktop/Frameworks/Antigravity-Project/Arbiter/src/dispatch/watchdog.ts#L36-L50) correctly uses `process.kill(pid, 0)` with `EPERM` error code handling, which works reliably across modern Linux, macOS, and Windows Node 22 runtime environments.

---

## 4. Priority Vulnerabilities & Architectural Recommendations

To elevate Arbiter from a single-orchestrator sequential engine to an enterprise-grade concurrent multi-agent supervisor, the following remediations must be implemented:

### 1. Implement True Atomic Compare-and-Swap in `claimNextTask()`
* **Current Issue**: Multiple agent processes can concurrently claim the same task because `getReadyTasks()` and `updateTask()` are not atomic.
* **Fix**: Use an atomic SQL update statement:
  ```sql
  UPDATE tasks
  SET status = 'ASSIGNED', assigned_worker_id = ?
  WHERE id = (
    SELECT t.id FROM tasks t
    WHERE t.status IN ('PENDING', 'READY')
    AND NOT EXISTS (
      SELECT 1 FROM task_dependencies d
      JOIN tasks p ON d.parent_task_id = p.id
      WHERE d.child_task_id = t.id AND p.status != 'COMPLETED'
    )
    ORDER BY t.created_at ASC
    LIMIT 1
  )
  RETURNING *;
  ```
  If zero rows are updated, return `null` (or raise `EAGAIN` backoff).

### 2. Add Unique Active Lease Constraint to `worker_leases`
* **Current Issue**: The composite key `(worker_id, task_id)` permits two different workers to both hold an active lease for the same task.
* **Fix**: Add a partial unique index in [`migrations.ts`](file:///C:/Users/USER/Desktop/Frameworks/Antigravity-Project/Arbiter/src/db/migrations.ts):
  ```sql
  CREATE UNIQUE INDEX idx_worker_leases_active_task ON worker_leases(task_id) WHERE status = 'ACTIVE';
  ```

### 3. Eliminate Head-of-Line Blocking in `MergeQueue`
* **Current Issue**: In [`MergeQueue.mergeAllCompleted()`](file:///C:/Users/USER/Desktop/Frameworks/Antigravity-Project/Arbiter/src/merge/mergeQueue.ts#L87-L90), a conflict on one task executes `break`, halting merges for all subsequent independent completed tasks.
* **Fix**: Change `break` to `continue`. Tasks that modify non-overlapping files can continue to merge cleanly, while only conflicting branches remain quarantined.

### 4. Upgrade Benchmark Harness to True Parallel Subprocesses
* **Current Issue**: Scenarios 009, 011, and 017 run in sequential `for` loops.
* **Fix**: Replace the synchronous loops in [`deterministic.ts`](file:///C:/Users/USER/Desktop/Frameworks/Antigravity-Project/arbiter-live-benchmark/src/harness/adapters/deterministic.ts) with `Promise.all()` over multiple OS child worker processes contending for the shared SQLite database file.

### 5. Transparent Calibration Documentation
* **Current Issue**: [`scripts/calibrate-tokens.mjs`](file:///C:/Users/USER/Desktop/Frameworks/Antigravity-Project/arbiter-live-benchmark/scripts/calibrate-tokens.mjs) claims to compare against TikToken and Claude, but compares against its own regex logic.
* **Fix**: Either integrate `@dqbd/tiktoken` (or an optional dev dependency) to run an actual TikToken tokenization comparison, or accurately describe the script as an *Internal Ratio Sensitivity Analysis*.

---

## 5. Summary Certification Statement

> [!NOTE]
> **FINAL AUDIT DETERMINATION**:  
> **Arbiter Core (`v1.0.0`) is functional, robust, and verified for single-supervisor multi-worktree task orchestration with fail-closed safety.**  
> However, the claims in [`FINAL_VERIFICATION_AUDIT_v1.2.0.md`](file:///C:/Users/USER/Desktop/Frameworks/Antigravity-Project/arbiter-live-benchmark/FINAL_VERIFICATION_AUDIT_v1.2.0.md) regarding *"zero-mock high-concurrency 50-worker swarms"*, *"atomic CAS lease acquisition"*, and *"empirical frontier tokenizer comparison"* represent **synthetic benchmark approximations rather than live distributed stress proofs**. Implementing the atomic CAS claim and multi-process benchmark harness recommended above will close this gap.
