# ARBITER v2.3.0 IMPLEMENTATION & ANTI-REGRESSION CHECKLIST

**Version:** 2.3.0 implementation package  
**Status:** Not implemented; all execution gates are pending  
**Target repositories:** Waymark, Arbiter, and `arbiter-live-benchmark`  
**Scope:** Structured, read-only AST symbol discovery

Every unchecked item must be completed with real evidence before a version
bump, tag, or release. No item may be satisfied with a mock, simulator,
synthetic metric, or relaxed tolerance.

---

## 1. Planning and Ownership Gates

### Gate 1: Existing parser ownership

- [ ] Waymark's existing `web-tree-sitter`/WASM path is reused.
- [ ] No Rust parser, Python parser binding, `py-tree-sitter`, or duplicate
      Tree-sitter implementation is added to Arbiter.
- [ ] Arbiter remains at zero runtime npm dependencies.

### Gate 2: Public operation contract

- [ ] Waymark exposes `waymark_discover_symbols` and `discover-symbols`.
- [ ] Arbiter exposes `arbiter_discover_symbols` and `discover-symbols`.
- [ ] MCP and CLI adapters use the same normalized JSON response.
- [ ] The response contains path, language, symbols, kinds, and ranges without
      fields that no caller or test consumes.

---

## 2. Safety and Correctness Gates

### Gate 3: Lease and worktree fencing

- [ ] Discovery requires active `task_id`, matching `worker_id`, and current
      `lease_epoch`.
- [ ] Absolute paths, traversal, and symlink escapes are rejected before file
      access.
- [ ] A stale worker cannot read through a newer lease.

### Gate 4: Parser boundaries

- [ ] TypeScript and Python are verified through Waymark's existing WASM
      grammars.
- [ ] Files larger than 1 MiB are rejected deterministically.
- [ ] Malformed source returns a structured parse error.
- [ ] Unsupported languages return a structured unsupported-language error.
- [ ] No regex, text-search, simulator, or mock fallback claims AST support.

### Gate 5: Range and result stability

- [ ] Lines are 1-based.
- [ ] Columns are 0-based and their Tree-sitter units are documented.
- [ ] End positions are exclusive.
- [ ] Symbol kinds are lowercase.
- [ ] The same real source produces the same normalized result through MCP and
      CLI.

### Gate 6: Read-only behavior

- [ ] Source files and Git state remain unchanged.
- [ ] SQLite state, leases, and task status remain unchanged.
- [ ] Waymark trajectories are not created, advanced, compacted, or mutated by
      discovery.
- [ ] Parser or bridge failure leaves the worktree and lease unchanged.

---

## 3. Verification Gates

### Gate 7: Focused tests

- [ ] Real TypeScript discovery passes.
- [ ] Real Python discovery passes.
- [ ] Invalid lease, stale epoch, path traversal, symlink escape, unsupported
      language, oversized file, and malformed source cases fail closed.
- [ ] Existing Waymark and Arbiter test suites remain green.

### Gate 8: Live benchmark scenario

- [ ] Add exactly one real `023-symbol-discovery` scenario.
- [ ] The scenario uses the real Arbiter subprocess, real worktree, real lease,
      and real Waymark parser.
- [ ] It verifies structured symbols, measured latency, and no-write behavior.
- [ ] It introduces no mock, synthetic, simulated, or hardcoded benchmark
      result.
- [ ] The v2.3.0 baseline contains 23 scenarios only after the scenario passes.

### Gate 9: Documentation and claims

- [ ] Update current living documentation only after implementation evidence
      exists.
- [ ] Preserve the historical 2.1.3 and 2.2.1 reports unchanged.
- [ ] Claims, hygiene, checklist, table, version, and baseline paths agree.
- [ ] The benchmark latency budget is labeled as a regression target, not a
      product SLA.

### Gate 10: Release verification

- [ ] Waymark gates pass if its public API changed: `npm test`, schema check,
      and public check.
- [ ] Arbiter gates pass: `npm run verify` and coverage checks.
- [ ] Benchmark release verification passes, including its current release
      scripts and the new 23-scenario baseline.
- [ ] Exact-commit CI passes on all configured operating systems.
- [ ] Remote verification passes.
- [ ] Only then are versions, tags, and releases authorized.

---

## 4. Stop Conditions

Stop and resolve the design if implementation requires a second parser, a new
Arbiter runtime dependency, weaker lease/path validation, a parser fallback, or
synthetic benchmark evidence.
