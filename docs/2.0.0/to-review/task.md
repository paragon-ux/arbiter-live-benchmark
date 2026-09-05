# v2.0.0 Pre-Acceptance Remediation & Live Hardening Tasks

## P1 — Must-Fix (Blocking)

- [x] **1. Relabel Scenario 014** — renamed from "Disk-Full (ENOSPC) Fault Recovery" to "SQLite Transaction Rollback Recovery"; updated `deterministic.ts` comments and details, scenario JSON `014-disk-full-recovery.json`, README, BENCHMARK_AUTHORING.md
- [x] **2. Label Scenario 015 Docker fallback** — added `measurementSource: "CALIBRATED_REFERENCE"` vs `"LIVE_MEASUREMENT"` to output details in `deterministic.ts` and `types.ts`
- [x] **3. Fix Rationale.MD Tier 1 description** — removed "pre-recorded fixtures", "sub-5ms", updated to "Live Arbiter Engine" with real Git operations and 22 scenarios
- [x] **4. Fix BENCHMARK_AUTHORING.md Tier 1 description** — updated Tier 1 to "Live Arbiter Engine", replaced PRNG byte-identical rule with Determinism & Reproducibility Rules

## P2 — High Priority

- [x] **5. Add CHANGELOG.md v2.0.0 entry** — documented native kernel fix, 50-worker uncapping, SLA adjustments, performance improvements (-64.5% on 009, -24.4% on 017, -31% suite)
- [x] **6. Update README results table** — replaced stale pre-fix numbers with BASELINE_v2.0.0.json measured values (~105s total, compiled BPE token counts)

## P3 — Polish

- [x] **7. Reconcile H1-H16 hypothesis labels** — aligned between Rationale.MD and BENCHMARK_AUTHORING.md
- [x] **8. Fix Scenario 012 detail label** — added `interruptType: 'MERGE_CONFLICT_ABORT'` alongside backwards-compatible `signalCaught: 'SIGTERM'` in `deterministic.ts` and `types.ts`

## TikToken BPE Integration & Live Token Hardening (Zero Synthetic Tokens)

- [x] **9. Promote `@dqbd/tiktoken` to Production Dependency** — moved to `dependencies` in `package.json` with user authorization.
- [x] **10. Update Public Hygiene Check** — whitelisted `@dqbd/tiktoken` in `scripts/public-check.mjs`.
- [x] **11. Implement Compiled `cl100k_base` BPE in `tokens.ts`** — singleton WASM encoder instance, 0.00% divergence across all target files.
- [x] **12. Replace Static Token Mock Allocations** — scenarios 001, 002, 004, 008, 009, 013, 015, 016, 017, 018, 019, 020, 021 and `subprocessMcp.ts` now compute tokens dynamically from live ASTs, code, diffs, JSON-RPC payloads, and serialized trajectories.
- [x] **13. Recalibrate Reference Baseline** — updated `BASELINE_v2.0.0.json` with authentic compiled BPE measurements.
- [x] **14. Update QUICK_START_AUTHORING.md** — replaced hardcoded `collector.addTokens(1200)` with live token measurement patterns.

## Live Scenario Hardening (Zero Synthetic Primitives)

- [x] **15. ProcessPoolAdapter Live Git Contention** — replaced hardcoded contention count with live parallel Git commits to shared working tree capturing `.git/index.lock` collisions.
- [x] **16. Scenario 001 Live Disk Measurement** — reads actual files on disk from `targets/microservice-auth` and calculates tokens dynamically.
- [x] **17. Scenario 002 Live Waymark Trajectory** — provisions real `WaymarkSupervisor` and computes tokens live.
- [x] **18. Scenario 003 Live Working Tree Inspection** — performs live git status/diff inspection on clobbered working copy.
- [x] **19. Scenarios 005, 007, 010, 011, 014, 022 Live On-Disk SQLite WAL** — executes transactions, topological sorts, CAS races, and watchdog lease reclaims on genuine on-disk SQLite databases in temp directories.
- [x] **20. Scenario 015 Live Host OS Isolation Measurement** — replaced heavy PowerShell spawns with fast `where.exe docker` and Node's deterministic `process.execPath`.
- [x] **21. Scenario 018 Live Monorepo Parsing** — dynamically writes monorepo package manifests to disk and parses dependency DAGs live.

## Full Pipeline Verification (`npm run verify`)

- [x] **22. TypeScript Build** — `npm run build` exits 0.
- [x] **23. Unit & Integration Test Suite** — all 44/44 tests pass across 8 test suites (`npm test`).
- [x] **24. Zero-Dependency & Hygiene Check** — `npm run public-check` confirms 92/92 files clean.
- [x] **25. Full Live Benchmark** — `npm run benchmark` executes all 22 scenarios live in ~105s.
- [x] **26. Regression Comparator** — `npm run compare` reports 0 regressions against `BASELINE_v2.0.0.json`.
