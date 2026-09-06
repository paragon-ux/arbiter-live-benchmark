# ARBITER v2.3.0 IMPLEMENTATION WALKTHROUGH

**Version:** 2.3.0 implementation package  
**Status:** Planned; no implementation results claimed  
**Target repositories:** Waymark, Arbiter, and `arbiter-live-benchmark`  
**Feature:** Read-only structured AST symbol discovery

This is the implementation walkthrough for the agreed v2.3.0 slice. It is a
plan, not a report of completed code or executed benchmarks.

---

## 1. Context and Objectives

The current stack already provides task scheduling, lease epochs, isolated
worktrees, merge quarantine, and Waymark lifecycle continuity. The next
architecture gap is structured symbol discovery for a worker operating in its
own claimed worktree.

The implementation has four objectives:

1. expose Waymark's existing WASM Tree-sitter parser as a structured operation;
2. bridge it through Arbiter's existing lease and worktree boundaries;
3. preserve the zero-runtime-dependency and 1:1:1 invariants; and
4. add one real benchmark scenario without synthetic or mock coverage.

Rust and Python parser bindings are explicitly outside this slice. Python is a
supported source language, but it is parsed by Waymark's existing WASM grammar,
not by `py-tree-sitter`.

---

## 2. Planned Implementation Slices

### Slice 1: Waymark structured discovery

Reuse the current Waymark AST extraction path rather than adding a parser.
Provide one shared operation for the MCP and CLI adapters:

- MCP: `waymark_discover_symbols`;
- CLI: `discover-symbols`;
- input: repository-relative file path and optional language;
- output: normalized path, detected language, symbols, kinds, and ranges.

The operation must support TypeScript and Python, reject files over 1 MiB,
reject malformed source, and return structured errors for unsupported language
or parser failure.

### Slice 2: Arbiter lease-checked bridge

Add only the boundary code required to the existing Waymark supervisor and MCP
/ CLI surfaces:

- MCP: `arbiter_discover_symbols`;
- CLI: `discover-symbols`;
- required identity: `task_id`, `worker_id`, and `lease_epoch`;
- path resolution: repository-relative path inside the claimed worktree;
- delegation: Waymark structured discovery;
- state: no database table, AST cache, trajectory write, or fallback parser.

Arbiter owns authorization and containment. Waymark owns parsing. A failed
validation or parser operation must leave task, lease, worktree, Git, and
trajectory state unchanged.

### Slice 3: Real benchmark coverage

Add one scenario, `023-symbol-discovery`, to the existing live harness. It must
exercise the real subprocess path, an active lease, a real claimed worktree,
and the real Waymark parser. The scenario must check the structured response,
source ranges, measured latency, and no-write behavior.

The scenario must not use a mock MCP adapter, parser simulator, regex result,
synthetic metric, or hardcoded timing result. A v2.3.0 baseline is created only
after the new scenario and the full suite pass.

### Slice 4: Documentation and release gates

After implementation evidence exists, update current living documentation and
the baseline/table artifacts. Historical reports remain immutable. Version
bumps and tags follow passing local gates, CI, and remote verification.

---

## 3. Verification Commands

These commands are release gates to run after implementation, not claimed
results of this package:

```powershell
# Waymark, if its public API changes
npm test
npm run schema-check
npm run public-check

# Arbiter
npm run verify
npm run test:coverage

# Live benchmark
npm run verify:release
```

The benchmark's existing checklist, document consistency, claims, hygiene,
baseline, table, public, version, and token-calibration scripts must also pass
on the final implementation commit. Do not weaken a tolerance to make the
feature pass.

---

## 4. Completion Criteria

The package is ready for release consideration only when:

- the structured operation is real in Waymark and Arbiter;
- TypeScript and Python behavior is tested through the existing WASM parser;
- all lease/path/parser boundaries fail closed;
- MCP and CLI results match;
- no state is mutated by discovery;
- one real scenario is implemented and measured;
- all local, CI, and remote gates pass; and
- the working trees are clean on `main`.

Until then, this document remains an implementation plan.
