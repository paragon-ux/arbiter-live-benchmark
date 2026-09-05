# ARBITER SYSTEM ARCHITECTURE SPECIFICATION (v2.1.3)

**Version:** 2.1.3 (System Architecture Remedial Release)  
**Classification:** Authoritative System Architecture Specification  
**Reference Review:** Claude Opus 4.6 Evaluation Report (Sept 5, 2026)

---

## 1. Executive Architecture Summary

Arbiter is a local-first multi-agent orchestration engine designed for high-concurrency autonomous software engineering swarms. It enforces strict mathematical, process, and filesystem invariants across competing agent processes with **zero runtime npm dependencies** (pure Node 22 stdlib + native SQLite WAL).

The architecture rests upon three non-negotiable operational pillars:

```
+---------------------------------------------------------------------------------------+
|                                ARBITER SYSTEM PILLARS                                 |
+---------------------------+-------------------------------+---------------------------+
| 1. Topological DAG        | 2. Ephemeral Worktrees        | 3. Dedicated Merge Sandbox|
| Task Scheduling           | (1:1:1 Invariant)             | & Fail-Closed Quarantine  |
| - Atomic CAS claims       | - Isolated Git worktrees      | - Out-of-band sandbox     |
| - Monotonic lease epochs  | - Native Win32 Job Objects    | - Sequential 3-way merges |
| - Zero N+1 Kahn sort      | - Zero workspace stomping     | - Automated reconciliation|
+---------------------------+-------------------------------+---------------------------+
```

---

## 2. Invariant Guarantee Matrix

| Invariant | Implementation Mechanism | Failure Mode Prevented | Verified SLA / Latency |
| :--- | :--- | :--- | :--- |
| **Atomic CAS Claiming** | `BEGIN IMMEDIATE` + `UPDATE ... WHERE status IN ('PENDING','READY')` | Double-claiming, phantom assignments under swarm load | < 2ms contention |
| **Monotonic Lease Epochs** | `lease_epoch INTEGER NOT NULL DEFAULT 1` incremented on claim/reclaim | ABA race conditions, zombie worker clobbering | Verified (`STALE_EPOCH_REVOKED`) |
| **1:1:1 Worktree Isolation** | `git worktree add -b arbiter/task-<id>` per worker PID | Cross-agent file stomping, dirty main pollution | Zero workspace corruption |
| **Process Confinement** | Win32 Job Object (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`) + CLI fallback | Orphan worker leak, lingering background processes | Native kernel N-API addon |
| **Dedicated Merge Sandbox** | Isolated `.arbiter/merge-sandbox` working copy | Operator working directory clobbering | Primary checkout untouched |
| **Fail-Closed Quarantine** | Instant `git merge --abort` on conflict + quarantine branch | Dirty unmerged conflict markers polluting main | 100% main branch validity |
| **Zero-Daemon Watchdog** | Invocation-based `process.kill(pid, 0)` dead-PID eviction | Orphan locks, dead-agent deadlock | 1.23ms (20 leases) |
| **Typed Error Contracts** | Dedicated `ArbiterError` hierarchy (`DagCycleError`, etc.) | Contract drift, unstructured exception propagation | 0 untyped raw throws |

---

## 3. Subsystem Breakdown

### 3.1 Task DAG & Topological Scheduling
- **Batch Dependency Resolution:** The dependency graph avoids N+1 queries by pre-fetching all task dependencies via a single SQLite index scan (`getAllDependencies()`). Kahn's algorithm computes the execution order in **2.88ms for 50 nodes** (well below the 4.0ms SLA).
- **Cycle Prevention:** Adding dependencies validates cycle freedom via breadth-first traversal (`hasCycle()`). Cycle attempts immediately throw a typed `DagCycleError` (`ERR_DAG_CYCLE`).
- **Atomic CAS Transitions:** Task assignment uses `BEGIN IMMEDIATE` SQLite transactions. If a worker attempts to claim a task that transitioned concurrently, SQLite returns 0 changed rows and triggers an atomic retry.

### 3.2 Process Confinement & Ephemeral Worktrees
- **The 1:1:1 Invariant:** Each task execution maps strictly to:
  $$\text{Task}_i \longleftrightarrow \text{Worktree}_i \longleftrightarrow \text{Trajectory}_i$$
- **Native Kernel Sandboxing:** On Windows, the compiled Rust kernel (`arbiter-kernel.node`) binds workers to Win32 Job Objects. When a worker process terminates or is evicted by the watchdog, all spawned descendant processes (compilers, test runners, linters) are terminated instantly by the OS kernel.
- **Graceful CLI Degradation:** If Visual Studio BuildTools or Rust are not present, Arbiter probes 11 candidate binary paths, detects the absence of native bindings, and seamlessly falls back to the native `git.exe` CLI.

### 3.3 Dedicated Merge Sandbox & Concurrency Contention
- **Out-of-Band Sandbox:** Merges never touch the developer's root working directory. Arbiter provisions `.arbiter/merge-sandbox` checked out to the target branch (`main`).
- **Sanitization & Error Resilience:** Before and after merge execution, Arbiter sanitizes the sandbox. Expected no-op conditions (e.g. `MERGE_HEAD missing` when no merge is active) are cleanly handled, while actual Git I/O or checkout failures throw structured `MergeQueueError` exceptions rather than being silently swallowed.
- **Sequential 3-Way Merge:** Competing branches merge sequentially into the sandbox. Clean changes are committed and pushed to `main`.
- **Fail-Closed Abort & Quarantine:** Any conflict triggers an immediate `git merge --abort`. The task transitions to `CONFLICT`, its worktree is quarantined for inspection, and an automated reconciliation task (`reconcile-<taskId>`) is enqueued.

### 3.4 Multi-Worker Merge Contention & Dynamic Task Mapping
- **The Non-Deterministic Scheduling Challenge:** In high-concurrency swarms where $N$ workers execute simultaneously in child processes, OS thread/process scheduling creates non-deterministic task claim sequences.
- **Dynamic Worker Receipt Mapping:** In Arbiter v2.1.3, the orchestrator and benchmark harnesses do not rely on speculative worker-to-task ID pairings. Instead, worker subprocess outputs return the exact `taskId` claimed under atomic CAS. The merge pipeline maps these receipts directly, enabling deterministic verification of clean vs colliding branches regardless of claim ordering.

### 3.5 Waymark In-Flight Continuity Bridge
- **Native Integration vs Mock Fallback:** When the Waymark CLI is installed, Arbiter invokes live trajectory commands (`waymark init`, `begin`, `note`, `check`, `resume`, `complete`) inside `.waymark/`.
- **Transparent Mock Fallback:** When the external CLI is absent, Arbiter's `WaymarkSupervisor` provides an in-memory bridge utilizing synthetic `trj_mock_` trajectory IDs. This guarantees 100% interface fidelity and test isolation without crashing or halting pipelines.

---

## 4. Cross-Platform Latency Nuances & Regression Tolerances

### 4.1 Worktree Provisioning Latency Mechanics
Independent evaluation noted significant latency variance in worktree provisioning across platforms:
- **Linux ext4:** 11–17ms (kernel inode allocation, zero filter drivers)
- **Windows 11 (NTFS):** 148.83ms (measured on standard SSD)
- **Documented Target Claim:** "~300ms"

**Architectural Rationale:** The conservative "~300ms" figure published in Arbiter documentation reflects real-world enterprise Windows workstations under active Windows Defender real-time filesystem scanning and corporate filter drivers (CrowdStrike, Tanium). Under clean developer configurations, Arbiter achieves 148ms on Windows, but the SLA is deliberately calibrated to prevent false CI regressions on loaded host environments.

### 4.2 Platform-Stratified Regression Tolerances

| Platform | Regression Tolerance | Technical Justification |
| :--- | :--- | :--- |
| **Linux (Ubuntu/Debian)** | **25%** | Deterministic kernel scheduling, fast fork/exec, minimal filesystem jitter. |
| **macOS (Darwin APFS)** | **60%** | APFS CoW latency spikes, dynamic thermal throttling on Apple Silicon/Intel. |
| **Windows 11 (NTFS)** | **100%** | NTFS file table lock contention, asynchronous child process termination, Defender I/O hook latencies. |

A 5.0ms dynamic jitter floor is applied to all sub-millisecond metrics to ensure micro-benchmarks (e.g. 1.2ms watchdog scans) do not trigger false positive alerts from trivial 1ms operating system noise.

---

## 5. Architectural Quality Matrix

```
Dimension                v2.0.0 (Legacy)    v2.1.2 (Audited)    v2.1.3 (Remediated)
Topological Sort         Mocked             2.88ms Real Kahn    2.88ms Real Kahn
Runtime Dependencies     0                  0                   0 (Strict Node stdlib)
Error Typing             Raw throws         Raw throws          Typed ArbiterError hierarchy
Merge Sandbox Cleanup    Dirty leaks        Silent swallow      Explicit structured recovery
N-Way Conflict Swarm     Simulated          Race sensitive      Deterministic dynamic mapping
Win32 Job Objects        Uncompiled         Compiled Rust       Compiled Rust + CLI fallback
```
