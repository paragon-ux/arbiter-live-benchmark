# Scientific Methodology & Independent Reviewer FAQ: Multi-Agent Orchestration, Subprocess Isolation, and Cloud API Boundaries

**Version:** 2.1.1  
**Target Repository:** `arbiter-live-benchmark`  
**Audience:** Independent reviewers, distributed systems researchers, benchmark auditors, and agent harness developers.

---

## Table of Contents

1. [Executive Summary & Purpose](#1-executive-summary--purpose)
2. [What the Benchmark Actually Measures](#2-what-the-benchmark-actually-measures)
3. [The Zero-Simulation Mandate: Why OS Child Processes Satisfy the Goal](#3-the-zero-simulation-mandate-why-os-child-processes-satisfy-the-goal)
4. [What "API" Means in This Context](#4-what-api-means-in-this-context)
5. [Why Default Cloud LLM API Calls Degrade an Orchestration Benchmark](#5-why-default-cloud-llm-api-calls-degrade-an-orchestration-benchmark)
   - [5.1 The Signal-to-Noise Ratio (The Millisecond vs. Second Mismatch)](#51-the-signal-to-noise-ratio-the-millisecond-vs-second-mismatch)
   - [5.2 Why Statistical Averages Cannot Fix Cloud Jitter](#52-why-statistical-averages-cannot-fix-cloud-jitter)
   - [5.3 Rate Limiting, Quota Cliffs, and Flakiness Cascades](#53-rate-limiting-quota-cliffs-and-flakiness-cascades)
   - [5.4 Financial Cost and Multi-Platform CI Infeasibility](#54-financial-cost-and-multi-platform-ci-infeasibility)
   - [5.5 Model Non-Determinism vs. Deterministic Isolation](#55-model-non-determinism-vs-deterministic-isolation)
6. [How Token Accounting and Accuracy Are Guaranteed True to Life](#6-how-token-accounting-and-accuracy-are-guaranteed-true-to-life)
   - [6.1 Real Compiled BPE Tokenization (cl100k_base)](#61-real-compiled-bpe-tokenization-cl100k_base)
   - [6.2 Mathematical Token Conservation via Waymark](#62-mathematical-token-conservation-via-waymark)
   - [6.3 Real Compilers and Native Test Runners](#63-real-compilers-and-native-test-runners)
7. [The Multi-Tier Compromise: Deterministic CI + Bring-Your-Own-API-Key Reviewer Mode](#7-the-multi-tier-compromise-deterministic-ci--bring-your-own-api-key-reviewer-mode)
8. [Step-by-Step Independent Reviewer Verification Guide](#8-step-by-step-independent-reviewer-verification-guide)
9. [Frequently Asked Questions (Reviewer Q&A Matrix)](#9-frequently-asked-questions-reviewer-qa-matrix)

---

## 1. Executive Summary & Purpose

A fundamental question arises when evaluating autonomous multi-agent coding harnesses: **How do we rigorously benchmark coordination, workspace isolation, and conflict resolution without contaminating the benchmark with external cloud latency, rate-limiting noise, or prohibitive operational costs?**

Skeptical independent reviewers often ask:
- *"Does spawning OS child processes violate the benchmark? Shouldn't the benchmark call an external LLM API?"*
- *"Are these benchmarks misleading if they don't invoke frontier models like Gemini or Claude on every run?"*
- *"Can statistical averaging across trials eliminate external cloud network noise?"*
- *"How can an independent auditor verify the findings using their own live API keys?"*

This document provides a formal, scientific answer to these objections. It explains the system boundary between **workspace orchestration** and **LLM inference**, details why OS child processes using Model Context Protocol (MCP) stdio represent the exact production interface of autonomous coding agents, and outlines our multi-tier evaluation framework—including instructions for reviewers to verify the suite using their own cloud LLM credentials.

---

## 2. What the Benchmark Actually Measures

To evaluate Arbiter's benchmark methodology, one must distinguish between two distinct layers in the modern AI engineering stack:

```
+-----------------------------------------------------------------------------+
|                     Layer 2: Cognitive Reasoning Layer                      |
| (LLM Model: Gemini, Claude, GPT, DeepSeek — Prompt reasoning, code synthesis)|
+-----------------------------------------------------------------------------+
                                      |
                     JSON-RPC 2.0 stdio / CLI Tool Calls
                                      |
+-----------------------------------------------------------------------------+
|               Layer 1: Orchestration & Concurrency Layer                    |
| (Arbiter: Ephemeral Git Worktrees, SQLite WAL Locks, DAG Scheduler, Watchdog)|
+-----------------------------------------------------------------------------+
                                      |
                        Kernel Syscalls & Disk I/O
                                      |
+-----------------------------------------------------------------------------+
|                     Layer 0: Operating System & Git                         |
| (Linux / macOS / Windows VFS, .git/index.lock, Process Signals, Child PIDs) |
+-----------------------------------------------------------------------------+
```

Arbiter is **not** an LLM model leaderboard (such as SWE-bench, HumanEval, or Chatbot Arena). It does not grade whether an LLM understands dynamic programming or writes idiomatic CSS. 

Arbiter is an **orchestration engine, lock manager, and filesystem supervisor**. The core scientific questions `arbiter-live-benchmark` tests are:
1. **Workspace Isolation**: Can 3, 10, or 50 parallel agents write to the same repository concurrently without corrupting `.git/index.lock` or clobbering each other's uncommitted edits?
2. **Deterministic Scheduling**: Does a 12-task directed acyclic graph (DAG) resolve dependencies in correct topological order with sub-millisecond dispatch?
3. **Fail-Closed Merge Quarantine**: When concurrent agent branches contain conflicting edits, does the merge supervisor detect the conflict, quarantine the failing branch, and maintain a pristine `main` branch?
4. **Crash Resilience**: When an agent process crashes (SIGKILL, SIGTERM, OOM), does the zero-daemon watchdog detect the dead PID via OS kernel probes and reclaim the task lease?
5. **Context Continuity**: When context compaction occurs, how many tokens must an agent ingest to resume execution using Waymark in-flight trajectories versus cold workspace scanning?

These are **distributed systems problems** governed by OS file descriptors, kernel process tables, SQLite WAL concurrency, and Git object databases.

---

## 3. The Zero-Simulation Mandate: Why OS Child Processes Satisfy the Goal

The benchmark operates under an uncompromising architectural principle: **Zero in-process simulation.**

### What In-Process Simulation Looked Like (and Why It Was Abolished)
In legacy synthetic benchmarks, agent concurrency was simulated using JavaScript asynchronous loops (`Promise.all` or `for` loops in a single Node.js process). Worker crashes were simulated with boolean flags (`isDead = true`), and Git merges were simulated with string concatenation. 

Such simulations are fundamentally flawed:
- A single process shares memory, eliminating true data races.
- Node.js event-loop concurrency does not experience operating system thread preemption, page faults, or multi-process `.git/index.lock` contention.
- Simulated crashes do not test whether an operating system actually releases file locks or how a supervisor inspects `/proc` or `GetProcessId`.

### Why OS Child Processes Are the True Architectural Standard
In `arbiter-live-benchmark`, every worker executes as an **independent operating system child process** (`child_process.spawn`) with:
- Its own discrete **Operating System PID**.
- An isolated **virtual memory address space**.
- Dedicated **stdio file descriptors** (`stdin`, `stdout`, `stderr`).
- Independent **Git worktree directories** on the physical filesystem.

```
+-----------------------------------------------------------------------+
| Arbiter Supervisor (PID 10120)                                         |
| -> SQLite WAL Transaction Engine (arbiter.db)                         |
| -> WorktreeManager (/tmp/arbiter-bench-...)                            |
+-------------------+--------------------+-------------------+----------+
                    |                    |                   |
            child_process.spawn  child_process.spawn child_process.spawn
                    |                    |                   |
                    v                    v                   v
            +---------------+    +---------------+   +---------------+
            | Worker 1      |    | Worker 2      |   | Worker 3      |
            | (PID 10121)   |    | (PID 10122)   |   | (PID 10123)   |
            | Worktree:     |    | Worktree:     |   | Worktree:     |
            | .arbiter/     |    | .arbiter/     |   | .arbiter/     |
            |   worktrees/  |    |   worktrees/  |   |   worktrees/  |
            |   task-1      |    |   task-2      |   |   task-3      |
            +---------------+    +---------------+   +---------------+
```

When Worker 1 commits code, Worker 2 attempts an atomic CAS lease, and Worker 3 crashes from a `SIGKILL` signal, the operating system kernel enforces the memory barriers, file locks, and process state transitions. **This is zero-simulation distributed systems testing.**

---

## 4. What "API" Means in This Context

A common misconception is that "using an API" strictly means sending an HTTP `POST` request over the Internet to an external cloud vendor.

In modern agentic architectures, autonomous coding agents (such as Antigravity, Cursor, and Claude Code) communicate with local developer tools and orchestrators through:
1. **Model Context Protocol (MCP)**: An open standard utilizing JSON-RPC 2.0 messages framed over bidirectional `stdio` streams.
2. **CLI Executables**: Discrete commands (`arbiter claim-task`, `waymark note`) invoked with structured JSON or flag parameters.

The worker subprocesses in `arbiter-live-benchmark` communicate with Arbiter through this **exact protocol**:

```json
--> {"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"arbiter_claim_task","arguments":{"workerId":"worker-live-1"}}}
<-- {"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"{\"claimed\":true,\"taskId\":\"task-1\",\"branch\":\"arbiter/task-1\"}"}]}}
```

The subprocesses do not call mocked internal JavaScript functions. They serialize JSON-RPC messages into `stdin` and parse JSON-RPC responses from `stdout`. **This is the identical IPC protocol boundary used in production agent deployments.**

---

## 5. Why Default Cloud LLM API Calls Degrade an Orchestration Benchmark

Could the benchmark invoke an external cloud LLM API (such as Google Gemini, Anthropic Claude, or OpenAI GPT) inside every worker subprocess by default in CI? 

Yes, but doing so as the primary evaluation harness would **fundamentally invalidate the benchmark's scientific rigor**. Here is why:

### 5.1 The Signal-to-Noise Ratio (The Millisecond vs. Second Mismatch)

Arbiter's core orchestration operations occur at microsecond and millisecond scales:
- Ephemeral Git worktree provisioning: **2ms to 25ms**
- SQLite WAL atomic Compare-and-Swap (CAS) lease claim: **0.8ms to 3ms**
- Topological DAG dependency dispatch: **0.2ms to 1.5ms**
- Merge conflict detection and clean rollback: **8ms to 30ms**
- Zero-daemon process inspection (`kill(pid, 0)`): **0.05ms**

In contrast, external cloud LLM HTTP round-trips operate at human-scale latencies:
- Public Internet TCP/TLS handshake: **50ms to 200ms**
- Cloud edge routing & gateway queuing: **100ms to 500ms**
- Time-to-First-Token (TTFT) and decode stream: **400ms to 3,000ms**
- Total API turnaround per turn: **800ms to 4,000ms**

```
Arbiter Coordination Latency:
[██] 5ms (Local Kernel / SQLite / Worktree)

Cloud API Network Latency:
[████████████████████████████████████████████████████████████████████████] 1,500ms
```

**The external cloud latency is 100x to 1,000x greater than the local orchestration latency.** 

If a performance regression occurs in Arbiter (for example, an indexing bug that doubles SQLite WAL lock acquisition from 2ms to 4ms), that regression is completely undetectable when buried inside a 1,500ms ± 400ms external network transaction. The network jitter drowns out the orchestration signal.

### 5.2 Why Statistical Averages Cannot Fix Cloud Jitter

An initial intuition might be: *"Isn't that what multi-trial averaging is for? Can't 10 or 30 trials smooth out the network noise?"*

In statistics, the Central Limit Theorem and noise cancellation through averaging rely on a key premise: **the noise must be independent, zero-mean Gaussian white noise**. 

Cloud network latency and LLM inference do not follow a Gaussian distribution:
1. **Heavy-Tailed, Multimodal Distributions**: Cloud latencies exhibit massive positive skew (P99 spikes) caused by data center cache misses, cold worker spins, and TCP retransmits.
2. **Correlated Queuing Delays**: When 10 concurrent workers hit a cloud API simultaneously, requests do not experience independent latency. They queue behind one another on the same ingress gateway, producing correlated latency inflation.
3. **Statistical Resolution Limits**: If the noise standard deviation ($\sigma$) is 300ms, the standard error of the mean over $N=10$ trials is:
   $$\text{SE} = \frac{\sigma}{\sqrt{N}} = \frac{300}{\sqrt{10}} \approx 94.87\text{ms}$$
   A 95% confidence interval has a margin of error of $\pm 186\text{ms}$. **It is mathematically impossible to measure a 5ms local lock contention regression inside a $\pm 186\text{ms}$ confidence band.**

### 5.3 Rate Limiting, Quota Cliffs, and Flakiness Cascades

High-concurrency scenarios in the benchmark stress swarm coordination:
- Scenario `009-parallel-10-workers`: 10 concurrent workers.
- Scenario `017-parallel-50-workers`: 50 concurrent workers.
- Scenario `011-concurrent-lease-collision`: High-contention races on a single task lease.

If 50 live subprocesses simultaneously query a cloud LLM:
- They immediately saturate public API rate limits (Requests Per Minute / Tokens Per Minute).
- Providers respond with **HTTP 429 (Too Many Requests)** or drop connections.
- A rate limit is not a continuous latency curve; it is a discrete cliff. When worker 14 gets an HTTP 429, the scenario crashes.

The benchmark would report a **FAIL**, yet Arbiter's worktree manager and SQLite lock engine performed flawlessly. The failure was a false positive introduced entirely by external cloud quotas.

### 5.4 Financial Cost and Multi-Platform CI Infeasibility

The Arbiter CI pipeline tests across three operating systems on every commit and pull request:
- **Ubuntu Linux** (`ubuntu-latest`)
- **macOS** (`macos-latest`)
- **Windows** (`windows-latest`)

Running all 22 scenarios across a 3-OS matrix with 5 to 10 statistical trials would generate thousands of live LLM inference calls per CI run. This would:
- Incur hundreds of dollars per day in external token costs.
- Increase CI pipeline runtimes from **~2 minutes** to **over 45 minutes**.
- Require storing sensitive cloud API secrets across open-source CI runner environments, creating security and hygiene vulnerabilities.

### 5.5 Model Non-Determinism vs. Deterministic Isolation

Arbiter benchmarks verify deterministic safety invariants:
- *Did `main` remain pristine?*
- *Did exactly one worker win the lease?*
- *Did the conflict quarantine detect the syntax collision?*

If a live cloud LLM is prompted to "fix a function," its output varies with temperature, model quantization, and server-side weight updates. If the model hallucinates a typo on Trial 4, the test fails because the LLM failed to write code, not because Arbiter failed to isolate the worktree. Coupling infrastructure validation to model reasoning stochasticity violates test isolation.

---

## 6. How Token Accounting and Accuracy Are Guaranteed True to Life

A crucial reviewer question remains: *"If workers don't call a cloud API on every CI run, how do we know the token counts, code diffs, and accuracy numbers reflect reality?"*

The answer lies in **empirical, non-synthetic execution**:

### 6.1 Real Compiled BPE Tokenization (cl100k_base)
Arbiter Live Benchmark does not use rough character estimates (e.g. `chars / 4`) or hardcoded constants. It integrates compiled Byte-Pair Encoding (`cl100k_base` BPE via `@dqbd/tiktoken`):
- Every JSON-RPC request and response payload is tokenized.
- Every source file read, AST segment, and git diff is tokenized.
- Token counts are dynamically evaluated against real file buffers at execution time.

| Target Source File | Byte Size | Compiled BPE Tokens (`cl100k_base`) | Empirical Ratio | TikToken Divergence |
| :--- | :--- | :--- | :--- | :--- |
| `targets/microservice-auth/src/audit.ts` | 552 B | 135 | 4.09 chars/token | **0.00%** |
| `targets/microservice-auth/src/auth.ts` | 2,147 B | 518 | 4.14 chars/token | **0.00%** |
| `targets/microservice-auth/src/crypto.ts` | 670 B | 154 | 4.35 chars/token | **0.00%** |
| `targets/microservice-auth/src/session.ts` | 1,171 B | 281 | 4.17 chars/token | **0.00%** |
| `targets/data-pipeline/src/pipeline.ts` | 1,035 B | 226 | 4.58 chars/token | **0.00%** |

Independent auditors can run the calibration suite locally at any time:
```bash
npm run calibrate
```

#### Historical Discrepancy Note & Ratio Reconciliation
An astute reviewer comparing repository files might notice apparent discrepancies in earlier documents:
1. **The Archived v1.2.0 Audit Number (244 vs. 135 tokens)**: The sealed historical document `docs/1.2.0/FINAL_VERIFICATION_AUDIT_v1.2.0.md` reported `audit.ts` (552 bytes) as 244 tokens. That figure stemmed from an early regex-based character heuristic prior to the introduction of compiled Byte-Pair Encoding in v2.1.0. When compiled `@dqbd/tiktoken` was integrated directly into `src/harness/tokens.ts`, running live BPE against `audit.ts` produced the true, reproducible measurement: **135 tokens** ($552 / 135 = 4.09\text{ chars/token}$). The obsolete v1.2.0 audit document is preserved strictly as an immutable historical record in `docs/1.2.0/`.
2. **The 3.80 vs. 4.20 Ratio**: The standard literature rule of thumb for English code tokenization is approximately 3.8 chars/token, which was historically used as an uncalibrated default fallback parameter. Across all 15 source files in Arbiter's benchmark targets (11,137 total characters), compiled `cl100k_base` BPE yields **2,649 tokens**, producing an empirical aggregate ratio of **4.20 chars/token** ($11,137 / 2,649$).

### 6.2 Mathematical Token Conservation via Waymark
The token conservation demonstrated by Waymark (>75% reduction, e.g. 744 tokens vs. 3,045+ tokens) is a **mathematical property of the ingested context**:
- When an agent experiences context compaction without Waymark, it must re-read repository directory trees, file structures, and whole modules to re-anchor its position (consuming 3,000 to 14,000+ tokens).
- With Waymark, the agent receives a compact, structured trajectory recording verified AST line spans and causal breadcrumbs (consuming <750 tokens, and <30 tokens in multi-compaction loops).

Because a cloud LLM is billed strictly on the prompt tokens sent to its context window, **the token savings measured by Arbiter's compiled BPE tokenizer are identical to what you would be billed on Gemini, Claude, or GPT.**

### 6.3 Real Compilers and Native Test Runners
Accuracy metrics in the benchmark are **never hardcoded or mocked**:
1. When a worker applies a code change to `src/audit.ts` or `src/pipeline.ts`, it executes the real TypeScript compiler (`tsc`) directly in its isolated worktree. If the change introduces a type mismatch, `tsc` exits with an error and the benchmark records a type error.
2. The worker executes the real Node.js test runner (`node --test`) against real test suites (`test/auth.test.ts`, `test/pipeline.test.ts`).
3. The scenario accuracy percentage is computed from actual test assertions:
   $$\text{Accuracy} = \frac{\text{Unit Tests Passed}}{\text{Unit Tests Total}} \times 100$$
   A 100% accuracy score means every TypeScript diagnostic passed and every unit test assertion executed green in the live child process.

---

## 7. The Multi-Tier Compromise: Deterministic CI + Bring-Your-Own-API-Key Reviewer Mode

To provide both continuous integration determinism and real-world LLM verification, Arbiter adopts a **Multi-Tier Execution Architecture**:

```
+-------------------------------------------------------------------------------+
|                       Arbiter Live Benchmark Harness                          |
+---------------------------------------+---------------------------------------+
                                        |
         +------------------------------+------------------------------+
         |                                                             |
         v                                                             v
+-----------------------------------------------+   +-----------------------------------------------+
| Tier 1 / 1.5: Deterministic Subprocess Tier   |   | Tier 2: Live Agent / BYO API Key Tier        |
| (Default CI & Automated Regression Standard)  |   | (Independent Reviewer & Live LLM Verification)|
+-----------------------------------------------+   +-----------------------------------------------+
| • Real OS child processes (spawned PIDs)      |   | • Spawns live coding agents (e.g. Antigravity |
| • Real stdio MCP JSON-RPC protocol boundary   |   |   CLI `agy` or custom LLM harness)            |
| • Real Git worktrees & SQLite WAL transactions |   | • Reviewer provides their own API keys        |
| • Real TypeScript compiler & node --test runs |   | • Executes full LLM generation & reasoning    |
| • Real compiled BPE TikToken calculations     |   | • Observes live agents in isolated worktrees  |
| • $0 API cost, zero secret tokens required    |   | • Validates end-to-end integration            |
| • 100% reproducible across Linux, Mac, Windows|   | • Proves live models respect 1:1:1 invariant  |
+-----------------------------------------------+   +-----------------------------------------------+
                                        |
                                        v
+-------------------------------------------------------------------------------+
| Tier 3: Comparative Baselines (Docker vs. Naive Mutex vs. Process Pool)       |
+-------------------------------------------------------------------------------+
```

### The Roles of Each Tier
- **Tier 1 & Tier 1.5 (Deterministic Subprocess Engine)**: The authoritative standard for CI, regression testing, and mathematical isolation verification. It eliminates network jitter, prevents quota failures, guarantees multi-platform repeatability, and costs $0.
- **Tier 2 (Bring-Your-Own-API-Key / Live Agent Mode)**: The interactive verification tool for skeptical reviewers. Reviewers who wish to see live LLMs (Gemini, Claude, GPT) generating code under Arbiter can supply their API credentials and run live agent swarms across isolated worktrees.
- **Tier 3 (Comparative Baselines)**: Benchmarks Arbiter's ephemeral worktrees against Docker container isolation, shared file mutexes, and non-isolated process pools.

---

## 8. Step-by-Step Independent Reviewer Verification Guide

Independent reviewers can audit and reproduce every benchmark claim on their own hardware.

### Step 1: Clone Sibling Repositories and Run Full Verification

Arbiter Live Benchmark evaluates the local Arbiter orchestration engine. To reproduce the benchmark from source on fresh hardware, check out `Arbiter` and `arbiter-live-benchmark` as sibling directories:

```bash
# 1. Clone both repositories side-by-side
git clone https://github.com/paragon-ux/Arbiter.git
git clone https://github.com/paragon-ux/arbiter-live-benchmark.git

# (Optional: Clone Waymark if validating live CLI resolution)
git clone https://github.com/paragon-ux/waymark.git

# 2. Build the Arbiter orchestrator dependency
cd Arbiter
npm install
npm run build

# (Optional: Build Waymark if cloned)
cd ../waymark
npm install
npm run build

# 3. Install and run full verification in arbiter-live-benchmark
cd ../arbiter-live-benchmark
npm install
npm run verify
```
`npm run verify` executes the full suite of 40 unit and integration tests across 9 test suites, validates scenario schemas, checks doc consistency, verifies token calibration, and runs the public hygiene checker.

### Step 2: Run All 22 Scenarios in Live Subprocess Mode
```bash
npm run benchmark
```
This executes all 22 scenarios, spawning real OS child processes, creating real Git worktrees, executing SQLite WAL transactions, and compiling code.

### Step 3: Run Multi-Trial Statistical Verification
To verify that timings are statistically stable across repeated runs:
```bash
node dist/src/cli/index.js --all --trials 5 --verbose
```
This computes Median, P95, and Standard Deviation across 5 iterations for all 22 scenarios.

### Step 4: Run Tier 2 with a Live Agent Harness (Reviewer Mode)
Reviewers can execute live LLM agents across isolated worktrees using the Antigravity CLI (`agy`) or custom runner:
```bash
# Execute semantic correctness scenario with a live LLM agent
node dist/src/cli/index.js --scenario 008-agent-semantic-correctness --mode agy
```
In this mode, Arbiter provisions the worktree, acquires the lease, launches the live LLM agent, monitors the agent's PID, and merges the resulting branch upon test completion.

#### Authoritative Live Verification Receipt (v2.1.1)
The following execution receipt was generated on live hardware executing Google Gemini via `agy`:

| Metric | Measured Live Result | Verification Detail |
| :--- | :--- | :--- |
| **Model Provider** | Google Gemini (via Antigravity CLI) | Real cloud model inference; zero simulation |
| **Execution Mode** | `--mode agy` (Tier 2) | Isolated Git worktree checkout |
| **Scenario** | `008-agent-semantic-correctness` | Real TypeScript refactoring and test pass |
| **Execution Duration** | **39.1s** | Includes network roundtrips, compilation, and git merge |
| **Tokens (API Reported)** | **47,928** total (46,900 input, 1,028 output) | Reported directly by the Gemini API response |
| **TypeScript Compilation** | **0 errors** | Clean `tsc` compilation in isolated worktree |
| **Unit Test Assertions** | **100% pass** (1/1 suites) | Real Node.js test runner (`node --test`) |
| **Merge Safety** | **`mainBranchValid: true`** | Clean merge into `main` via `MergeQueue` |

The structured execution log is persisted at `results/latest-agy.json`. If `agy` is not available in `PATH`, the harness fails fast with an explicit error (`[AGY_NOT_AVAILABLE]`) to guarantee zero silent degradation.

### Step 5: Verify Token Calibration Independently
```bash
npm run calibrate
```
Inspect the output to confirm 0.00% divergence against compiled `cl100k_base` BPE tokenization.

---

## 9. Frequently Asked Questions (Reviewer Q&A Matrix)

### Q1: "How do I know Arbiter isn't faking Git worktree creation?"
**A:** You can verify it directly on disk during execution. Run the benchmark with `--verbose`, or set a breakpoint. In your temporary directory (`/tmp` or `%TEMP%`), Arbiter creates physical worktree checkouts at `.arbiter/worktrees/<task-id>`. Run `git -C <path> worktree list` to see Git's official registration of every active worktree. When a task completes or fails, Arbiter calls `git worktree remove --force` and deletes the branch.

### Q2: "What happens if a worker process crashes mid-task?"
**A:** Scenario `007-watchdog-dead-worker` tests this explicitly. A worker subprocess claims a task, acquires an exclusive lease in SQLite, and is immediately terminated with an uncatchable `SIGKILL`. Arbiter's `LeaseWatchdog` executes a kernel process check (`kill(pid, 0)`). Detecting that the PID no longer exists in the OS process table, it reclaims the lease, resets the task status to `READY`, and frees the worktree.

### Q3: "Why does Arbiter use SQLite in WAL mode instead of Redis or Postgres?"
**A:** Arbiter is designed for **local-first autonomous agent swarms**. It requires zero external daemon processes, zero Docker containers, and zero background network services. SQLite in Write-Ahead Logging (`WAL`) mode allows multiple concurrent OS processes to read simultaneously while serializing atomic Compare-and-Swap (CAS) writes in microseconds.

### Q4: "How does Arbiter prevent `.git/index.lock` collisions with 10 or 50 workers?"
**A:** Git stores staging index locks at `.git/index.lock`. If two agents run `git add` in the same directory, the second agent crashes with `fatal: Unable to create '.git/index.lock': File exists`. Arbiter eliminates this by giving every worker its own dedicated Git worktree (`git worktree add`). Each worktree possesses its own private index file (`.git/worktrees/<name>/index`), allowing 50 workers to stage and commit in parallel without locking collisions.

### Q5: "Why standardise on `cl100k_base` BPE tokenization?"
**A:** `cl100k_base` (OpenAI TikToken) is the industry standard baseline for compiled Byte-Pair Encoding. Target calibration tests show that modern frontier tokenizers (including Anthropic Claude 3.5 and Google Gemini 2.0 Flash) track within a 6% to 15% range of `cl100k_base` on source code. Using compiled `@dqbd/tiktoken` ensures consistent, reproducible, zero-cost token metrics across all environments.

### Q6: "What is the fail-closed quarantine guarantee during merge conflicts?"
**A:** When multiple agent branches complete, Arbiter's `MergeQueue` serializes merges into `main`. If Worker B's branch conflicts with changes merged from Worker A, Arbiter:
1. Detects the merge conflict before touching the working copy.
2. Aborts the merge immediately (`git merge --abort`).
3. Marks the task status as `CONFLICT`.
4. Leaves `main` 100% clean and pristine.
5. Quarantines the branch so human operators or arbitration agents can inspect it without blocking the rest of the queue.

### Q7: "Why does the benchmark publish both Deterministic Subprocess (Tier 1.5) and Live Gemini (Tier 2) reports?"
**A:** This dual-harness design enforces the scientific separation between **infrastructure benchmarking** and **frontier model verification**:
1. **Tier 1.5 (Deterministic Subprocess)** is the authoritative engineering baseline for continuous integration. It runs real OS child processes, real Git commands, and real SQLite locks, but uses deterministic payloads so automated regression gates run in ~105s with zero flakiness, zero cloud API costs, and zero dependence on external network connectivity.
2. **Tier 2 (Live Agent via `agy`)** is the authoritative proof for independent reviewers. It confirms that the exact same worktree isolation, lease management, and merge queue operate seamlessly with real, non-deterministic frontier LLMs (like Google Gemini) modifying code in real time.

---

*For further technical specifications, refer to [Rationale.MD](Rationale.MD) and [BENCHMARK_AUTHORING.md](BENCHMARK_AUTHORING.md).*
