# ARBITER SYSTEM ARCHITECTURE SPECIFICATION (v2.1.0)

**Version:** 2.1.0 (Remediation)  
**Classification:** Core System Architecture Specification

---

## 1. Architectural Overview

Arbiter orchestrates autonomous coding agents through three core pillars:
1. **Topological DAG Task Scheduling:** Enforces dependency ordering with cycle detection and atomic CAS state transitions (`PENDING` -> `READY` -> `ASSIGNED` -> `IN_PROGRESS` -> `COMPLETED`).
2. **Ephemeral Worktree Sandboxing:** Each claimed task provisions an isolated Git worktree (`1 Task : 1 Worktree : 1 Trajectory`), confined via native Win32 Job Objects on Windows and standard CLI fallbacks elsewhere.
3. **Dedicated Merge Sandbox & Fail-Closed Quarantine:** Merges execute in an out-of-band worktree (`.arbiter/merge-sandbox`), guaranteeing that an operator's dirty working tree is never touched or clobbered. Unresolvable conflicts trigger automatic `git merge --abort` and spawn a dependent reconciliation task (`reconcile-<taskId>`).

---

## 2. Invariant Guarantee Matrix

```
+-----------------------------------------------------------------------------------+
| Arbiter Invariant Matrix (v2.1.0)                                                 |
+-------------------+---------------------------------------------------------------+
| Lease Epochs      | Monotonically increasing integers prevent ABA split-brain.    |
| Zero Dependencies | 0 runtime npm packages; pure Node 22 stdlib + SQLite WAL.     |
| Sandboxing        | Native Win32 Job Object process tree confinement.             |
| Merge Isolation   | Dedicated worktree merge isolation; primary checkout pristine. |
| Continuity        | Waymark trajectory snapshotting with AST token accounting.    |
+-------------------+---------------------------------------------------------------+
```

---

## 3. Subsystem Breakdown

### 3.1 Lease Watchdog & Epoch Fencing
- **Monotonic Epochs:** SQLite schema version 3 adds `lease_epoch INTEGER NOT NULL DEFAULT 1`.
- **Fencing:** Every `checkpoint()` and `completeTask()` call asserts the worker's epoch. If the watchdog has re-assigned the task to another worker, calls from stale zombie workers fail immediately with `STALE_EPOCH_REVOKED`.

### 3.2 Dedicated Merge Queue
- **Sandbox Provisioning:** Merges are attempted inside `.arbiter/merge-sandbox`.
- **Operator Checkout Preservation:** Primary working tree dirty state is verified before merge and left completely intact.
- **Fail-Closed Abort:** Merge conflicts trigger immediate `git merge --abort` inside the sandbox, transitioning the task to `CONFLICT_QUARANTINE` and automatically enqueuing a child reconciliation task.

### 3.3 Native Execution Kernel
- **Rust N-API Addon:** Compiled via Visual Studio BuildTools 2022 (`build-native.mjs`).
- **Confinement:** Win32 Job Object assigns child PIDs with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`, ensuring orphan processes terminate cleanly when leases expire.
