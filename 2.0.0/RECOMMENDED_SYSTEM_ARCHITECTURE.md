# Arbiter v2: Enterprise-Grade Multi-Agent Orchestration Architecture
## Comprehensive Architectural Blueprint & Hardening Specification

**Status:** Proposed Architecture  
**Target Systems:** Arbiter Core, Waymark Continuity Companion, Arbiter Benchmark Testbed  
**Runtime Targets:** Hybrid Node 22 LTS / Native Rust Core (`libgit2` + OS Job Objects)  
**Date:** September 2026  

---

## 1. Executive Architectural Vision

Arbiter coordinates autonomous parallel coding agents across isolated Git worktrees with token-efficient in-flight continuity (Waymark) and episodic memory (Capn). 

The secondary audit demonstrated that while Arbiter’s conceptual foundation (ephemeral worktrees, Kahn DAG, fail-closed quarantine) is sound, its v1 implementation suffers from:
1. **Relational race conditions** in task claiming and lease acquisition (P1).
2. **Process spawning latency and handle locking** on NTFS caused by external `git.exe` CLI executions.
3. **Head-of-line blocking** in the sequential merge queue (P2).
4. **Synthetic shortcuts** in benchmark harnesses masking true distributed failure modes (P1/P2).

**Arbiter v2** resolves these limitations by introducing a **Layered Hybrid Kernel**:
- An **Upper Protocol Plane** in TypeScript / Node 22 delivering native MCP tools, JSON-RPC 2.0 stdio/SSE transports, and high-level agent coordination.
- A **Lower Execution Kernel** (written in Rust or hardened native C ABI bindings) delivering in-process Git operations via `libgit2`, OS-level process sandboxing (Windows Job Objects & Linux cgroups), and lock-free SQLite WAL transactions.

```
+---------------------------------------------------------------------------------------+
|                                    AGENT CLUSTER                                      |
|   [ Agent Worker 1 ]         [ Agent Worker 2 ]          [ Agent Worker N ]           |
+-------------------+--------------------+-------------------------+--------------------+
                    |                    |                         |
                    +--------------------+-------------------------+
                                         | JSON-RPC 2.0 / MCP Protocol (stdio / SSE)
                                         v
+---------------------------------------------------------------------------------------+
|                       LAYER 1: MCP & PROTOCOL LAYER (TypeScript)                      |
|  - MCP Tool Registry (`arbiter_claim_task`, `arbiter_checkpoint`, `complete`, etc.)   |
|  - CLI Surface (`arbiter submit`, `status`, `metrics`, `watchdog`, `merge`)           |
|  - Session Tokenization, Dynamic Prompting & Waymark Context Re-injection             |
+----------------------------------------+----------------------------------------------+
                                         | In-Process Native FFI / Direct Bindings
                                         v
+---------------------------------------------------------------------------------------+
|                    LAYER 2: ARBITER EXECUTION KERNEL (Rust / Native)                  |
|  +--------------------------------+ +-----------------------------------------------+  |
|  |     Task Graph & Scheduler     | |           Process & Sandbox Supervisor        |  |
|  |  - Kahn DAG Topological Sort   | |  - OS Job Objects (Windows NTFS)              |  |
|  |  - Atomic CAS Lease Dispatch   | |  - cgroups v2 / pidfd (Linux)                 |  |
|  |  - Lease Epoch Validation      | |  - Guaranteed Process-Tree Eviction           |  |
|  +--------------------------------+ +-----------------------------------------------+  |
|  +--------------------------------+ +-----------------------------------------------+  |
|  |     Worktree Manager Core      | |          Non-Blocking Merge Pipeline          |  |
|  |  - In-Process libgit2 Engine   | |  - Dedicated Headless Merge Worktree          |  |
|  |  - Microsecond Tree Add/Prune  | |  - Optimistic Parallel 3-Way Merge Queue      |  |
|  |  - Zero git.exe Child Spawns   | |  - Automated Conflict Reconciliation Tasks    |  |
|  +--------------------------------+ +-----------------------------------------------+  |
+----------------------------------------+----------------------------------------------+
                                         | Strict ACID Storage Boundaries
                                         v
+---------------------------------------------------------------------------------------+
|                       LAYER 3: STORAGE & CONTINUITY PLANE                             |
|  - SQLite 3 WAL Database (`arbiter.db` with atomic `BEGIN IMMEDIATE` transactions)   |
|  - Ephemeral Git Worktrees (`.arbiter/worktrees/task-<id>/`)                          |
|  - Waymark In-Flight Continuity Ledgers (`.waymark/trajectory.json`)                  |
|  - Capn Episodic Memory Index (`.capn/`)                                              |
+---------------------------------------------------------------------------------------+
```

---

## 2. Core Subsystems & Technical Specifications

### 2.1 Subsystem A: Atomic Task Acquisition & Lease Protocol (Resolving P1 #1 & P1 #4)

#### The Problem in v1
v1 executes a non-atomic `getReadyTasks()` followed by `updateTask()`. Two workers simultaneously read the same task, resulting in worktree deletion and duplicate active leases in `worker_leases`.

#### The v2 Specification: Two-Phase Atomic CAS Protocol

##### 1. Database Schema Hardening
In `migrations.ts`, enforce relational integrity at the schema level:

```sql
-- Enforce single active lease per task across entire database
CREATE TABLE IF NOT EXISTS worker_leases (
  lease_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  worker_id TEXT NOT NULL,
  pid INTEGER NOT NULL,
  lease_epoch INTEGER NOT NULL DEFAULT 1,
  heartbeat_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('ACTIVE', 'EXPIRED', 'RELEASED')),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- Crucial: Zero possibility of duplicate active leases
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_task_lease 
ON worker_leases(task_id) WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_tasks_claimable 
ON tasks(status, created_at) WHERE status IN ('PENDING', 'READY');
```

##### 2. Single-Query Atomic Compare-And-Swap (CAS)
Task claiming must be a single atomic write transaction utilizing SQLite's `RETURNING` clause:

```sql
BEGIN IMMEDIATE;

-- Atomically select and transition exactly one ready task to ASSIGNED
UPDATE tasks
SET 
  status = 'ASSIGNED',
  assigned_worker_id = :worker_id,
  updated_at = :now
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
RETURNING id, title, description, base_branch;

-- Atomically insert the unique active lease with monotonic epoch
INSERT INTO worker_leases (
  lease_id, task_id, worker_id, pid, lease_epoch, heartbeat_at, expires_at, status
) VALUES (
  :lease_id, :task_id, :worker_id, :pid, 1, :now, :expires_at, 'ACTIVE'
);

COMMIT;
```

##### 3. Failure Semantics & EAGAIN Backoff
If the atomic update returns 0 rows, the worker receives an explicit `{ ok: false, error: "EAGAIN", retry_after_ms: 100 }`. If worktree creation fails downstream, Arbiter rolls back the task status to `READY` within an immediate transaction.

```
       Worker 1                              SQLite WAL                            Worker 2
          |                                      |                                    |
          |--- BEGIN IMMEDIATE ----------------->|                                    |
          |    UPDATE ... RETURNING task-A       |                                    |
          |    INSERT worker_leases (ACTIVE)     |                                    |
          |<-- Returns task-A (CLAIMED) ---------|                                    |
          |                                      |<-- BEGIN IMMEDIATE (Blocks) -------|
          |--- COMMIT -------------------------->|                                    |
          |                                      |--- Evaluates UPDATE -------------->|
          |                                      |    (0 rows matched - task-A gone)  |
          |                                      |<-- Returns NULL (EAGAIN backoff) --|
```

---

### 2.2 Subsystem B: In-Process Git Worktree Engine via `libgit2` (Eliminating Git Latency)

#### The Problem in v1
Every operation spawns a standalone `git.exe` process via `child_process.execFileSync()`. On Windows:
- Spawning a process incurs 80ms–150ms overhead.
- Git creates `.git/index.lock` files on disk that collide with Windows Defender and antivirus scanners, causing intermittent `EPERM` / `EBUSY` failures.
- Synchronous calls block the Node.js event loop completely.

#### The v2 Specification: In-Process `libgit2` Worktree Supervisor
Arbiter v2 embeds `libgit2` (via native Rust N-API bindings or `nodegit` / `@libgit2/node`):

```
+-------------------------------------------------------------------------+
|                       WORKTREE MANAGER (In-Process)                     |
|                                                                         |
|   1. Worktree Creation:                                                 |
|      git_worktree_add(repo, "arbiter/task-1", target_path, opts)        |
|      -> Direct in-memory ref & index creation                           |
|      -> Zero child processes spawned                                    |
|      -> Typical latency: <0.8ms (100x faster than git.exe CLI)          |
|                                                                         |
|   2. Commit Staging:                                                    |
|      git_index_add_all() + git_commit_create()                           |
|      -> Direct tree hash generation and commit write                    |
|                                                                         |
|   3. Ephemeral Worktree Teardown:                                       |
|      git_worktree_prune()                                               |
|      -> Instant handle release without lingering lockfiles              |
+-------------------------------------------------------------------------+
```

##### Invariant Guarantees:
1. **Isolated Working Directory**: Each agent continues to work strictly in its dedicated `.arbiter/worktrees/task-<id>` path.
2. **Handle-Safe Pruning**: Because handles are managed in-process, worktrees can be closed and unlinked without Windows file-locking errors (`EBUSY: resource busy or locked`).

---

### 2.3 Subsystem C: Non-Blocking Merge Pipeline & Automated Conflict Reconciliation (Resolving P2 #6)

#### The Problem in v1
1. **Root Working Tree Contamination**: `MergeQueue.mergeTask()` executes `git checkout targetBranch` directly in the operator's checkout root (`repoRoot`). If the operator has unstaged work, the merge crashes.
2. **Head-of-Line Blocking**: When Task #1 has a merge conflict, `mergeAllCompleted()` runs `break`, blocking Task #2..#10 even if they modify completely different directories.

#### The v2 Specification: Dedicated Merge Sandbox & Optimistic Pipelining

```
[ Completed Queue ]
   |
   +---> Task 1 (auth.ts)      ---[ Dedicated Merge Sandbox ]---> CONFLICT ---> [ Quarantine & Gen Reconcile Task ]
   |
   +---> Task 2 (pipeline.ts)  ---[ Dedicated Merge Sandbox ]---> CLEAN    ---> Merged to main!
   |
   +---> Task 3 (metrics.ts)   ---[ Dedicated Merge Sandbox ]---> CLEAN    ---> Merged to main!
```

##### 1. Dedicated Headless Merge Worktree
Merges are executed in a permanent, isolated merge runner (`.arbiter/merge-sandbox`). The operator's main checkout is **never touched or checked out**.

##### 2. Non-Blocking Merge Loop (`continue` instead of `break`)
The queue iterator evaluates orthogonality:
```ts
export class NonBlockingMergePipeline {
  async processQueue(targetBranch = "main"): Promise<PipelineResult> {
    const completed = this.db.listTasks("COMPLETED");

    for (const task of completed) {
      const mergeResult = await this.sandbox.tryMerge(task.branch, targetBranch);

      if (mergeResult.clean) {
        await this.sandbox.commitMerge(task.id, targetBranch);
        this.db.updateTask(task.id, { status: "MERGED" });
        this.taskGraph.unblockChildrenOf(task.id);
      } else {
        // Quarantine this task, but DO NOT stop the queue!
        this.db.updateTask(task.id, { 
          status: "CONFLICT",
          errorMessage: mergeResult.conflictFiles.join(", ")
        });
        
        // Automated Self-Healing: Spawn an autonomous reconciliation task
        await this.spawnReconciliationTask(task, mergeResult);
        
        // Continue processing other independent completed tasks!
        continue;
      }
    }
  }
}
```

##### 3. Automated Self-Healing: Reconciliation DAG Nodes
When a merge conflict occurs, Arbiter v2 generates a synthetic child task:
- `id`: `reconcile-task-<id>`
- `dependencies`: `[task.id]`
- `description`: Contains the exact Git 3-way conflict markers (`<<<<<<< HEAD`, `=======`, `>>>>>>>`).
- `worker_directive`: "Inspect conflicting lines in `auth.ts`, reconcile semantic intent, run test suite, and submit resolution."

---

### 2.4 Subsystem D: OS-Level Process Supervision & Watchdog (Resolving P1 #2 & P2 #8)

#### The Problem in v1
v1 checks worker liveness using Node's `process.kill(pid, 0)`. On Windows, this does not track descendant child processes (e.g. if the agent spawned a compiler or bash script). Furthermore, stale heartbeats merely mark the lease expired without killing hung child processes, creating zombie background processes that keep file locks open.

#### The v2 Specification: OS Kernel Job Objects & Cgroups

##### 1. Platform-Stratified Process Sandboxing

| Platform | Sandboxing Primitive | Guarantees Enforced |
| :--- | :--- | :--- |
| **Windows (NTFS)** | **Win32 Job Objects** (`CreateJobObjectW`) | `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`: When lease expires, terminating the Job Object instantly kills the agent and **all descendant child processes** (compilers, git, node). Eliminates NTFS handle leaks. |
| **Linux (ext4)** | **cgroups v2 + pidfd** | Bounded CPU/memory limits (`memory.max`); atomic signal delivery via `pidfd_send_signal` immune to PID recycling. |
| **macOS (Darwin)** | **Process Groups (`setpgid`)** | Group-wide teardown via `kill(-pgid, SIGKILL)` on lease expiration. |

##### 2. Monotonic Heartbeats & Epoch Fencing
To protect against the **ABA problem** (where an agent process freezes due to a long garbage-collection pause, its lease is reclaimed by another worker, and then the original agent wakes up and writes corrupted data):
- Every lease has a monotonically increasing `lease_epoch`.
- When an agent calls `arbiter_checkpoint` or `arbiter_complete_task`, it must pass its assigned `lease_epoch`.
- If `lease_epoch < current_epoch`, the write is rejected with `STALE_EPOCH_REVOKED`, and the worktree is placed in read-only mode.

---

### 2.5 Subsystem E: Empirical Benchmark Harness (Resolving All Audit Divergences)

To transform `arbiter-live-benchmark` from a synthetic deterministic simulator into a true scientific testbed:

#### 1. Multi-Process Concurrent Replay Engine
Replace synchronous loops in `deterministic.ts` with real OS worker subprocesses:
```ts
// Real concurrency test for Scenario 009 (10 workers)
const workers = Array.from({ length: 10 }, (_, i) => ({
  id: `worker-${i + 1}`,
  task: `task-concurrent-${i + 1}`
}));

// Run all 10 workers simultaneously against the live Arbiter MCP server
await Promise.all(workers.map(w => spawnMcpWorkerClient(w)));
```

#### 2. Real LLM Tokenizer Integration
In `scripts/calibrate-tokens.mjs`, eliminate the self-referential regex comparison. Install `@dqbd/tiktoken` as a development dependency and compare the Arbiter token counter directly against compiled BPE tokenizers:
```ts
import { get_encoding } from "@dqbd/tiktoken";
const enc = get_encoding("cl100k_base");
const realTikTokens = enc.encode(codeContent).length;
const arbiterTokens = countTokens(codeContent);
const delta = Math.abs(arbiterTokens - realTikTokens) / realTikTokens;
```

#### 3. Real Chaos Fault Injection
- **Mid-Merge Interrupt (Scenario 012)**: Spawn a worker performing a real large multi-file merge, capture its OS PID, send a real `SIGTERM` / `TerminateProcess`, and verify that the merge sandbox returns cleanly to the pre-merge commit SHA with 0 orphan lockfiles.
- **Storage Exhaustion (Scenario 014)**: Create a small virtual RAM disk or bounded loopback mount (e.g. 5MB), fill it to capacity, and verify that SQLite WAL throws `SQLITE_FULL` and rolls back cleanly without corrupting the database.

---

## 3. Implementation Roadmap & Migration Phases

```
+-----------------------------------------------------------------------------+
| PHASE 1: Immediate Safety & Concurrency Hardening (TypeScript Engine)       |
| Duration: Sprint 1 (1-2 Weeks)                                              |
| - Implement atomic CAS update with RETURNING in taskService.ts              |
| - Add UNIQUE index on worker_leases(task_id) WHERE status = 'ACTIVE'        |
| - Fix MergeQueue head-of-line blocking (continue instead of break)          |
| - Disclose benchmark limitations in FINAL_VERIFICATION_AUDIT_v1.2.0.md      |
+--------------------------------------+--------------------------------------+
                                       v
+-----------------------------------------------------------------------------+
| PHASE 2: Dedicated Merge Sandbox & Multi-Process Benchmark Harness          |
| Duration: Sprint 2 (2-3 Weeks)                                              |
| - Move merges to dedicated .arbiter/merge-sandbox worktree                  |
| - Upgrade arbiter-live-benchmark to spawn real concurrent child processes   |
| - Integrate @dqbd/tiktoken in calibrate-tokens.mjs                          |
| - Implement automated reconciliation tasks on merge conflict                |
+--------------------------------------+--------------------------------------+
                                       v
+-----------------------------------------------------------------------------+
| PHASE 3: Native Kernel Delegation (Rust / libgit2 + Job Objects)            |
| Duration: Sprint 3 (3-4 Weeks)                                              |
| - Author native addon for in-process libgit2 worktree operations           |
| - Implement Win32 Job Objects and Linux cgroups for worker sandboxing       |
| - Benchmark true 50-worker live parallel scaling (<1ms worktree provisioning|
+-----------------------------------------------------------------------------+
```

---

## 4. Summary Architectural Invariant Matrix

| Dimension | Arbiter v1.0 (Current) | Arbiter v2.0 (Target Architecture) |
| :--- | :--- | :--- |
| **Task Claiming** | Non-atomic read-then-update (Race condition) | **Single-query atomic CAS with `BEGIN IMMEDIATE`** |
| **Active Leases** | Multiple active leases permitted per task | **Enforced strictly 1:1 via Partial Unique Index** |
| **Git Operations** | Heavy `git.exe` CLI process spawning | **In-process `libgit2` native bindings (<1ms)** |
| **Merge Queue** | Blocks all merges on single conflict (Head-of-line) | **Non-blocking optimistic merge + auto-reconciliation** |
| **Process Cleanup** | Naive `process.kill(pid, 0)` | **OS Job Objects (Win) & cgroups (Linux)** |
| **Zombie Protection** | Susceptible to ABA resurrection | **Monotonic `lease_epoch` fencing** |
| **Benchmark Fidelity**| Serial `for` loops & hardcoded metrics | **Multi-process child swarm & real BPE tokenizers** |
