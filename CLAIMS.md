# Benchmark Quantitative Claims Registry

**Document Version:** 2.3.2-PROD
**Single Source of Truth for Benchmark & Performance Claims**

```json
[
  {
    "claim": "Waymark in-flight continuity token usage",
    "target": "waymark_tokens",
    "expectedValue": 750,
    "tolerancePercent": 25,
    "upperBoundOnly": true,
    "generatingCommand": "node -e \"const { execSync } = require('child_process'); const out = JSON.parse(execSync('node --no-warnings dist/src/cli/index.js --scenario 002-single-agent-waymark --json', { encoding: 'utf8' })); process.stdout.write(String(out.results[0].metrics.tokensTotal));\"",
    "lastVerifiedDate": "2026-09-05"
  },
  {
    "claim": "Cold exploration baseline token usage",
    "target": "cold_tokens",
    "expectedValue": 3040,
    "tolerancePercent": 10,
    "generatingCommand": "node -e \"const { execSync } = require('child_process'); const out = JSON.parse(execSync('node --no-warnings dist/src/cli/index.js --scenario 001-single-agent-cold --json', { encoding: 'utf8' })); process.stdout.write(String(out.results[0].metrics.tokensTotal));\"",
    "lastVerifiedDate": "2026-09-05"
  },
  {
    "claim": "Total empirical benchmark scenarios",
    "target": "scenario_count",
    "expectedValue": 23,
    "tolerancePercent": 0,
    "generatingCommand": "node -e \"const fs = require('fs'); process.stdout.write(String(fs.readdirSync('./scenarios').filter(f => f.endsWith('.json')).length));\"",
    "lastVerifiedDate": "2026-09-06"
  },
  {
    "claim": "Formal Node test runner suites count",
    "target": "test_suites_count",
    "expectedValue": 8,
    "tolerancePercent": 0,
    "generatingCommand": "node -e \"const fs = require('fs'); process.stdout.write(String(fs.readdirSync('./test').filter(f => f.endsWith('.test.ts')).length));\"",
    "lastVerifiedDate": "2026-09-05"
  }
]
```

## Live Frontier Execution Verification (Tier 2: Google Gemini)

In addition to deterministic regression metrics in the registry above, Arbiter verifies live frontier LLMs:

- **Live Model Orchestration**: In Tier 2 (`--mode agy`), Arbiter provisions isolated Git worktrees, assigns tasks, launches Google Gemini via `agy`, executes TypeScript refactoring, runs test suites, and merges branches into `main`.
- **Token Extraction**: Token consumption is extracted directly from the provider API response payload (e.g. 47,928 total tokens for scenario `008-agent-semantic-correctness`).
- **Fail-Fast Integrity**: If the external CLI (`agy`) is not installed or available in `PATH`, the harness immediately aborts with `[AGY_NOT_AVAILABLE]` and exits 1, ensuring zero silent fallback or masked failures.
- **Authoritative Receipt**: Recorded in [`results/latest-agy.json`](results/latest-agy.json) and [`results/latest-agy.md`](results/latest-agy.md).
