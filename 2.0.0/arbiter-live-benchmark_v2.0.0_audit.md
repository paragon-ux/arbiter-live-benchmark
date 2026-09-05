# Audit: `paragon-ux/arbiter-live-benchmark` v2.0.0 vs. `paragon-ux/Arbiter` v2.0.0

**Scope:** Diagnose synthetic/mock benchmarking, and audit claims, dependencies, and feature coverage.
**Method note:** GitHub's robots.txt blocks automated access to `/tree/`, `/commits/`, and repo-search views, so this audit is built from every directly-fetchable file (root READMEs, all top-level docs, both `package.json`/lockfiles, the CI workflow, and the raw `BASELINE_v2.0.0.json` data file) rather than a line-by-line read of `src/`. Where a claim can't be checked from what's fetchable, that's stated explicitly rather than assumed. Sources are cited by filename throughout; a full source list is at the end.

---

## TL;DR

Both repos are genuinely at v2.0.0 as you said. They're real repositories (MIT-licensed, real CI matrices, real module structure) — this isn't a fabricated project. But the benchmark suite's own documentation contradicts its own marketing: the **default execution path that produces the headline README numbers is explicitly described elsewhere in the same repo as a seeded fixture-replay simulator**, not a live measurement engine, and the checked-in baseline data file contains at least one scenario (Docker overhead) that reports specific timing numbers **while its own record states the precondition for measuring them (a running Docker daemon) was absent**. Several headline figures also don't reconcile with each other release-to-release, or with the sister repo's own self-reported numbers for the same operations.

---

## 1. Repository facts

| | `arbiter-live-benchmark` | `Arbiter` |
|---|---|---|
| Declared version | 2.0.0 | 2.0.0 |
| Stars / Forks / Watchers | 0 / 0 / 0 | 0 / 0 / 0 |
| Commits (main) | 10 | 21 |
| License | MIT | MIT |
| Runtime npm dependencies | 1 (local `file:` path, see §5) | 0 |
| Description | "Live empirical multi-agent orchestration benchmark..." | "Local-first multi-agent task orchestrator..." |

Both repos belong to the same account (`paragon-ux`), which also maintains a similarly-styled project, `Reqtrace`, that uses the same rhetorical pattern seen here — "Verified," "FINAL_VERIFICATION_AUDIT," strict semantic-versioning discipline — across its release notes. That's not itself disqualifying, but it's useful context: this is a solo/small-scale toolchain whose "certified," "scientifically proven" language is **self-issued**, not third-party-audited.

---

## 2. Core finding: the "live" benchmark's default tier is a fixture-replay simulator

This is the central issue and it's directly demonstrable from the repo's own files, without needing source access.

### 2.1 The same tier is described two incompatible ways

| Document | What it says about Tier 1 / `DeterministicAdapter` |
|---|---|
| `README.md` | *"Tier 1: **Live** Arbiter Engine Execution (DeterministicAdapter)"* — "Executes **real** Arbiter WorktreeManager, TaskGraph, MergeQueue, LeaseWatchdog," "Provisions **real** ephemeral Git worktrees, feature branches, and SQLite WAL," "Measures **genuine** token consumption from realistic target codebases." |
| `Rationale.MD` | *"### Tier 1: Deterministic Simulator"* — "Seeded pseudo-random generator (Mulberry32 with seed `0x6D2B79F5`)." "**Pre-recorded tool call traces and AST mutation fixtures.**" "**Sub-5 millisecond execution time across all 18 scenarios.**" |
| `BENCHMARK_AUTHORING.md` | *"Tier 1 (Deterministic Simulator): **Seeded replay simulation with pre-recorded I/O fixtures** ($0 cost, sub-5ms)."* |

Same adapter, same tier number, same name in the code (`DeterministicAdapter`) — one document calls it live/real/genuine, the other two call it a seeded replay of pre-recorded fixtures. `npm run benchmark` (the command the README tells you to run) invokes the CLI with no `--mode` flag, which is this default tier.

### 2.2 The determinism rule proves the numbers aren't measured wall-clock time

`BENCHMARK_AUTHORING.md`'s PRNG rules for this tier:

> "Zero OS Entropy: Never use `Math.random()` or unseeded `crypto.randomBytes()`." / "**Byte-Identical Outputs**: 10 consecutive executions of any scenario in deterministic mode must yield byte-identical results."

Real `git worktree add`, real disk I/O, and real SQLite WAL commits do not produce byte-identical timings across ten runs on real hardware — OS scheduling jitter alone rules that out. A requirement for byte-identical repeated output is only satisfiable if the "Median Latency" figures are generated/looked-up values, not measured elapsed time.

### 2.3 The arithmetic doesn't close

Rationale.MD states Tier 1 runs in **"sub-5 millisecond execution time across all 18 scenarios."** But the README's own v2.0.0 table reports a **"Total Suite Duration: ~130–140s."** Summing the 22 individual "Median Latency" cells in that same table gives ≈125.3 seconds — i.e., the headline "Total Suite Duration" is approximately what you get by *adding up the displayed per-scenario numbers*, not an independent measurement, and it is roughly 30,000x larger than what the repo's own architecture document says this tier actually takes to run.

### 2.4 The smoking gun: `BASELINE_v2.0.0.json`

The checked-in "locked reference" file states its own provenance plainly:

```json
"timestamp": "2026-09-04T20:47:42.702Z",
"nodeVersion": "v22.19.0",
"platform": "win32 (x64)",
"tier": "deterministic",
"trials": 1,
```

Two things fall out of this:

- **`"trials": 1`** — every scenario's `trialHistory` array has exactly one entry. There is no repeated sampling behind the "Median Latency" column name; a median of one observation is just that observation, relabeled.
- **Scenario `015-docker-isolated-overhead`** records:
  ```json
  "details": {
    "dockerDaemonAvailable": false,
    "containerStartupLatencyMs": 350,
    "worktreeLatencyMs": 4.2,
    "overheadVsWorktrees": "83.3x slower startup"
  },
  "passed": true, "accuracyPercent": 98
  ```
  The scenario's own data says Docker wasn't running on the machine that produced this file — yet it reports a specific container-startup latency and an "83.3x slower" comparative verdict, and marks itself passed. You cannot measure a container's real startup time with no daemon present. This is the cleanest, most self-contained proof that at least this comparative baseline is a hardcoded/fixture value, not a live measurement — despite being one of the headline "Arbiter beats Docker by 50-80x" proof points repeated in the README and in `FINAL_VERIFICATION_AUDIT_v1.2.0.md`.

- **The baseline file's own numbers don't match the README's displayed table** for the same scenario IDs, despite both purportedly coming from the same byte-identical deterministic engine — e.g. scenario `004` is 2,054.64ms in the baseline JSON vs. ~3,935ms in the README table (~1.9x); `009` is 8,336.95ms vs. ~15,278ms (~1.8x); `008` is 692.29ms vs. ~1,455ms (~2.1x). Most scenarios run ~1.7–2.1x higher in the README than in the checked-in baseline; `015` runs the other direction (lower in the README); `017` is close. There's no single explanation available from the fetchable files for this drift, which is itself the point — a genuinely reproducible, byte-identical simulator shouldn't need one.

### 2.5 The authoring template shows metrics are author-declared, not derived

`QUICK_START_AUTHORING.md`'s copy-paste pattern for **new** scenarios (illustrative, but it's presented as *the* pattern used across the suite):

```ts
collector.addTokens(1200);
collector.setDetail('customMetric', true);
collector.setMainValidity(true);
collector.setAccuracy(100);
...
return { ..., passed: metrics.mainBranchValid, metrics };
```

Token counts, accuracy percentages, and pass/fail validity are set by calling `.add*()`/`.set*()` with a literal the scenario author picked, then echoed back out as the "result." Nothing in this template computes accuracy from an actual test run or tokens from actual AST parsing — a scenario author (human or agent) can report any numbers they want and the harness will present them as measured results.

### 2.6 The project's own documents admit mocks existed — and current docs still describe the same pattern

- `CHANGELOG.md`, v1.0.0: *"This release replaces synthetic and mock simulations with genuine live empirical multi-agent orchestration benchmarking..."*
- `FINAL_VERIFICATION_AUDIT_v1.2.0.md`: *"Every mock, synthetic placeholder, and potential blind spot from earlier prototype iterations has been completely replaced with genuine live-process operations..."*

Both are self-issued "we fixed it" statements (not third-party audits), and both explicitly invoke Jepsen, SWE-bench Verified, and SPEC/TPC by name as the rigor bar they claim to match — associations, not endorsements from those projects. Meanwhile the *current* authoring/rationale docs (§2.1–2.2) still describe the default tier in exactly the terms the changelog says were eliminated.

---

## 3. Version & documentation integrity

| Issue | Detail |
|---|---|
| **No 2.0.0 changelog entry** | `CHANGELOG.md` documents 1.0.0 → 1.1.0 → 1.2.0 only. The jump to 2.0.0 (current `package.json`, current README, current `BASELINE_v2.0.0.json`) has no changelog entry explaining what changed — including the swings noted in §2.4 and the table below. |
| **All three real entries share one date** | 1.0.0, 1.1.0, and 1.2.0 are each dated `2026-09-04` — the same calendar day. There's no elapsed-time trail consistent with iterative "tighten tolerances based on empirical data across releases" claims the changelog itself makes for 1.2.0. |
| **`FINAL_VERIFICATION_AUDIT` is stale** | The only detailed, sign-off-style audit in the repo (`FINAL_VERIFICATION_AUDIT_v1.2.0.md`) certifies v1.2.0. There is no equivalent document for the current v2.0.0 — the most rigorous-looking artifact in the repo doesn't cover the version you asked about. |
| **H1–H16 hypothesis tables disagree with each other** | `Rationale.MD`'s H1 = "In-Flight Continuity" (Waymark vs. cold re-read); `BENCHMARK_AUTHORING.md`'s H1 = "1:1:1 Invariant" (worktree isolation). Same labels, different claims, in two docs of the same repo. |
| **MCP tool count is off by one** | `Arbiter/README.md`'s architecture diagram says the MCP server exposes **"10 native tools"**; the capability table directly below it lists **11** (`arbiter_submit_task`, `_claim_task`, `_checkpoint`, `_complete_task`, `_fail_task`, `_recover_lock`, `_status`, `_process_merge_queue`, `_scan_leases`, `_prune_worktrees`, `_metrics`). |
| **Scenario-count text not updated** | `Rationale.MD` still says "Sub-5 millisecond execution time across all **18** scenarios," a holdover from before scenarios 019–022 were added in later releases. |

### Release-to-release drift on identical scenarios

| Scenario | v1.2.0 audit (median / SLA) | v2.0.0 README (median / SLA) | Change |
|---|---|---|---|
| `017-parallel-50-workers` | 14,772.1ms / 18,000ms | 87,824ms / 120,000ms | Latency **+495%** (5.95x slower); SLA widened **+567%** (6.67x) — the pass threshold was loosened by more than the latency grew, so it still shows PASS |
| `009-parallel-10-workers` | 15,135.1ms / 18,000ms | 15,278ms / 25,000ms | Latency flat (+0.9%); SLA widened +39% anyway |
| `015-docker-isolated-overhead` | 446.9ms / 1,200ms | 320ms / 650ms | Latency **improved** -28%; SLA tightened -46% (opposite direction from the two rows above) |
| `019-n-way-merge-conflicts` | 7,117.8ms / 8,500ms | 9,073ms / 12,000ms | Latency +27%; SLA +41% |

The `017` row is the standout: a scenario whose own comparative story is "worktrees are >50x faster than the alternative" moved nearly 6x slower between releases with no changelog explanation, while the threshold that determines PASS/FAIL was simultaneously loosened by almost the same factor.

---

## 4. Cross-repository claim conflicts

`Arbiter` ships its own self-benchmark (`scripts/benchmark.mjs`, run via `npm run benchmark` **inside the Arbiter repo** — a different script from anything in `arbiter-live-benchmark`) and quotes headline numbers directly in its own README tagline. Those numbers disagree substantially with `arbiter-live-benchmark`'s numbers for what are described as the same operations:

| Claim | `Arbiter/README.md`'s own number | `arbiter-live-benchmark`'s number | Delta |
|---|---|---|---|
| Ephemeral worktree provisioning | **~300ms** | 3.8–4.5ms (`FINAL_VERIFICATION_AUDIT` Table 2); `worktreeLatencyMs: 4.2` in `BASELINE_v2.0.0.json` | ~70–80x |
| Dead-worker process detection | **~1ms** | Scenario 007 median: 84.7ms (README) / 87.43ms (baseline JSON) | ~85–87x |
| Conflicted-merge rollback | **<80ms** | Scenario 006 median: 2,471ms (README) / 1,368.51ms (baseline JSON) | ~17–31x |

These are two independently-scripted, same-author benchmarks nominally measuring the same underlying operations (worktree creation, PID-liveness detection, `git merge --abort` rollback) and they don't reconcile with each other by one or two orders of magnitude. At minimum this means the "empirically proven" language attached to either number set should be read with real caution — the two self-reports the ecosystem publishes about itself don't agree.

---

## 5. Dependency audit

**`arbiter-live-benchmark/package.json`:**
```json
"dependencies": { "arbiter": "file:../Arbiter" },
"devDependencies": {
  "@dqbd/tiktoken": "^1.0.22",
  "@types/node": "^22.15.0",
  "typescript": "^5.8.3"
}
```
- The **only runtime "dependency" is a local filesystem path**, not a published/pinned package. It isn't version-locked to a specific Arbiter commit or tag — it resolves to whatever sits in the adjacent `../Arbiter` folder at install time, which undercuts the reproducibility story for anyone trying to pin an exact tested pairing.
- `@dqbd/tiktoken` is a real, legitimate, published package (used only by `scripts/calibrate-tokens.mjs`, the token-calibration check — not by the scenario runner itself).
- **No dependency on `Waymark`** — the separate repo that actually implements the in-flight continuity ledger the single most-quoted headline metric (">75% token reduction... via Waymark") is about. `arbiter-live-benchmark` never imports real Waymark code; it can only be simulating Waymark's behavior via its own fixtures (consistent with §2).

**`Arbiter/package.json`:**
```json
"dependencies": {},
"devDependencies": { "@types/node": "^22.15.0", "typescript": "^5.8.3" }
```
- Genuinely zero runtime dependencies, matching the "0 runtime npm dependencies" claim.
- The repo's own file listing includes a **`crates/arbiter-kernel`** directory — a Rust "crate," which is not mentioned anywhere in the README's architecture tree (which only shows `control/`, `src/{db,dag,worktrees,waymark,merge,dispatch,mcp,cli}/`, `test/`), not referenced in `package.json` (no `Cargo.toml`/build step wired into `npm run build`), and not exercised by any documented scenario. It's either dead/vestigial code or an undocumented component — either way it's a real, unexplained gap between what's in the repo and what the docs describe.
- The README's "External Specifications" table lists Model Context Protocol, Tree-sitter (WASM), and Node.js — all legitimate, canonical references — alongside **"Capn Hook / Memory Protocol"** (`github.com/CyrusNuevoDia/capn-hook`). I confirmed this is a real, active, independent open-source project (~15 GitHub stars as of a recent "new 2026" tools listing) — not fabricated — but it's a small, unaffiliated personal tool, not a formal "specification" in the sense the other three entries are, and there's no corresponding dependency anywhere in `package.json` tying it into the actual build.

---

## 6. Features the benchmark claims to cover vs. what's actually exercised

| Arbiter surface area | Benchmark coverage |
|---|---|
| `arbiter_claim_task`, `arbiter_complete_task` | Exercised generally (referenced across most scenario descriptions) |
| `arbiter_submit_task`, `arbiter_checkpoint`, `arbiter_fail_task`, `arbiter_recover_lock`, `arbiter_status`, `arbiter_process_merge_queue`, `arbiter_scan_leases`, `arbiter_prune_worktrees`, `arbiter_metrics` (9 of 11 documented MCP tools/CLI commands) | No scenario name or description in the 22-scenario taxonomy names these specifically as the thing under test. The one scenario that explicitly targets the MCP protocol surface (`021-mcp-protocol-resilience`) records `"toolCallsExecuted": 3` in the baseline JSON — three calls, not eleven tools' worth of behavior. |
| **Tier 2: "Live Agy Runner"** (real LLM agent via a local, external "Antigravity CLI") — described in both `README.md` and `Rationale.MD` as the tier that gives "genuine live LLM agent validation" | Requires a proprietary external CLI that isn't part of either repo and isn't a listed dependency. None of the published v2.0.0 results (the README table, `BASELINE_v2.0.0.json`) are tagged as coming from this tier — every result inspected is `"tier": "deterministic"`. The tier that would make the "live" framing literally true isn't what produced any number you can currently see. |
| **Tier 3 Docker comparative baseline** (`015-docker-isolated-overhead`) | Recorded with `dockerDaemonAvailable: false` (§2.4) — the comparison Arbiter is judged against wasn't actually run. |
| `crates/arbiter-kernel` | Not mentioned by any scenario, adapter, or doc. |

---

## 7. What does appear to hold up

To be fair to the project: the repo structure is coherent and not obviously fake. `Arbiter`'s module layout (`db/`, `dag/`, `worktrees/`, `waymark/`, `merge/`, `dispatch/`, `mcp/`, `cli/`) plausibly backs the classes the benchmark references (`WorktreeManager`, `TaskGraph`, `MergeQueue`, `LeaseWatchdog`, `WaymarkSupervisor`, `ArbiterDatabase`) — the two repos' vocabularies match. The `.github/workflows/verify.yml` I fetched directly is a real, sensibly-configured 3-OS × Node-22 matrix (not a stub), and `createTempGitRepo`/`WorktreeManager` calls shown in the authoring template imply at least some scenarios really do provision temp Git state rather than faking everything. The MIT licensing, `SECURITY.md`, and `CONTRIBUTING.md` are normal open-source hygiene. The critique here is specifically that **the headline, default-path numbers are dressed as live/genuine/empirical measurements when the project's own architecture docs describe that exact path as a seeded fixture replay** — not that nothing in either repo is real.

---

## 8. If you want to verify this yourself

1. Clone both repos locally (you'll have normal filesystem/git access I don't have through a browser-only fetch) and open `src/harness/adapters/deterministic.ts` in `arbiter-live-benchmark` directly — that file will settle definitively whether scenario timings are computed from real elapsed time or returned from fixtures.
2. Run `npm run benchmark -- --trials 10` twice in a row and diff the two JSON outputs byte-for-byte — this directly tests the "byte-identical... 10 consecutive executions" claim.
3. Start Docker, then re-run scenario `015` and compare against the checked-in `dockerDaemonAvailable: false` result.
4. Force Tier 1.5 (`--mode subprocess_mcp`) or Tier 2 for the full 22-scenario suite (not just scenario 008/021) and compare those numbers against the README's default-tier table.
5. Check `git log` timestamps locally for both repos — GitHub's robots.txt blocked my access to the commit history views, so I couldn't verify real elapsed time between v1.0.0/v1.1.0/v1.2.0/v2.0.0 beyond what's in `CHANGELOG.md`.

---

## Sources consulted

`arbiter-live-benchmark`: `README.md`, `package.json`, `BENCHMARK_AUTHORING.md`, `Rationale.MD`, `CHANGELOG.md`, `QUICK_START_AUTHORING.md`, `FINAL_VERIFICATION_AUDIT_v1.2.0.md`, `BASELINE_v2.0.0.json`
`Arbiter`: `README.md`, `package.json`, `.github/workflows/verify.yml`
External: `github.com/CyrusNuevoDia/capn-hook` (verification search)
