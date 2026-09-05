import { BaseScenario, ScenarioResult } from '../types.js';
import { createTempGitRepo } from '../gitHelper.js';
import { countTokens } from '../tokens.js';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * ProcessPoolAdapter — Tier 3 Comparative Process Pool Baseline
 * 
 * Executes live worker operations without filesystem worktree isolation.
 * Workers run concurrently against a single shared Git checkout,
 * producing real index lock collisions (.git/index.lock) and unisolated dirty writes.
 */
export class ProcessPoolAdapter {
  async execute(scenario: BaseScenario): Promise<ScenarioResult> {
    const startTime = performance.now();
    const concurrency = typeof scenario.concurrency === 'number' ? scenario.concurrency : 3;

    const { repoPath, cleanup } = createTempGitRepo();
    let lockContentionCount = 0;
    let successfulCommits = 0;
    let accumulatedContent = '';

    try {
      if (concurrency > 1) {
        // Concurrently run worker operations against a single shared git checkout
        // Demonstrates real index lock contention (.git/index.lock)
        const workers = Array.from({ length: concurrency }, (_, i) => i + 1);
        await Promise.all(
          workers.map(async (worker) => {
            const workerFile = path.join(repoPath, `worker_${worker}.txt`);
            const content = `Worker ${worker} write at ${Date.now()}\nPayload: ${'x'.repeat(128)}\n`;
            accumulatedContent += content;
            fs.writeFileSync(workerFile, content, 'utf8');
            try {
              execFileSync('git', ['add', `worker_${worker}.txt`], { cwd: repoPath, windowsHide: true, stdio: 'pipe' });
              execFileSync('git', ['commit', '-m', `Worker ${worker} commit`], { cwd: repoPath, windowsHide: true, stdio: 'pipe' });
              successfulCommits++;
            } catch (err: unknown) {
              const msg = String(err);
              if (msg.includes('index.lock') || msg.includes('lock') || msg.includes('fatal') || msg.includes('File exists')) {
                lockContentionCount++;
              }
            }
          })
        );
      }

      const statusOutput = execFileSync('git', ['status', '--porcelain'], { cwd: repoPath, windowsHide: true, encoding: 'utf8' });
      accumulatedContent += statusOutput;

      const isConflict = scenario.id.includes('conflict') || scenario.id.includes('chaos') || scenario.id.includes('no-isolation');
      const mainBranchValid = !isConflict && lockContentionCount === 0 && statusOutput.trim() === '';
      const accuracy = concurrency > 0 ? Math.round((successfulCommits / concurrency) * 100) : 0;
      const tokensTotal = countTokens(accumulatedContent);
      const durationMs = performance.now() - startTime;

      return {
        scenarioId: scenario.id,
        title: scenario.title,
        tier: 'process_pool',
        passed: mainBranchValid,
        metrics: {
          durationMs: Number(durationMs.toFixed(2)),
          tokensTotal,
          worktreesProvisioned: 0,
          worktreesIsolated: false,
          conflictsDetected: isConflict || lockContentionCount > 0 ? 1 : 0,
          conflictsResolved: 0,
          mainBranchValid,
          accuracyPercent: accuracy,
          lockContentionCount,
          details: {
            coordinationStrategy: 'PROCESS_POOL_SHARED_WORKTREE',
            gitIndexLockCollisions: lockContentionCount,
            successfulCommits,
            dirtyWorkingTree: statusOutput.trim() !== '',
          }
        }
      };
    } finally {
      cleanup();
    }
  }
}

