# Benchmark Quantitative Claims Registry

**Document Version:** 2.1.0-PROD  
**Single Source of Truth for Benchmark & Performance Claims**

```json
[
  {
    "claim": "Waymark in-flight continuity token usage",
    "target": "waymark_tokens",
    "expectedValue": 540,
    "tolerancePercent": 5,
    "generatingCommand": "node -e \"const b = require('./BASELINE_v2.1.0.json'); const s = (b.results || b.scenarios).find(x => x.scenarioId === '002-single-agent-waymark'); process.stdout.write(String(s.metrics.tokensTotal));\"",
    "lastVerifiedDate": "2026-09-05"
  },
  {
    "claim": "Cold exploration baseline token usage",
    "target": "cold_tokens",
    "expectedValue": 7249,
    "tolerancePercent": 5,
    "generatingCommand": "node -e \"const b = require('./BASELINE_v2.1.0.json'); const s = (b.results || b.scenarios).find(x => x.scenarioId === '001-single-agent-cold'); process.stdout.write(String(s.metrics.tokensTotal));\"",
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
