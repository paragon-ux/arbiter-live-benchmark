# PRIORITIZED FINDINGS IMPLEMENTATION PACKAGE: ARBITER & BENCHMARK (v2.3.0)

**Version:** 2.3.0 implementation package  
**Status:** Planned; implementation and verification pending  
**Current baseline:** Arbiter 2.2.1, Waymark 1.7.0, live benchmark 2.2.1  
**Scope:** Structured, read-only AST symbol discovery

This document defines the v2.3.0 findings without repeating prior release
results. Existing release gates remain prerequisites; this package does not
claim that the v2.3.0 feature has been implemented or verified.

---

## 1. Executive Summary

The remaining architecture gap is a stable structured symbol-discovery path
for an agent working inside its own claimed Arbiter worktree. Waymark already
owns a working `web-tree-sitter`/WASM AST implementation. The v2.3.0 plan is
to expose that implementation through a small structured Waymark operation and
bridge it through Arbiter's existing lease and worktree boundaries.

The implementation is deliberately narrow:

- no second parser in Arbiter;
- no Rust or Python parser binding, including `py-tree-sitter`;
- no regex fallback, parser simulator, mock result, or synthetic metric;
- no database table or persistent AST index;
- exactly one real benchmark scenario after the contract is implemented.

---

## 2. P1 Findings

| Finding ID | Description | Root Cause | Planned Resolution | Evidence Status |
| :--- | :--- | :--- | :--- | :--- |
| **P1.1** | Structured symbol discovery is not yet an Arbiter-facing capability | Waymark has parser internals, but the current integration does not expose a stable structured discovery operation | Expose Waymark's existing WASM parser through `waymark_discover_symbols`; add an Arbiter lease-checked bridge named `arbiter_discover_symbols` | **PLANNED** |

P1.1 is the only new feature-critical finding in this package. The operation
must be read-only and must fail closed before parsing when the lease or path is
invalid.

---

## 3. P2 Findings

| Finding ID | Description | Root Cause | Planned Resolution | Evidence Status |
| :--- | :--- | :--- | :--- | :--- |
| **P2.1** | Parser ownership could be duplicated | Arbiter needs discovery, while Waymark owns Tree-sitter internals | Keep parsing in Waymark; Arbiter owns validation and delegation only | **PLANNED** |
| **P2.2** | Lease scope is incomplete for discovery unless the epoch is checked | `task_id` and `worker_id` alone do not fence a stale worker | Require active `task_id`, matching `worker_id`, and current `lease_epoch` before delegation | **PLANNED** |
| **P2.3** | MCP and CLI contracts could drift | The operation needs an agent surface and an operator/debugging surface | Use `waymark_discover_symbols` / `arbiter_discover_symbols` and `discover-symbols`, with one normalized JSON shape | **PLANNED** |
| **P2.4** | New capability has no live benchmark coverage | No structured discovery scenario exists for this capability | Add exactly one real `023-symbol-discovery` scenario and produce the v2.3.0 baseline only after it passes | **PLANNED** |

---

## 4. P3 Findings and Documentation Decisions

| Finding ID | Description | Planned Resolution | Evidence Status |
| :--- | :--- | :--- | :--- |
| **P3.1** | Result ranges are underspecified | Use 1-based lines, 0-based columns, end-exclusive ranges, and lowercase symbol kinds; document the column units supplied by Tree-sitter | **PLANNED** |
| **P3.2** | Parser resource limits are underspecified | Reject files over 1 MiB, return structured unsupported-language and parse errors, and never fall back to text search | **PLANNED** |
| **P3.3** | Benchmark latency terminology can be overstated | Treat the baseline latency budget as a regression target, not a product SLA; record an over-budget result as a finding instead of relaxing gates | **PLANNED** |
| **P3.4** | Historical mock-fallback wording can be misread as AST support | Keep historical lifecycle documentation unchanged, but state that the new discovery path has no mock or synthetic fallback | **PLANNED** |

---

## 5. Verification Matrix

| Area | Acceptance condition | Status before implementation |
| :--- | :--- | :--- |
| Ownership | Waymark parses; Arbiter validates and delegates | Pending |
| Lease safety | `task_id` + `worker_id` + `lease_epoch` are active and matching | Pending |
| Path safety | Repository-relative path; traversal and symlink escape rejected | Pending |
| Parser contract | TypeScript and Python; 1 MiB limit; parse errors rejected | Pending |
| Response contract | Stable structured symbols and source ranges | Pending |
| Mutation safety | No source, Git, SQLite, lease, or trajectory mutation | Pending |
| Benchmark | One real scenario; v2.3.0 baseline after execution | Pending |
| Release | Local gates, CI, and remote verification pass before tags | Pending |

Prior release findings are intentionally not reproduced in this package.
