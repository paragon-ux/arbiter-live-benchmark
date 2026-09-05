# Benchmark Quantitative Claims Registry

**Document Version:** 2.1.1-PROD  
**Single Source of Truth for Benchmark & Performance Claims**

```json
[
  {
    "claim": "Waymark in-flight continuity token usage",
    "target": "waymark_tokens",
    "expectedValue": 750,
    "tolerancePercent": 10,
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
    "expectedValue": 22,
    "tolerancePercent": 0,
    "generatingCommand": "node -e \"const fs = require('fs'); process.stdout.write(String(fs.readdirSync('./scenarios').filter(f => f.endsWith('.json')).length));\"",
    "lastVerifiedDate": "2026-09-05"
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
