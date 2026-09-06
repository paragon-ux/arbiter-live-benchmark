# EVALUATION RESPONSE & DISCREPANCY ANALYSIS (v2.3.0)

**Document:** Planning response to the prior audit and v2.3.0 architecture gap  
**Target release:** Waymark 1.8.0 if required, Arbiter 2.3.0, benchmark 2.3.0  
**Status:** Pre-implementation; no new evaluator score or benchmark result  
**Historical reference:** Claude Opus 4.6 evaluation of Arbiter v2.1.2

---

## 1. Executive Response

The prior evaluation and the v2.1.3 remediation set remain historical evidence.
They are not being rewritten. The next unresolved capability is not another
merge or lease rewrite; it is a stable structured symbol-discovery contract
that respects the existing Waymark and Arbiter ownership boundaries.

The agreed response is:

- reuse Waymark's existing `web-tree-sitter`/WASM parser;
- expose a structured Waymark operation and bridge it through Arbiter;
- require active task, worker, and lease epoch validation;
- support TypeScript and Python through the existing grammars;
- use 1-based lines, 0-based columns, end-exclusive ranges, and lowercase
  symbol kinds;
- enforce a 1 MiB file limit and fail closed on parse errors;
- add one real benchmark scenario, with no mock or synthetic coverage; and
- defer version bumps and releases until all gates and remote verification pass.

No Rust parser, Python parser binding, `py-tree-sitter`, regex fallback, or
parser simulator is part of this response.

---

## 2. Discrepancy Analysis

### 2.1 Waymark fallback wording versus discovery capability

The v2.1.3 documents describe a lifecycle fallback for environments where the
Waymark CLI is unavailable. That historical behavior must not be interpreted as
structured AST discovery. The new discovery operation has no mock or synthetic
fallback: unavailable parsing is a structured failure.

The existing lifecycle fallback may remain a separate compatibility concern; it
does not satisfy the v2.3.0 discovery contract and must not be used as benchmark
evidence for it.

### 2.2 Parser choice

Using Aider's historical Python-oriented approach would add a parser binding and
duplicate ownership in this stack. Using a new Rust parser would add another
implementation and distribution path. Neither is necessary because Waymark
already has the required WASM parser dependency and extraction logic.

The minimal compatible choice is to expose and normalize the existing Waymark
result.

### 2.3 Lease and path boundary

Discovery is an agent-facing read operation, but it still crosses a trust
boundary. `task_id` and `worker_id` without `lease_epoch` allow a stale worker
to address a newer worktree lease. The Arbiter bridge therefore requires all
three lease coordinates and validates repository-relative containment before
delegation.

### 2.4 Benchmark evidence

The existing benchmark suite is not evidence for this new capability. The
v2.3.0 evidence must be one real end-to-end scenario using the live subprocess,
claimed worktree, active lease, and Waymark parser. No hardcoded response, mock
adapter, synthetic timing, or copied result is valid evidence.

---

## 3. Response to the Release Questions

| Question | Resolution |
| :--- | :--- |
| Release scope | Waymark is implementation scope if its public API changes; Arbiter and benchmark target 2.3.0. An additive Waymark API is 1.8.0; 2.0.0 requires an intentional breaking change. |
| Ownership | Waymark parses; Arbiter validates leases and paths and delegates. |
| API contract | `waymark_discover_symbols`, `arbiter_discover_symbols`, and `discover-symbols` CLI parity with one JSON shape. |
| Languages | TypeScript and Python through Waymark's existing WASM grammars. |
| Ranges | 1-based lines, 0-based columns, end-exclusive ranges, lowercase kinds. |
| Parser limits | 1 MiB maximum; structured parse and unsupported-language errors; no regex fallback. |
| Lease scope | Require active `task_id`, matching `worker_id`, and current `lease_epoch`. |
| Benchmark | Add exactly one real scenario and create a 23-scenario baseline only after execution passes. |
| Release order | Waymark, when changed; Arbiter; benchmark. Every release requires local gates, CI, and remote verification. |

---

## 4. Latency Budget Clarification

The benchmark latency budget is a comparison target, not a product SLA. It
exists to detect regressions in the measured workflow and to keep discovery
from becoming an unbounded blocking step. Exceeding it means the run is over
budget and requires investigation; it does not justify changing the result,
copying a faster metric, or weakening the gate.

---

## 5. Evaluation and Release Conditions

Do not assign a new score or claim remediation until the following evidence
exists:

- real Waymark and Arbiter operations;
- focused safety and parser tests;
- one real scenario 023;
- a measured 23-scenario baseline;
- unchanged historical reports;
- passing local gates and release scripts;
- passing exact-commit CI and remote verification; and
- clean `main` working trees.

Until then, v2.3.0 is an implementation package, not a release report.
