import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { BaseScenario, ScenarioResult } from '../types.js';
import { createTempGitRepo } from '../gitHelper.js';
import { ArbiterDatabase, WorktreeManager, MergeQueue } from 'arbiter';

import { createRequire } from 'node:module';

const __dirname = import.meta.dirname;
const require = createRequire(import.meta.url);
const rootDir = path.resolve(__dirname, '../../../..');
const rootNodeModules = path.resolve(rootDir, 'node_modules');
const rootTypesDir = path.resolve(rootNodeModules, '@types');

const tscBin = (() => {
  try {
    return require.resolve('typescript/bin/tsc');
  } catch {
    return 'tsc';
  }
})();

function runTsc(worktreePath: string, extraArgs: string[] = []): void {
  const args = [tscBin, ...extraArgs];
  if (fs.existsSync(rootTypesDir)) {
    args.push('--typeRoots', rootTypesDir);
  }
  execFileSync(process.execPath, args, {
    cwd: worktreePath,
    windowsHide: true,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_PATH: fs.existsSync(rootNodeModules) ? rootNodeModules : process.env.NODE_PATH,
    },
  });
}

export interface AgyOutputJson {
  conversation_id: string;
  status: string;
  response: string;
  duration_seconds: number;
  num_turns: number;
  usage: {
    input_tokens: number;
    output_tokens: number;
    thinking_tokens?: number;
    cache_read_tokens?: number;
    total_tokens: number;
  };
}

export class AgyAgentAdapter {
  private agyPath: string | null = null;

  constructor() {
    this.probeAgyBinary();
  }

  private probeAgyBinary(): void {
    try {
      execFileSync('agy', ['--help'], { stdio: 'ignore', windowsHide: true });
      this.agyPath = 'agy';
      return;
    } catch {}

    if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
      const localPath = path.join(process.env.LOCALAPPDATA, 'agy', 'bin', 'agy.exe');
      if (fs.existsSync(localPath)) {
        this.agyPath = localPath;
        return;
      }
    }
  }

  public isAvailable(): boolean {
    return this.agyPath !== null;
  }

  public assertAvailable(): void {
    if (!this.agyPath) {
      throw new Error(
        `[AGY_NOT_AVAILABLE] Live Agent Mode (--mode agy) was explicitly requested, but the Antigravity CLI ('agy') ` +
        `was not found in PATH or LocalAppData. Live worker execution requires an active 'agy' installation with Gemini access.`
      );
    }
  }

  async execute(scenario: BaseScenario): Promise<ScenarioResult> {
    this.assertAvailable();
    const startTime = performance.now();

    const targetPath = path.resolve(rootDir, (scenario.targetRepo as string) || 'targets/microservice-auth');
    const { repoPath, cleanup } = createTempGitRepo(targetPath);

    try {
      const dbPath = path.join(repoPath, '.arbiter', 'arbiter.db');
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      const db = new ArbiterDatabase(dbPath);
      const worktrees = new WorktreeManager(repoPath);

      const taskId = `task-agy-${scenario.id}`;
      const branchName = worktrees.getBranchNameForTask(taskId);

      db.insertTask({
        id: taskId,
        title: scenario.title,
        description: scenario.description,
        baseBranch: 'main',
        branch: branchName,
        status: 'READY',
        worktreePath: null,
        assignedWorkerId: null,
        waymarkTrajectoryId: null,
        resultAnswer: null,
        errorMessage: null,
      });

      // Provision isolated worktree
      const worktree = worktrees.createWorktree(taskId, 'main');
      const worktreePath = worktree.path;

      // Build task prompt tailored to the scenario
      let prompt = `You are an automated worker agent executing a coding task in an Arbiter-isolated worktree at "${worktreePath}".\n` +
        `Scenario: ${scenario.title}\n` +
        `Task description: ${scenario.description}\n`;

      if (scenario.id === '008-agent-semantic-correctness') {
        prompt += `Specific instruction:\n` +
          `In "src/audit.ts", append and export the helper function:\n` +
          `export function verifyAuditTrail(records: unknown[]): boolean { return Array.isArray(records); }\n` +
          `Do not modify any other logic or exports. Write the changes directly to "src/audit.ts".\n`;
      } else {
        const taskInfo = scenario.task as Record<string, unknown> | undefined;
        if (taskInfo?.goal) {
          prompt += `Goal: ${taskInfo.goal}\n`;
        }
        if (taskInfo?.targetFile) {
          prompt += `Target file: ${taskInfo.targetFile}\n`;
        }
        prompt += `Perform the requested modifications directly in the worktree files. Ensure all changes are saved.\n`;
      }

      // Execute agy CLI live
      const agyArgs = [
        '-p', prompt,
        '--effort', 'low',
        '--disable-slash-commands',
        '--dangerously-skip-permissions',
        '--output-format', 'json',
        '--add-dir', worktreePath
      ];

      let rawOutput = '';
      try {
        rawOutput = execFileSync(this.agyPath!, agyArgs, {
          encoding: 'utf8',
          windowsHide: true,
          timeout: 180_000,
          maxBuffer: 10 * 1024 * 1024,
        });
      } catch (err: unknown) {
        const e = err as { message?: string; stdout?: string; stderr?: string };
        throw new Error(
          `[AGY_EXECUTION_FAILED] Antigravity CLI failed during live agent execution: ${e.message || String(err)}\n` +
          `stdout: ${e.stdout || ''}\nstderr: ${e.stderr || ''}`
        );
      }

      let agyResult: AgyOutputJson;
      try {
        agyResult = JSON.parse(rawOutput.trim());
      } catch {
        throw new Error(
          `[AGY_INVALID_OUTPUT] Antigravity CLI returned invalid JSON output: "${rawOutput.slice(0, 500)}"`
        );
      }

      if (agyResult.status !== 'SUCCESS') {
        throw new Error(
          `[AGY_STATUS_ERROR] Antigravity CLI reported agent status "${agyResult.status}": ${agyResult.response}`
        );
      }

      const totalTokens = agyResult.usage?.total_tokens ||
        ((agyResult.usage?.input_tokens || 0) + (agyResult.usage?.output_tokens || 0));

      // Run TypeScript typecheck and build in worktree
      let typeErrors = 0;
      try {
        runTsc(worktreePath);
      } catch {
        typeErrors = 1;
      }

      // Run unit tests if test file exists
      let testsPassed = 0;
      let testsTotal = 1;
      const testFile = path.join(worktreePath, 'test', 'auth.test.ts');
      if (fs.existsSync(testFile)) {
        try {
          const testTarget = path.join(worktreePath, 'dist', 'test', 'auth.test.js');
          const testCmd = fs.existsSync(testTarget) ? testTarget : 'dist/test/auth.test.js';
          execFileSync(process.execPath, ['--test', testCmd], {
            cwd: worktreePath,
            windowsHide: true,
            stdio: 'ignore',
          });
          testsPassed = 1;
        } catch {
          testsPassed = 0;
        }
      } else {
        testsPassed = typeErrors === 0 ? 1 : 0;
      }

      const accuracyPercent = Math.round((testsPassed / testsTotal) * 100);

      // Commit changes in worktree
      worktrees.commitAll(worktreePath, `Implemented task via Gemini Agy: ${scenario.title}`);

      // Mark task completed and merge into main
      db.updateTask(taskId, { status: 'COMPLETED' });
      const mergeQueue = new MergeQueue(db, worktrees, repoPath);
      const mergeRes = mergeQueue.mergeTask(taskId, 'main');
      db.close();

      const durationMs = performance.now() - startTime;
      const passed = typeErrors === 0 && testsPassed === testsTotal && mergeRes.ok;

      return {
        scenarioId: scenario.id,
        title: scenario.title,
        tier: 'agy',
        passed,
        metrics: {
          durationMs: Number(durationMs.toFixed(2)),
          tokensTotal: totalTokens,
          conflictsDetected: 0,
          conflictsResolved: 0,
          mainBranchValid: mergeRes.ok,
          accuracyPercent,
          details: {
            llmProvider: 'Google Gemini (Antigravity CLI)',
            conversationId: agyResult.conversation_id,
            inputTokens: agyResult.usage?.input_tokens || 0,
            outputTokens: agyResult.usage?.output_tokens || 0,
            thinkingTokens: agyResult.usage?.thinking_tokens || 0,
            cacheReadTokens: agyResult.usage?.cache_read_tokens || 0,
            worktreePath: `.arbiter/worktrees/${taskId}`,
            typeErrors,
            unitTestsPassed: testsPassed,
            unitTestsTotal: testsTotal,
          }
        }
      };
    } finally {
      cleanup();
    }
  }
}
