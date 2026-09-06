# ARBITER SYSTEM ARCHITECTURE SPECIFICATION (v2.3.0)

**Version:** 2.3.0 implementation package  
**Status:** Planned; not an implementation or verification report  
**Classification:** Architecture specification  
**Current components:** Waymark 1.7.0, Arbiter 2.2.1, benchmark 2.2.1

---

## 1. Executive Architecture Summary

Arbiter remains a local-first orchestration engine with zero runtime npm
dependencies, SQLite WAL state, isolated worktrees, lease epochs, and the
`1 Task : 1 Worktree : 1 Trajectory` ownership invariant.

v2.3.0 adds one read-only capability: structured symbol discovery for a file
inside the caller's active worktree. Waymark remains the parser owner because
it already contains the working `web-tree-sitter`/WASM implementation. Arbiter
adds authorization and containment, not a second parser.

```text
caller
  -> Arbiter MCP / CLI
     -> task + worker + lease_epoch validation
        -> claimed-worktree path validation
           -> Waymark MCP / CLI structured discovery
              -> normalized symbols and source ranges
```

The new path does not add Rust or Python parser bindings, `py-tree-sitter`, a
regex fallback, a simulator, a mock result, or persistent AST state. The
existing Rust kernel remains an optional process-confinement component; it is
not part of symbol parsing.

---

## 2. Ownership Matrix

| Concern | Owner | Boundary |
| :--- | :--- | :--- |
| Task identity and status | Arbiter | Existing task service and database |
| Lease identity and epoch | Arbiter | Active `task_id`, `worker_id`, `lease_epoch` |
| Worktree containment | Arbiter | Repository-relative path; traversal and symlink escape rejected |
| AST parsing | Waymark | Existing `web-tree-sitter`/WASM grammars |
| Symbol response normalization | Waymark contract, validated by Arbiter | Same JSON shape through MCP and CLI |
| Trajectory continuity | Waymark | Discovery is read-only and does not advance a trajectory |
| Empirical coverage | Live benchmark | Real subprocess, real worktree, one new scenario |

---

## 3. Structured Discovery Contract

### 3.1 Public names

| Surface | Waymark | Arbiter |
| :--- | :--- | :--- |
| MCP | `waymark_discover_symbols` | `arbiter_discover_symbols` |
| CLI | `discover-symbols` | `discover-symbols` |

MCP and CLI adapters must call the same underlying operation and return the
same normalized JSON shape.

### 3.2 Request

The Arbiter-facing request is:

```json
{
  "task_id": "work-item-123",
  "worker_id": "worker-abc",
  "lease_epoch": 4,
  "path": "src/auth.ts",
  "language": "typescript"
}
```

`language` is optional only when extension detection is unambiguous. Callers do
not provide an arbitrary absolute worktree path.

### 3.3 Response

```json
{
  "ok": true,
  "path": "src/auth.ts",
  "language": "typescript",
  "symbols": [
    {
      "name": "authenticateUser",
      "kind": "function",
      "start": { "line": 4, "column": 0 },
      "end": { "line": 12, "column": 1 }
    }
  ]
}
```

Ranges use 1-based lines, 0-based columns, and end-exclusive end positions.
The implementation must document whether columns are byte or character
offsets as reported by the underlying Tree-sitter API and cover the decision
with a real fixture test. Symbol kinds are lowercase.

### 3.4 Supported source and limits

- TypeScript and Python are the first verified languages.
- Maximum file size is 1 MiB.
- Malformed source returns a structured parse error.
- Unsupported language returns a structured unsupported-language error.
- Parser or Waymark process failure is returned; no text-search fallback is
  permitted.

---

## 4. Invariants and Failure Boundaries

1. Discovery requires an active task, matching worker, and current lease epoch.
2. The resolved path must remain inside the claimed worktree, including
   symlink resolution.
3. Discovery never writes source, Git, SQLite, lease, or trajectory state.
4. A stale worker cannot read through a newer lease.
5. Parser failure cannot silently become a text-search success.
6. Waymark and Arbiter must not maintain separate AST parser implementations.
7. The existing Arbiter runtime dependency boundary remains unchanged.

Invalid identity, path, language, file size, or parser state returns a
structured error and leaves ownership state untouched.

---

## 5. Benchmark and Latency Semantics

The v2.3.0 benchmark adds exactly one real scenario after implementation. It
records measured duration and token data; it does not invent or copy metrics.

The baseline latency budget is a regression target used to compare measured
behavior across a locked environment. It is not a product SLA. If discovery
exceeds the budget, the result is recorded as over budget and investigated; the
release gate is not weakened merely to make the result pass.

---

## 6. Release Dependency Order

If Waymark's public API changes, the intended order is:

1. Waymark `1.8.0` for the additive structured API;
2. Arbiter `2.3.0` for the lease-checked bridge;
3. `arbiter-live-benchmark` `2.3.0` for the real scenario and baseline.

If Waymark's existing public contract can be used without a Waymark change,
skip the Waymark release. A Waymark `2.0.0` bump is not required for an
additive operation and is only appropriate for an intentional breaking change.
No release is authorized until local gates, CI, remote verification, and clean
`main` states are confirmed.
