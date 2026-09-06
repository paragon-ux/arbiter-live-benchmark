# ARBITER BENCHMARK REGRESSION REPORT (v2.3.0)

**Version:** 2.3.0 implementation package  
**Status:** Pre-implementation plan; no v2.3.0 run has been performed  
**Feature under test:** Real structured symbol discovery

This file defines only the evidence that must be produced for the new feature.
Prior scenario results and release matrices are intentionally kept out of this
document.

---

## 1. Evidence Scope

Add exactly one real scenario, `023-symbol-discovery`, to the current benchmark
suite after the implementation is complete. Do not copy prior run data into
this report. Create or update the v2.3.0 baseline only from a real passing run.

---

## 2. New Scenario: `023-symbol-discovery`

The scenario must:

1. start the real Arbiter subprocess path;
2. obtain a real active task, worker, lease epoch, and claimed worktree;
3. call the real structured discovery bridge;
4. parse a real TypeScript source file through Waymark's existing WASM path;
5. verify symbol names, lowercase kinds, and source ranges;
6. verify that the operation does not write source, Git, SQLite, lease, or
   trajectory state; and
7. record measured duration and token data from the live run.

The scenario must not use a mock MCP adapter, parser simulator, regex result,
synthetic metric, copied timing value, or hardcoded success response. A failed
parser or unavailable Waymark capability must fail the scenario rather than
fall back to text search.

The scenario may be extended to verify the Python grammar through the same real
Waymark path, but it must remain one scenario rather than a benchmark suite
expansion.

---

## 3. Expected Evidence Table

The following fields are intentionally pending until the implementation is run:

| Metric | v2.3.0 result | Gate |
| :--- | :--- | :--- |
| Structured discovery scenario | Pending | Pass |
| Symbol/range correctness | Pending | Pass |
| No-write behavior | Pending | Pass |
| Duration | Pending measured value | Record; investigate over-budget result |
| Tokens | Pending measured value | Record actual output |
| Synthetic/mock discovery path | Must remain absent | Fail if present |

No v2.3.0 baseline file should be created or locked until the real scenario and
the full suite pass.

---

## 4. Completion Condition

The v2.3.0 report is complete only when scenario 023 is added, the full suite
passes, and the result is recorded from the real implementation. Prior scenario
matrices remain in their owning release documents.

---

## 5. Release Verification

After implementation, run the benchmark's release verification and all existing
document, claims, hygiene, checklist, table, baseline, public, version, and
token-calibration checks. Then run exact-commit CI and remote verification.

Until those commands produce recorded evidence, this document remains a plan,
not a pass report.
