import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { countTokens } from './tokens.js';

const __dirname = import.meta.dirname;
const require = createRequire(import.meta.url);
const rootDir = path.resolve(__dirname, '../../..');
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

export interface WorkerFileOperation {
  path: string;
  content?: string;
  append?: string;
  action?: 'write' | 'append' | 'delete';
}

export interface WorkerTaskConfig {
  workerId: string;
  repoPath: string;
  mode: 'mcp' | 'cli';
  taskId?: string;
  files?: WorkerFileOperation[];
  commitMessage?: string;
  runTypecheck?: boolean;
  runTests?: boolean;
  testFile?: string;
  shouldFail?: boolean;
  failError?: string;
  crashWithSignal?: 'SIGKILL' | 'SIGTERM';
  holdLeaseMs?: number;
}

export interface WorkerProcessOutput {
  pid: number;
  workerId: string;
  taskId: string | null;
  worktreePath: string | null;
  success: boolean;
  typeErrors: number;
  unitTestsPassed: number;
  unitTestsTotal: number;
  commitSha?: string;
  stdout: string;
  stderr: string;
  tokensMeasured: number;
  error?: string;
}

interface JsonRpcMessage {
  jsonrpc: string;
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: Record<string, unknown>;
}

function makeEarlyFailure(config: WorkerTaskConfig): WorkerProcessOutput {
  return {
    pid: process.pid,
    workerId: config.workerId,
    taskId: null,
    worktreePath: null,
    success: false,
    typeErrors: 1,
    unitTestsPassed: 0,
    unitTestsTotal: 1,
    stdout: '',
    stderr: config.failError || 'Deliberate worker failure',
    tokensMeasured: 0,
    error: config.failError || 'Deliberate worker failure',
  };
}

async function runMcpWorker(config: WorkerTaskConfig, arbiterMcpScript: string): Promise<WorkerProcessOutput> {
  if (config.shouldFail && !config.taskId) {
    return makeEarlyFailure(config);
  }

  return new Promise((resolve, reject) => {
    const serverProcess = spawn(process.execPath, [arbiterMcpScript], {
      cwd: config.repoPath,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, PATH: process.env.PATH },
    });

    let buffer = '';
    let claimedTaskId: string | null = null;
    let worktreePath: string | null = null;
    let leaseEpoch = 1;
    let tokensMeasured = 0;
    let typeErrors = 0;
    let unitTestsPassed = 0;
    let unitTestsTotal = 0;

    const send = (msg: JsonRpcMessage) => {
      const jsonStr = JSON.stringify(msg);
      tokensMeasured += countTokens(jsonStr);
      serverProcess.stdin.write(jsonStr + '\n');
    };

    const cleanup = () => {
      try {
        serverProcess.stdin.end();
        serverProcess.kill();
      } catch {}
    };

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Worker ${config.workerId} MCP session timed out after 90s`));
    }, 90000);

    serverProcess.stdout.on('data', async (chunk) => {
      const raw = chunk.toString();
      tokensMeasured += countTokens(raw);
      buffer += raw;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const resp: JsonRpcMessage = JSON.parse(line);

          if (resp.id === 1) {
            // Initialized -> Claim task
            send({
              jsonrpc: '2.0',
              id: 2,
              method: 'tools/call',
              params: {
                name: 'arbiter_claim_task',
                arguments: {
                  worker_id: config.workerId,
                  pid: process.pid,
                },
              },
            });
          } else if (resp.id === 2) {
            // Claim result
            const result = resp.result as { content?: Array<{ text?: string }> };
            const text = result?.content?.[0]?.text;
            if (!text) {
              clearTimeout(timeout);
              cleanup();
              resolve({
                pid: process.pid,
                workerId: config.workerId,
                taskId: null,
                worktreePath: null,
                success: !config.shouldFail,
                typeErrors: 0,
                unitTestsPassed: 0,
                unitTestsTotal: 0,
                stdout: '',
                stderr: '',
                tokensMeasured,
              });
              return;
            }

            const parsed = JSON.parse(text);
            claimedTaskId = parsed.task_id || parsed.taskId || parsed.task?.id;
            worktreePath = parsed.worktree_path || parsed.worktreePath;
            leaseEpoch = parsed.lease_epoch ?? parsed.leaseEpoch ?? 1;

            if (!claimedTaskId || !worktreePath) {
              clearTimeout(timeout);
              cleanup();
              resolve({
                pid: process.pid,
                workerId: config.workerId,
                taskId: null,
                worktreePath: null,
                success: !config.shouldFail,
                typeErrors: 0,
                unitTestsPassed: 0,
                unitTestsTotal: 0,
                stdout: '',
                stderr: '',
                tokensMeasured,
              });
              return;
            }

            // Perform real work inside the assigned worktree
            let commitSha: string | undefined;

            try {
              if (config.crashWithSignal) {
                // Abrupt worker termination test for watchdog recovery
                clearTimeout(timeout);
                cleanup();
                process.exit(137);
              }

              if (config.holdLeaseMs && config.holdLeaseMs > 0) {
                await new Promise((r) => setTimeout(r, config.holdLeaseMs));
              }

              // Apply real file operations
              if (config.files) {
                for (const op of config.files) {
                  const targetFile = path.resolve(worktreePath, op.path);
                  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
                  if (op.action === 'delete') {
                    if (fs.existsSync(targetFile)) fs.unlinkSync(targetFile);
                  } else if (op.action === 'append' || op.append) {
                    fs.appendFileSync(targetFile, op.append || '', 'utf8');
                    tokensMeasured += countTokens(op.append || '');
                  } else {
                    fs.writeFileSync(targetFile, op.content || '', 'utf8');
                    tokensMeasured += countTokens(op.content || '');
                  }
                }
              }

              // Real TypeScript compilation if requested
              if (config.runTypecheck) {
                try {
                  runTsc(worktreePath, ['--noEmit']);
                } catch (err: unknown) {
                  typeErrors++;
                  const stderr = String(err);
                  tokensMeasured += countTokens(stderr);
                }
              }

              // Real Node test execution if requested
              if (config.runTests) {
                try {
                  runTsc(worktreePath);
                } catch (err: unknown) {
                  typeErrors++;
                  tokensMeasured += countTokens(String(err));
                }
                try {
                  let testTarget = ['--test'];
                  if (config.testFile) {
                    let normalized = config.testFile.replace(/\\/g, '/');
                    if (normalized.endsWith('.ts')) {
                      normalized = 'dist/' + normalized.replace(/\.ts$/, '.js');
                    }
                    testTarget = ['--test', normalized];
                  }
                  const testOut = execFileSync(process.execPath, testTarget, {
                    cwd: worktreePath,
                    windowsHide: true,
                    encoding: 'utf8',
                  });
                  tokensMeasured += countTokens(testOut);
                  const passMatch = testOut.match(/# pass (\d+)/);
                  const failMatch = testOut.match(/# fail (\d+)/);
                  const passCount = passMatch ? parseInt(passMatch[1], 10) : 1;
                  const failCount = failMatch ? parseInt(failMatch[1], 10) : 0;
                  unitTestsPassed = passCount;
                  unitTestsTotal = passCount + failCount;
                } catch (err: unknown) {
                  const out = String(err);
                  tokensMeasured += countTokens(out);
                  const passMatch = out.match(/# pass (\d+)/);
                  const failMatch = out.match(/# fail (\d+)/);
                  unitTestsPassed = passMatch ? parseInt(passMatch[1], 10) : 0;
                  const failCount = failMatch ? parseInt(failMatch[1], 10) : 1;
                  unitTestsTotal = unitTestsPassed + failCount;
                }
              }

              // Commit changes in worktree
              const commitMsg = config.commitMessage || `Completed work for ${claimedTaskId}`;
              execFileSync('git', ['add', '.'], { cwd: worktreePath, windowsHide: true });
              execFileSync('git', ['commit', '--allow-empty', '-m', commitMsg], { cwd: worktreePath, windowsHide: true });
              commitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: worktreePath, windowsHide: true, encoding: 'utf8' }).trim();

              if (config.shouldFail) {
                send({
                  jsonrpc: '2.0',
                  id: 3,
                  method: 'tools/call',
                  params: {
                    name: 'arbiter_fail_task',
                    arguments: {
                      task_id: claimedTaskId,
                      worker_id: config.workerId,
                      error: config.failError || 'Deliberate worker task failure',
                    },
                  },
                });
              } else {
                // Complete task via MCP
                send({
                  jsonrpc: '2.0',
                  id: 3,
                  method: 'tools/call',
                  params: {
                    name: 'arbiter_complete_task',
                    arguments: {
                      task_id: claimedTaskId,
                      worker_id: config.workerId,
                      answer: `Task completed cleanly by PID ${process.pid}. Commit: ${commitSha}`,
                      lease_epoch: leaseEpoch,
                    },
                  },
                });
              }
            } catch (workErr: unknown) {
              clearTimeout(timeout);
              cleanup();
              resolve({
                pid: process.pid,
                workerId: config.workerId,
                taskId: claimedTaskId,
                worktreePath,
                success: false,
                typeErrors,
                unitTestsPassed,
                unitTestsTotal,
                stdout: '',
                stderr: String(workErr),
                tokensMeasured,
                error: workErr instanceof Error ? workErr.message : String(workErr),
              });
              return;
            }
          } else if (resp.id === 3) {
            // Completed or Failed confirmation
            clearTimeout(timeout);
            cleanup();
            resolve({
              pid: process.pid,
              workerId: config.workerId,
              taskId: claimedTaskId,
              worktreePath,
              success: !config.shouldFail,
              typeErrors,
              unitTestsPassed,
              unitTestsTotal,
              stdout: JSON.stringify(resp.result),
              stderr: '',
              tokensMeasured,
            });
            return;
          }
        } catch {
          // Continue parsing buffer
        }
      }
    });

    serverProcess.stderr.on('data', (errChunk) => {
      const errStr = errChunk.toString();
      tokensMeasured += countTokens(errStr);
    });

    serverProcess.on('error', (err) => {
      clearTimeout(timeout);
      cleanup();
      reject(err);
    });

    // Start protocol handshake
    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: config.workerId, version: '1.0.0' },
      },
    });
  });
}

async function runCliWorker(config: WorkerTaskConfig, arbiterCliScript: string): Promise<WorkerProcessOutput> {
  if (config.shouldFail && !config.taskId) {
    return makeEarlyFailure(config);
  }

  let tokensMeasured = 0;
  const execArbiter = (args: string[]): { ok: boolean; stdout: string; stderr: string } => {
    try {
      const out = execFileSync(process.execPath, [arbiterCliScript, ...args], {
        cwd: config.repoPath,
        windowsHide: true,
        encoding: 'utf8',
      });
      tokensMeasured += countTokens(out);
      return { ok: true, stdout: out, stderr: '' };
    } catch (err: unknown) {
      const stderr = String(err);
      tokensMeasured += countTokens(stderr);
      return { ok: false, stdout: '', stderr };
    }
  };

  // 1. Claim task with retry backoff for concurrent workers
  let claimRes = { ok: false, stdout: '', stderr: '' };
  let claimData: { ok?: boolean; taskId?: string; task_id?: string; task?: { id?: string }; worktreePath?: string; worktree_path?: string; leaseEpoch?: number } = {};
  let taskId: string | undefined;
  let worktreePath: string | undefined;

  for (let attempt = 0; attempt < 8; attempt++) {
    claimRes = execArbiter(['claim', '--worker', config.workerId, '--pid', String(process.pid)]);
    if (claimRes.ok) {
      try {
        claimData = JSON.parse(claimRes.stdout);
        taskId = claimData.task?.id || claimData.taskId || claimData.task_id;
        worktreePath = claimData.worktreePath || claimData.worktree_path;
        if (taskId && worktreePath) break;
      } catch {}
    }
    await new Promise((r) => setTimeout(r, 80 * Math.pow(1.5, attempt)));
  }

  if (!taskId || !worktreePath) {
    return {
      pid: process.pid,
      workerId: config.workerId,
      taskId: null,
      worktreePath: null,
      success: false,
      typeErrors: 0,
      unitTestsPassed: 0,
      unitTestsTotal: 0,
      stdout: claimRes.stdout,
      stderr: claimRes.stderr || 'No task could be claimed',
      tokensMeasured,
      error: 'Failed to claim task via CLI',
    };
  }

  if (config.crashWithSignal) {
    process.exit(137);
  }

  if (config.holdLeaseMs && config.holdLeaseMs > 0) {
    await new Promise((r) => setTimeout(r, config.holdLeaseMs));
  }

  // 2. Perform real work in worktree
  let typeErrors = 0;
  let unitTestsPassed = 0;
  let unitTestsTotal = 0;

  if (config.files) {
    for (const op of config.files) {
      const targetFile = path.resolve(worktreePath, op.path);
      fs.mkdirSync(path.dirname(targetFile), { recursive: true });
      if (op.action === 'delete') {
        if (fs.existsSync(targetFile)) fs.unlinkSync(targetFile);
      } else if (op.action === 'append' || op.append) {
        fs.appendFileSync(targetFile, op.append || '', 'utf8');
        tokensMeasured += countTokens(op.append || '');
      } else {
        fs.writeFileSync(targetFile, op.content || '', 'utf8');
        tokensMeasured += countTokens(op.content || '');
      }
    }
  }

  if (config.runTypecheck) {
    try {
      runTsc(worktreePath, ['--noEmit']);
    } catch {
      typeErrors++;
    }
  }

  if (config.runTests) {
    try {
      runTsc(worktreePath);
    } catch (err: unknown) {
      typeErrors++;
      tokensMeasured += countTokens(String(err));
    }
    try {
      let testTarget = ['--test'];
      if (config.testFile) {
        let normalized = config.testFile.replace(/\\/g, '/');
        if (normalized.endsWith('.ts')) {
          normalized = 'dist/' + normalized.replace(/\.ts$/, '.js');
        }
        testTarget = ['--test', normalized];
      }
      const testOut = execFileSync(process.execPath, testTarget, {
        cwd: worktreePath,
        windowsHide: true,
        encoding: 'utf8',
      });
      tokensMeasured += countTokens(testOut);
      const passMatch = testOut.match(/# pass (\d+)/);
      const failMatch = testOut.match(/# fail (\d+)/);
      unitTestsPassed = passMatch ? parseInt(passMatch[1], 10) : 1;
      const failCount = failMatch ? parseInt(failMatch[1], 10) : 0;
      unitTestsTotal = unitTestsPassed + failCount;
    } catch (err: unknown) {
      const out = String(err);
      tokensMeasured += countTokens(out);
      const passMatch = out.match(/# pass (\d+)/);
      const failMatch = out.match(/# fail (\d+)/);
      unitTestsPassed = passMatch ? parseInt(passMatch[1], 10) : 0;
      const failCount = failMatch ? parseInt(failMatch[1], 10) : 1;
      unitTestsTotal = unitTestsPassed + failCount;
    }
  }

  // Commit work
  const commitMsg = config.commitMessage || `Worker ${config.workerId} commit for ${taskId}`;
  execFileSync('git', ['add', '.'], { cwd: worktreePath, windowsHide: true });
  execFileSync('git', ['commit', '--allow-empty', '-m', commitMsg], { cwd: worktreePath, windowsHide: true });
  const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: worktreePath, windowsHide: true, encoding: 'utf8' }).trim();

  // Complete or fail task with retry
  let completionSuccess = false;
  if (config.shouldFail) {
    execArbiter(['fail', '--task', taskId, '--worker', config.workerId, '--error', config.failError || 'Failed']);
    completionSuccess = true;
  } else {
    for (let attempt = 0; attempt < 8; attempt++) {
      const compRes = execArbiter(['complete', '--task', taskId, '--worker', config.workerId, '--answer', `Completed commit ${commitSha}`]);
      if (compRes.ok) {
        completionSuccess = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 80 * Math.pow(1.5, attempt)));
    }
  }

  return {
    pid: process.pid,
    workerId: config.workerId,
    taskId,
    worktreePath,
    success: completionSuccess && !config.shouldFail,
    typeErrors,
    unitTestsPassed,
    unitTestsTotal,
    commitSha,
    stdout: `Task ${taskId} completed by PID ${process.pid}`,
    stderr: '',
    tokensMeasured,
  };
}

async function main(): Promise<void> {
  const payloadArg = process.argv[2] || process.env.ARBITER_WORKER_PAYLOAD;
  if (!payloadArg) {
    console.error('WorkerProcess error: No configuration payload provided.');
    process.exit(1);
  }

  let config: WorkerTaskConfig;
  try {
    config = JSON.parse(payloadArg);
  } catch (err) {
    console.error('WorkerProcess error: Invalid JSON payload:', err);
    process.exit(1);
  }

  const arbiterMcpScript = path.resolve(rootDir, '../Arbiter/dist/src/mcp/index.js');
  const arbiterCliScript = path.resolve(rootDir, '../Arbiter/dist/src/cli/cli.js');

  try {
    let result: WorkerProcessOutput;
    if (config.mode === 'mcp') {
      result = await runMcpWorker(config, arbiterMcpScript);
    } else {
      result = await runCliWorker(config, arbiterCliScript);
    }

    console.log(JSON.stringify(result));
    process.exit(result.success ? 0 : 1);
  } catch (err) {
    console.error(JSON.stringify({
      pid: process.pid,
      workerId: config.workerId,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }));
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main();
}
