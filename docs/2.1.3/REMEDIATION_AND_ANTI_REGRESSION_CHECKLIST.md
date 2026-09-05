# ARBITER v2.1.3 REMEDIATION & ANTI-REGRESSION CHECKLIST

**Version:** 2.1.3  
**Target Repositories:** `Arbiter` & `arbiter-live-benchmark`  
**Evaluation Reference:** Claude Opus 4.6 Audit Report (v2.1.2)

---

## 1. Remediation Verification Checklist

Every gate in this checklist is machine-executable and backed by reproducible command-line verification.

### Gate 1: Typed Error Hierarchy in Arbiter Core
- [x] **Criterion:** Core Arbiter codebase must define a typed `ArbiterError` class hierarchy and eliminate all raw untyped `throw new Error(...)` statements in core lifecycle modules.
- **Implementation:** Created `Arbiter/src/common/errors.ts` defining `DagCycleError`, `TaskNotFoundError`, `InvalidTaskStatusError`, `StaleEpochRevokedError`, `LeaseOwnershipError`, and `MergeQueueError`. Exported in `src/index.ts`.
- **Command:** `node -e "const arb = require('./dist/src/index.js'); console.log(Object.keys(arb).filter(k => k.endsWith('Error')));"`
- **Result:** `['ArbiterError', 'DagCycleError', 'TaskNotFoundError', 'InvalidTaskStatusError', 'StaleEpochRevokedError', 'LeaseOwnershipError', 'MergeQueueError']`
- **Status:** **VERIFIED (PASS)**

---

### Gate 2: Resilient Merge Sandbox Sanitization
- [x] **Criterion:** Merge sandbox cleanup must not swallow errors silently. Expected no-op conditions (`MERGE_HEAD missing`) must be cleanly handled, while actual Git failures must raise structured warnings or typed errors.
- **Implementation:** Updated `ensureMergeSandbox()` in `Arbiter/src/merge/mergeQueue.ts` to handle expected absence of active merges and throw `MergeQueueError` on checkout/clean failure.
- **Command:** `npm test -- --test-name-pattern="Merge Sandbox"`
- **Result:** 3/3 sandbox integration tests PASS.
- **Status:** **VERIFIED (PASS)**

---

### Gate 3: Scenario 019 (N-Way Merge Conflicts) Full 5-Worker Resolution
- [x] **Criterion:** Scenario 019 must orchestrate 5 concurrent OS child processes (2 orthogonal, 3 colliding) matching `019-n-way-merge-conflicts.json`. Task claim race conditions must be eliminated via dynamic receipt mapping, achieving 100% accuracy.
- **Implementation:** Refactored `runNWayMergeConflicts()` in `arbiter-live-benchmark/src/harness/adapters/subprocessMcp.ts`.
- **Command:** `node dist/src/cli/index.js --scenario 019-n-way-merge-conflicts`
- **Result:** Duration: 21,300ms, Tokens: 4,493, Conflicts: 3 quarantined, Clean Merges: 2, Main Intact: true, Accuracy: **100%**, Status: **PASS**.
- **Status:** **VERIFIED (PASS)**

---

### Gate 4: Zero Runtime npm Dependencies
- [x] **Criterion:** `Arbiter/package.json` must contain zero runtime `dependencies`.
- **Implementation:** Pure Node 22 builtins (`node:sqlite`, `node:child_process`, `node:fs`, `node:crypto`).
- **Command:** `node -e "const pkg = require('./package.json'); process.exit(Object.keys(pkg.dependencies || {}).length);"`
- **Result:** Exit 0 (0 dependencies).
- **Status:** **VERIFIED (PASS)**

---

### Gate 5: Arbiter Test Suite Full Pass
- [x] **Criterion:** 100% pass rate across all 11 test suites and 28 integration tests.
- **Command:** `npm test`
- **Result:** 11 suites, 28 tests, 28 pass, 0 fail.
- **Status:** **VERIFIED (PASS)**

---

### Gate 6: Arbiter Claims Registry Verification
- [x] **Criterion:** All registered performance and invariant claims must be within tolerance.
- **Command:** `npm run check:claims`
- **Result:** Exit 0 ("All registered claims within tolerance").
- **Status:** **VERIFIED (PASS)**

---

### Gate 7: Arbiter Claims Hygiene Verification
- [x] **Criterion:** Zero unannotated claims violations across all source and doc files.
- **Command:** `npm run check:hygiene`
- **Result:** Exit 0 ("Claims hygiene check passed: 0 unannotated violations").
- **Status:** **VERIFIED (PASS)**

---

### Gate 8: Live Benchmark Unit Test Suite Pass
- [x] **Criterion:** All unit and schema tests in `arbiter-live-benchmark` pass.
- **Command:** `npm test`
- **Result:** 40/40 tests pass across all harness test files.
- **Status:** **VERIFIED (PASS)**

---

### Gate 9: Live Benchmark Full 22-Scenario Suite Pass
- [x] **Criterion:** All 22 scenarios pass with zero failures.
- **Command:** `npm run verify`
- **Result:** 22/22 scenarios pass, 0 fail.
- **Status:** **VERIFIED (PASS)**

---

### Gate 10: Public Check (Zero Secrets & Zero Private Paths)
- [x] **Criterion:** Zero absolute paths, API keys, private tokens, or author identities in commit artifacts.
- **Command:** `npm run check:public`
- **Result:** Exit 0 ("0 findings").
- **Status:** **VERIFIED (PASS)**

---

### Gate 11: Cross-Document Consistency & Architectural Alignment
- [x] **Criterion:** All 22 scenario titles, descriptions, and correlation matrices must match 1:1 across code, scenarios JSON, and documentation.
- **Command:** `npm run check:docs`
- **Result:** Exit 0 ("0 mismatches").
- **Status:** **VERIFIED (PASS)**
