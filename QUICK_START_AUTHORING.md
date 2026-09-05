# Quick-Start Guide for Benchmark Scenario Authors

This guide provides a rapid, practical walkthrough for authoring, implementing, and validating new scenarios in `arbiter-live-benchmark`.

---

## 📋 4-Step Authoring Checklist

1. **Create Scenario JSON**: Define parameters, tasks, and expected invariants in `scenarios/NNN-<name>.json`.
2. **Implement Adapter Logic**: Add deterministic handler in `src/harness/adapters/deterministic.ts`.
3. **Add Verification Test**: Add unit test in `test/deterministic.test.ts`.
4. **Validate Schema & Invariants**: Run `npm test` and update the Hypothesis Correlation Matrix.

---

## 📑 Copy-Paste Scenario Template

Create `scenarios/023-example-scenario.json`:

```json
{
  "id": "023-example-scenario",
  "title": "Example Scenario Title",
  "description": "Concise 1-2 sentence description of the failure mode or concurrency pattern under test.",
  "targetRepo": "targets/microservice-auth",
  "mode": "parallel",
  "concurrency": 2,
  "timeoutMs": 30000,
  "tasks": [
    {
      "id": "task-worker-1",
      "file": "src/auth.ts",
      "workerId": "worker-1"
    },
    {
      "id": "task-worker-2",
      "file": "src/token.ts",
      "workerId": "worker-2"
    }
  ],
  "expectedMetrics": {
    "worktreesProvisioned": 2,
    "worktreesIsolated": true,
    "conflicts": 0,
    "mainClean": true
  }
}
```

---

## 🛠️ Adapter Implementation Pattern

In `src/harness/adapters/deterministic.ts`:

1. Add switch case:
```typescript
case '023-example-scenario':
  return await this.runExampleScenario(scenario, collector);
```

2. Implement handler method:
```typescript
private async runExampleScenario(scenario: BaseScenario, collector: MetricsCollector): Promise<ScenarioResult> {
  const targetPath = path.resolve(rootDir, (scenario.targetRepo as string) || 'targets/microservice-auth');
  const { repoPath, cleanup } = createTempGitRepo(targetPath);
  collector.start();

  try {
    const dbPath = path.join(repoPath, '.arbiter', 'arbiter.db');
    const db = new ArbiterDatabase(dbPath);
    const worktrees = new WorktreeManager(repoPath);
    const mergeQueue = new MergeQueue(db, worktrees, repoPath);

    // 1. Setup tasks and execute
    // 2. Measure tokens dynamically from live prompts, AST mutations, and files
    const prompt = `Task instructions for ${scenario.id}`;
    collector.addTokensFromText(prompt);
    collector.setDetail('customMetric', true);
    collector.setMainValidity(true);
    collector.setAccuracy(100);

    const metrics = collector.finish();
    metrics.worktreesProvisioned = 2;
    metrics.worktreesIsolated = true;

    return {
      scenarioId: scenario.id,
      title: scenario.title,
      tier: 'deterministic',
      passed: metrics.mainBranchValid,
      metrics
    };
  } finally {
    cleanup();
  }
}
```

---

## 🧪 Verification Commands

```bash
# Compile and test
npm run build
npm test

# Verify schema
node --test "dist/test/scenarios.test.js"

# Run full benchmark
npm run benchmark
```
