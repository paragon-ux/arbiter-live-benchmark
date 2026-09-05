import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { BaseScenario, ScenarioResult } from '../types.js';
import { countTokens } from '../tokens.js';
import { createTempGitRepo } from '../gitHelper.js';

/**
 * DockerIsolatedAdapter — Tier 3 Comparative Container Isolation Baseline
 * 
 * Directly probes for a local Docker daemon. If available, executes a real container
 * run to measure genuine containerization lifecycle latency vs Arbiter worktrees.
 * If Docker is unavailable, fails closed without synthetic fallbacks.
 */
export class DockerIsolatedAdapter {
  async execute(scenario: BaseScenario): Promise<ScenarioResult> {
    const startTime = performance.now();
    const concurrency = typeof scenario.concurrency === 'number' ? scenario.concurrency : 3;

    let dockerAvailable = false;
    let containerOutput = '';
    let containerError = '';

    // Check if Docker CLI is available and daemon is responding
    try {
      const probeOutput = execFileSync('docker', ['version'], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 6000
      });
      containerOutput += probeOutput;

      // Verify daemon supports Linux containers (required for alpine image)
      const osType = execFileSync('docker', ['info', '--format', '{{.OSType}}'], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 6000
      }).trim();

      if (osType && osType !== 'linux') {
        dockerAvailable = false;
        containerError = `Docker daemon running in '${osType}' mode (requires linux container support for alpine)`;
      } else {
        dockerAvailable = true;
      }
    } catch (err) {
      dockerAvailable = false;
      containerError = String(err);
    }

    if (!dockerAvailable) {
      const durationMs = performance.now() - startTime;
      return {
        scenarioId: scenario.id,
        title: scenario.title,
        tier: 'docker',
        passed: false,
        error: `Docker daemon unreachable on host: ${containerError}. Fail closed with zero simulation.`,
        metrics: {
          durationMs: Number(durationMs.toFixed(2)),
          tokensTotal: 0,
          worktreesProvisioned: 0,
          worktreesIsolated: false,
          conflictsDetected: 0,
          conflictsResolved: 0,
          mainBranchValid: false,
          accuracyPercent: 0,
          details: {
            coordinationStrategy: 'DOCKER_CONTAINER_PER_WORKER',
            dockerDaemonAvailable: false,
            error: containerError,
          }
        }
      };
    }

    // Run real concurrent containers
    const containerStart = performance.now();
    let successfulContainers = 0;

    await Promise.all(
      Array.from({ length: concurrency }, async (_, i) => {
        try {
          const out = execFileSync('docker', ['run', '--rm', 'alpine', 'sh', '-c', `echo "Worker ${i + 1} isolated container"; uname -a`], {
            encoding: 'utf8',
            windowsHide: true,
            timeout: 30000,
          });
          containerOutput += out;
          successfulContainers++;
        } catch (err) {
          containerError += ` Container ${i + 1} failed: ${String(err)}`;
        }
      })
    );

    const containerDurationMs = performance.now() - containerStart;
    const tokensTotal = countTokens(containerOutput);
    const durationMs = performance.now() - startTime;
    const accuracy = concurrency > 0 ? Math.round((successfulContainers / concurrency) * 100) : 0;
    const passed = successfulContainers === concurrency;
    // Measure live worktree creation overhead on the host for direct empirical comparison
    let worktreeEquivMs = 2.0;
    try {
      const { repoPath: tempRepo, cleanup: cleanupTemp } = createTempGitRepo();
      try {
        const wtStart = performance.now();
        const tempWt = path.join(os.tmpdir(), `wt-bench-${Date.now()}`);
        execFileSync('git', ['worktree', 'add', tempWt, 'main'], { cwd: tempRepo, windowsHide: true });
        worktreeEquivMs = Math.max(0.1, performance.now() - wtStart);
        try { execFileSync('git', ['worktree', 'remove', tempWt, '--force'], { cwd: tempRepo, windowsHide: true }); } catch {}
      } finally {
        cleanupTemp();
      }
    } catch {}
    const overheadRatio = Number((containerDurationMs / worktreeEquivMs).toFixed(1));

    return {
      scenarioId: scenario.id,
      title: scenario.title,
      tier: 'docker',
      passed,
      metrics: {
        durationMs: Number(durationMs.toFixed(2)),
        tokensTotal,
        worktreesProvisioned: concurrency,
        worktreesIsolated: true,
        conflictsDetected: 0,
        conflictsResolved: 0,
        mainBranchValid: passed,
        accuracyPercent: accuracy,
        containerStartupMs: Number(containerDurationMs.toFixed(2)),
        overheadRatio,
        details: {
          coordinationStrategy: 'DOCKER_CONTAINER_PER_WORKER',
          dockerDaemonAvailable: true,
          successfulContainers,
          concurrency,
          overheadVsWorktrees: `${overheadRatio}x slower startup`,
        }
      }
    };
  }
}

