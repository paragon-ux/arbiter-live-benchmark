import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import { execFileSync as nodeExecFileSync, spawn, type ExecFileSyncOptions } from 'node:child_process';
import { createRequire } from 'node:module';
import { countTokens } from './tokens.js';

const __dirname = import.meta.dirname;
const require = createRequire(import.meta.url);
const rootDir = path.resolve(__dirname, '../../..');
const rootNodeModules = path.resolve(rootDir, 'node_modules');
const rootTypesDir = path.resolve(rootNodeModules, '@types');
const COMMAND_TIMEOUT_MS = 30_000;
const MCP_TIMEOUT_MS = 90_000;
const waymarkCliScript = [
  process.env.WAYMARK_CLI_PATH || '',
  path.resolve(rootDir, '../Deepseek-Project/Waymark/dist/src/cli.js'),
  path.resolve(rootDir, '../Waymark/dist/src/cli.js'),
].find((candidate) => candidate && fs.existsSync(candidate)) || '';

const tscBin = (() => {
  try {
    return require.resolve('typescript/bin/tsc');
  } catch {
    return 'tsc';
  }
})();

function execFileSync(file: string, args: readonly string[], options: ExecFileSyncOptions = {}): string | Buffer {
  return nodeExecFileSync(file, args, {
    timeout: COMMAND_TIMEOUT_MS,
    killSignal: 'SIGTERM',
    ...options,
  }) as string | Buffer;
}

function textValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  return value === undefined || value === null ? '' : String(value);
}

interface CommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

function executeCommand(file: string, args: readonly string[], cwd: string): CommandResult {
  try {
    const output = execFileSync(file, args, {
      cwd,
      windowsHide: true,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_PATH: fs.existsSync(rootNodeModules) ? rootNodeModules : process.env.NODE_PATH,
      },
    });
    return { ok: true, stdout: textValue(output), stderr: '' };
  } catch (err: unknown) {
    const failure = err as { stdout?: unknown; stderr?: unknown; message?: unknown };
    const stdout = textValue(failure.stdout);
    const stderr = textValue(failure.stderr) || textValue(failure.message) || textValue(err);
    return { ok: false, stdout, stderr };
  }
}

class TokenLedger {
  private total = 0;
  private request = 0;
  private response = 0;
  private content = 0;
  private errors = 0;
  private retries = 0;
  stdout = '';
  stderr = '';

  add(text: string, kind: 'request' | 'response' | 'content' | 'error', retry = false, stream: 'stdout' | 'stderr' = 'stdout'): void {
    if (!text) return;
    const tokens = countTokens(text);
    this.total += tokens;
    if (kind === 'request') this.request += tokens;
    if (kind === 'response') this.response += tokens;
    if (kind === 'content') this.content += tokens;
    if (kind === 'error') this.errors += tokens;
    if (retry) this.retries += tokens;
    if (kind === 'response' || kind === 'error') {
      if (stream === 'stderr') this.stderr += text;
      else this.stdout += text;
    }
  }

  snapshot(): { tokensMeasured: number; stdout: string; stderr: string; requestTokens: number; responseTokens: number; contentTokens: number; errorTokens: number; retryTokens: number } {
    return {
      tokensMeasured: this.total,
      stdout: this.stdout,
      stderr: this.stderr,
      requestTokens: this.request,
      responseTokens: this.response,
      contentTokens: this.content,
      errorTokens: this.errors,
      retryTokens: this.retries,
    };
  }
}

function runCommandWithLedger(ledger: TokenLedger, file: string, args: readonly string[], cwd: string, retry = false): CommandResult {
  ledger.add(JSON.stringify(args), 'request', retry);
  const result = executeCommand(file, args, cwd);
  ledger.add(result.stdout, 'response', retry, 'stdout');
  ledger.add(result.stderr, 'error', retry, 'stderr');
  return result;
}

function runTsc(ledger: TokenLedger, worktreePath: string, extraArgs: string[] = []): CommandResult {
  const args = [tscBin, ...extraArgs];
  if (fs.existsSync(rootTypesDir)) {
    args.push('--typeRoots', rootTypesDir);
  }
  return runCommandWithLedger(ledger, process.execPath, args, worktreePath);
}

function canonicalPath(candidate: string): string {
  const resolved = path.resolve(candidate);
  try { return fs.realpathSync.native(resolved); } catch { return resolved; }
}

function isWithin(root: string, candidate: string, allowRoot = false): boolean {
  const relative = path.relative(root, candidate);
  return (allowRoot && relative === '') || (relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function nearestExisting(candidate: string): string {
  let current = path.resolve(candidate);
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return current;
    current = parent;
  }
  return current;
}

function resolveContainedPath(worktreePath: string, requestedPath: string, label: string): string {
  if (typeof requestedPath !== 'string' || requestedPath.trim() === '' || path.isAbsolute(requestedPath) || /^[A-Za-z]:[\\/]/.test(requestedPath) || requestedPath.startsWith('\\')) {
    throw new Error(`${label} must be a non-empty relative path`);
  }
  const root = canonicalPath(worktreePath);
  const candidate = path.resolve(worktreePath, requestedPath);
  if (!isWithin(path.resolve(worktreePath), candidate)) {
    throw new Error(`${label} escapes the assigned worktree`);
  }
  const parent = canonicalPath(nearestExisting(path.dirname(candidate)));
  if (!isWithin(root, parent, true)) {
    throw new Error(`${label} resolves outside the assigned worktree`);
  }
  try {
    if (fs.lstatSync(candidate).isSymbolicLink()) {
      throw new Error(`${label} must not be a symbolic link`);
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('must not be a symbolic link')) throw err;
  }
  if (fs.existsSync(candidate) && !isWithin(root, canonicalPath(candidate))) {
    throw new Error(`${label} resolves outside the assigned worktree`);
  }
  return candidate;
}

function resolveWorktreePath(repoPath: string, candidate: unknown): string {
  if (typeof candidate !== 'string' || candidate.trim() === '') throw new Error('Arbiter returned no worktree path');
  const root = canonicalPath(repoPath);
  const resolved = path.resolve(candidate);
  if (!isWithin(root, canonicalPath(resolved))) throw new Error('Arbiter returned a worktree outside the repository');
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) throw new Error('Arbiter returned a missing worktree');
  return resolved;
}

function resolveTestTarget(worktreePath: string, testFile: string): string {
  const normalized = testFile.replace(/\\/g, '/');
  if (!normalized) throw new Error('testFile must not be empty');
  if (normalized.endsWith('.ts')) {
    const source = resolveContainedPath(worktreePath, normalized, 'testFile');
    if (!fs.statSync(source).isFile()) throw new Error('testFile must reference a regular file');
    const compiled = `dist/${normalized.replace(/\.ts$/, '.js')}`;
    const target = resolveContainedPath(worktreePath, compiled, 'compiled testFile');
    if (!fs.statSync(target).isFile()) throw new Error('compiled testFile is missing');
    return path.relative(worktreePath, target).replace(/\\/g, '/');
  }
  const target = resolveContainedPath(worktreePath, normalized, 'testFile');
  if (!fs.statSync(target).isFile()) throw new Error('testFile must reference a regular file');
  return path.relative(worktreePath, target).replace(/\\/g, '/');
}

function applyFileOperations(worktreePath: string, files: WorkerFileOperation[] | undefined, ledger: TokenLedger): void {
  for (const op of files || []) {
    const targetFile = resolveContainedPath(worktreePath, op.path, 'file operation path');
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    if (op.action === 'delete') {
      if (fs.existsSync(targetFile)) fs.unlinkSync(targetFile);
    } else if (op.action === 'append' || op.append !== undefined) {
      const content = op.append || '';
      fs.appendFileSync(targetFile, content, 'utf8');
      ledger.add(content, 'content');
    } else {
      const content = op.content || '';
      fs.writeFileSync(targetFile, content, 'utf8');
      ledger.add(content, 'content');
    }
  }
}

function runTests(ledger: TokenLedger, worktreePath: string, testFile?: string): { typeErrors: number; unitTestsPassed: number; unitTestsTotal: number } {
  let typeErrors = 0;
  let unitTestsPassed = 0;
  let unitTestsTotal = 0;
  const compile = runTsc(ledger, worktreePath);
  if (!compile.ok) typeErrors++;
  const normalizedTestFile = testFile ? resolveTestTarget(worktreePath, testFile) : undefined;
  const testTarget = normalizedTestFile ? ['--test', normalizedTestFile] : ['--test'];
  const testResult = runCommandWithLedger(ledger, process.execPath, testTarget, worktreePath);
  const output = testResult.stdout + testResult.stderr;
  const passMatch = output.match(/# pass (\d+)/);
  const failMatch = output.match(/# fail (\d+)/);
  unitTestsPassed = passMatch ? parseInt(passMatch[1], 10) : (testResult.ok ? 1 : 0);
  const failCount = failMatch ? parseInt(failMatch[1], 10) : (testResult.ok ? 0 : 1);
  unitTestsTotal = unitTestsPassed + failCount;
  return { typeErrors, unitTestsPassed, unitTestsTotal };
}

function recordWaymarkHop(ledger: TokenLedger, worktreePath: string, trajectoryId: string | null | undefined, files: WorkerFileOperation[] | undefined): void {
  if (!waymarkCliScript || !trajectoryId) return;

  const hopPath = files?.map((file) => file.path).find((file) => {
    try { return fs.existsSync(resolveContainedPath(worktreePath, file, 'Waymark path')); } catch { return false; }
  }) || 'README.md';
  const safeHopPath = resolveContainedPath(worktreePath, hopPath, 'Waymark path');
  if (!fs.existsSync(safeHopPath)) return;

  const result = runCommandWithLedger(ledger, process.execPath, [
    waymarkCliScript,
    'note',
    trajectoryId,
    '--path',
    hopPath.replace(/\\/g, '/'),
    '--label',
    'worker-complete',
    '--start',
    '1',
    '--end',
    '1',
    '--inference',
    'Recorded worker changes before Arbiter completion.',
  ], worktreePath);
  if (!result.ok) throw new Error(`Waymark note failed: ${result.stderr}`);
}

export interface WorkerFileOperation {
  path: string;
  content?: string;
  append?: string;
  action?: 'write' | 'append' | 'delete';
}

export interface DiscoveryRequest {
  path: string;
  language?: string;
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
  discovery?: DiscoveryRequest;
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
  requestTokens?: number;
  responseTokens?: number;
  contentTokens?: number;
  errorTokens?: number;
  retryTokens?: number;
  claimAttempts?: number;
  completionAttempts?: number;
  failureAttempts?: number;
  discoveryResult?: Record<string, unknown>;
  discoveryNoWrite?: boolean;
  error?: string;
}

function terminateForTest(signal: 'SIGKILL' | 'SIGTERM'): never {
  if (process.platform !== 'win32') {
    try {
      process.kill(process.pid, signal);
    } catch {}
  }
  process.exit(signal === 'SIGTERM' ? 143 : 137);
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

function snapshotTree(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const entries = fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  const result: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      result.push(...snapshotTree(absolute).map((item) => `${entry.name}/${item}`));
    } else if (entry.isSymbolicLink()) {
      result.push(`${entry.name}:symlink:${fs.readlinkSync(absolute)}`);
    } else if (entry.isFile()) {
      result.push(`${entry.name}:file:${crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex')}`);
    }
  }
  return result;
}

function discoveryStateSnapshot(repoPath: string, worktreePath: string, relativePath: string): string {
  const databaseDir = path.join(repoPath, '.arbiter');
  const databaseFiles = fs.existsSync(databaseDir)
    ? fs.readdirSync(databaseDir).filter((name) => name.startsWith('arbiter.db')).sort().map((name) => {
      const filePath = path.join(databaseDir, name);
      return `${name}:${crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
    })
    : [];
  const sourcePath = resolveContainedPath(worktreePath, relativePath, 'discovery path');
  if (!fs.statSync(sourcePath).isFile()) throw new Error('discovery path must reference a regular file');
  const sourceHash = crypto.createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex');
  const gitStatus = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: worktreePath,
    windowsHide: true,
    encoding: 'utf8',
  });
  return JSON.stringify({
    sourceHash,
    gitStatus,
    databaseFiles,
    waymark: snapshotTree(path.join(worktreePath, '.waymark')),
  });
}

async function runMcpWorker(config: WorkerTaskConfig, arbiterMcpScript: string): Promise<WorkerProcessOutput> {
  if (config.shouldFail && !config.taskId) {
    return makeEarlyFailure(config);
  }

  return new Promise((resolve) => {
    const serverProcess = spawn(process.execPath, [arbiterMcpScript], {
      cwd: config.repoPath,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, PATH: process.env.PATH },
    });

    let buffer = '';
    let claimedTaskId: string | null = null;
    let worktreePath: string | null = null;
    let waymarkTrajectoryId: string | null = null;
    let commitSha: string | undefined;
    let leaseEpoch = 1;
    let typeErrors = 0;
    let unitTestsPassed = 0;
    let unitTestsTotal = 0;
    let claimAttempts = 0;
    let completionAttempts = 0;
    let failureAttempts = 0;
    let claimSent = false;
    let completionSent = false;
    let settled = false;
    let responseChain = Promise.resolve();
    const ledger = new TokenLedger();

    const send = (msg: JsonRpcMessage) => {
      if (settled || serverProcess.stdin.destroyed) return;
      const jsonStr = JSON.stringify(msg);
      ledger.add(jsonStr, 'request');
      serverProcess.stdin.write(jsonStr + '\n');
    };

    const cleanup = () => {
      try {
        if (!serverProcess.stdin.destroyed) serverProcess.stdin.end();
      } catch {}
      try {
        if (!serverProcess.killed) serverProcess.kill();
      } catch {}
    };

    let timeout: NodeJS.Timeout;
    const output = (overrides: Partial<WorkerProcessOutput> = {}): WorkerProcessOutput => ({
      pid: process.pid,
      workerId: config.workerId,
      taskId: claimedTaskId,
      worktreePath,
      success: false,
      typeErrors,
      unitTestsPassed,
      unitTestsTotal,
      commitSha,
      ...ledger.snapshot(),
      claimAttempts,
      completionAttempts,
      failureAttempts,
      ...overrides,
    });

    const finish = (result: WorkerProcessOutput) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      cleanup();
      resolve(result);
    };

    const fail = (message: string) => {
      finish(output({ error: message, stderr: ledger.stderr || message }));
    };

    const performWork = async (): Promise<void> => {
      if (!worktreePath || !claimedTaskId) throw new Error('MCP claim response did not provide a usable task');
      if (config.crashWithSignal) terminateForTest(config.crashWithSignal);

      if (config.holdLeaseMs && config.holdLeaseMs > 0) {
        await new Promise((r) => setTimeout(r, config.holdLeaseMs));
      }

      applyFileOperations(worktreePath, config.files, ledger);

      if (config.runTypecheck) {
        const result = runTsc(ledger, worktreePath, ['--noEmit']);
        if (!result.ok) typeErrors++;
      }

      if (config.runTests) {
        const testMetrics = runTests(ledger, worktreePath, config.testFile);
        typeErrors += testMetrics.typeErrors;
        unitTestsPassed = testMetrics.unitTestsPassed;
        unitTestsTotal = testMetrics.unitTestsTotal;
      }

      if (config.shouldFail) {
        const commitMessage = config.commitMessage || `Failed work for ${claimedTaskId}`;
        const addResult = runCommandWithLedger(ledger, 'git', ['add', '.'], worktreePath);
        if (!addResult.ok) throw new Error(`git add failed: ${addResult.stderr}`);
        const commitResult = runCommandWithLedger(ledger, 'git', ['commit', '--allow-empty', '-m', commitMessage], worktreePath);
        if (!commitResult.ok) throw new Error(`git commit failed: ${commitResult.stderr}`);
        failureAttempts = 1;
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
        return;
      }

      recordWaymarkHop(ledger, worktreePath, waymarkTrajectoryId, config.files);
      completionAttempts = 1;
      completionSent = true;
      send({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'arbiter_complete_task',
          arguments: {
            task_id: claimedTaskId,
            worker_id: config.workerId,
            answer: `Task completed cleanly by PID ${process.pid}.`,
            lease_epoch: leaseEpoch,
          },
        },
      });
    };

    const handleLine = async (line: string): Promise<void> => {
      if (settled || !line.trim()) return;
      let resp: JsonRpcMessage;
      try {
        resp = JSON.parse(line) as JsonRpcMessage;
      } catch (err: unknown) {
        fail(`Invalid MCP response: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }

      if (resp.error) {
        fail(`MCP error${resp.id === undefined ? '' : ` for request ${String(resp.id)}`}: ${JSON.stringify(resp.error)}`);
        return;
      }

      if (resp.id === 1) {
        if (claimSent) return;
        claimSent = true;
        claimAttempts = 1;
        send({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'arbiter_claim_task',
            arguments: { worker_id: config.workerId, pid: process.pid },
          },
        });
        return;
      }

      if (resp.id === 2) {
        if (claimedTaskId) return;
        const result = resp.result as { content?: Array<{ text?: string }> } | undefined;
        const text = result?.content?.[0]?.text;
        if (!text) {
          fail('MCP claim returned no task payload');
          return;
        }
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(text) as Record<string, unknown>;
        } catch (err: unknown) {
          fail(`Invalid MCP claim payload: ${err instanceof Error ? err.message : String(err)}`);
          return;
        }
        const task = parsed.task as Record<string, unknown> | undefined;
        const taskId = task?.id || parsed.task_id || parsed.taskId;
        const returnedWorktree = parsed.worktree_path || parsed.worktreePath;
        if (typeof taskId !== 'string' || typeof returnedWorktree !== 'string') {
          fail('MCP claim payload did not contain task and worktree identifiers');
          return;
        }
        claimedTaskId = taskId;
        worktreePath = resolveWorktreePath(config.repoPath, returnedWorktree);
        waymarkTrajectoryId = typeof parsed.waymark_trajectory_id === 'string'
          ? parsed.waymark_trajectory_id
          : typeof parsed.waymarkTrajectoryId === 'string' ? parsed.waymarkTrajectoryId : null;
        leaseEpoch = Number(parsed.lease_epoch ?? parsed.leaseEpoch ?? 1);
        try {
          await performWork();
        } catch (err: unknown) {
          fail(err instanceof Error ? err.message : String(err));
        }
        return;
      }

      if (resp.id === 3) {
        if (completionSent && config.shouldFail === false) {
          completionSent = false;
        }
        const result = resp.result as { content?: Array<{ text?: string }> } | undefined;
        const text = result?.content?.[0]?.text;
        if (!text) {
          fail('MCP task transition returned no result payload');
          return;
        }
        let resultData: { ok?: boolean };
        try {
          resultData = JSON.parse(text) as { ok?: boolean };
        } catch (err: unknown) {
          fail(`Invalid MCP task transition payload: ${err instanceof Error ? err.message : String(err)}`);
          return;
        }
        if (resultData.ok !== true) {
          fail(`MCP task transition failed for ${claimedTaskId || 'unknown task'}`);
          return;
        }
        if (!config.shouldFail && worktreePath) {
          const revision = runCommandWithLedger(ledger, 'git', ['rev-parse', 'HEAD'], worktreePath);
          if (revision.ok) commitSha = revision.stdout.trim();
        }
        finish(output({
          success: !config.shouldFail,
          error: config.shouldFail ? config.failError || 'Deliberate worker task failure' : undefined,
        }));
      }
    };

    serverProcess.stdout.on('data', (chunk) => {
      if (settled) return;
      const raw = chunk.toString();
      ledger.add(raw, 'response', false, 'stdout');
      buffer += raw;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        responseChain = responseChain.then(() => handleLine(line)).catch((err: unknown) => {
          fail(err instanceof Error ? err.message : String(err));
        });
      }
    });

    serverProcess.stderr.on('data', (errChunk) => {
      if (settled) return;
      const errStr = errChunk.toString();
      ledger.add(errStr, 'error', false, 'stderr');
    });

    serverProcess.on('error', (err) => {
      fail(err.message);
    });

    serverProcess.on('close', (code, signal) => {
      if (!settled) fail(`MCP server exited before completing the task (code=${code ?? 'null'}, signal=${signal ?? 'none'})`);
    });

    timeout = setTimeout(() => {
      fail(`Worker ${config.workerId} MCP session timed out after ${MCP_TIMEOUT_MS / 1000}s`);
    }, MCP_TIMEOUT_MS);

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

  const ledger = new TokenLedger();
  const execArbiter = (args: string[], retry = false): CommandResult => runCommandWithLedger(
    ledger,
    process.execPath,
    [arbiterCliScript, ...args],
    config.repoPath,
    retry,
  );
  const parseJson = (output: string): Record<string, unknown> | null => {
    try {
      const parsed: unknown = JSON.parse(output.trim());
      return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
    } catch {
      return null;
    }
  };
  let claimAttempts = 0;
  let completionAttempts = 0;
  let failureAttempts = 0;

  // 1. Claim task with retry backoff for concurrent workers
  let claimRes: CommandResult = { ok: false, stdout: '', stderr: '' };
  let claimData: Record<string, unknown> = {};
  let taskId: string | undefined;
  let worktreePath: string | undefined;
  let claimError = '';

  for (let attempt = 0; attempt < 8; attempt++) {
    claimAttempts = attempt + 1;
    claimRes = execArbiter(['claim', '--worker', config.workerId, '--pid', String(process.pid)], attempt > 0);
    const parsed = claimRes.ok ? parseJson(claimRes.stdout) : null;
    const task = parsed?.task && typeof parsed.task === 'object' ? parsed.task as Record<string, unknown> : undefined;
    const candidateTaskId = task?.id ?? parsed?.taskId ?? parsed?.task_id;
    const candidateWorktree = parsed?.worktreePath ?? parsed?.worktree_path;
    if (typeof candidateTaskId === 'string' && typeof candidateWorktree === 'string') {
      try {
        const resolvedWorktree = resolveWorktreePath(config.repoPath, candidateWorktree);
        const rawLeaseEpoch = parsed?.leaseEpoch ?? parsed?.lease_epoch;
        const parsedLeaseEpoch = Number(rawLeaseEpoch);
        if (!Number.isInteger(parsedLeaseEpoch)) throw new Error('Arbiter claim returned no valid lease epoch');
        claimData = parsed || {};
        taskId = candidateTaskId;
        worktreePath = resolvedWorktree;
        break;
      } catch (err: unknown) {
        claimError = err instanceof Error ? err.message : String(err);
      }
    } else {
      claimError = claimRes.stderr || 'CLI claim returned no task and worktree identifiers';
    }
    if (attempt < 7) await new Promise((r) => setTimeout(r, 80 * Math.pow(1.5, attempt)));
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
      ...ledger.snapshot(),
      claimAttempts,
      completionAttempts,
      failureAttempts,
      error: claimError || 'Failed to claim task via CLI',
    };
  }

  if (config.crashWithSignal) {
    terminateForTest(config.crashWithSignal);
  }

  if (config.holdLeaseMs && config.holdLeaseMs > 0) {
    await new Promise((r) => setTimeout(r, config.holdLeaseMs));
  }

  // 2. Perform real work in worktree
  let typeErrors = 0;
  let unitTestsPassed = 0;
  let unitTestsTotal = 0;
  const waymarkTrajectoryId = typeof (claimData.waymarkTrajectoryId ?? claimData.waymark_trajectory_id) === 'string'
    ? String(claimData.waymarkTrajectoryId ?? claimData.waymark_trajectory_id)
    : undefined;
  const leaseEpoch = Number(claimData.leaseEpoch ?? claimData.lease_epoch);
  let discoveryResult: Record<string, unknown> | undefined;
  let discoveryNoWrite: boolean | undefined;

  const output = (overrides: Partial<WorkerProcessOutput> = {}): WorkerProcessOutput => ({
    pid: process.pid,
    workerId: config.workerId,
    taskId,
    worktreePath,
    success: false,
    typeErrors,
    unitTestsPassed,
    unitTestsTotal,
    ...ledger.snapshot(),
    claimAttempts,
    completionAttempts,
    failureAttempts,
    discoveryResult,
    discoveryNoWrite,
    ...overrides,
  });

  const transitionFailure = async (reason: string): Promise<{ ok: boolean; error?: string }> => {
    let lastError = reason;
    for (let attempt = 0; attempt < 8; attempt++) {
      failureAttempts = attempt + 1;
      const result = execArbiter([
        'fail',
        '--task', taskId,
        '--worker', config.workerId,
        '--error', reason,
      ], attempt > 0);
      const parsed = result.ok ? parseJson(result.stdout) : null;
      if (result.ok && parsed?.ok === true) return { ok: true };
      lastError = result.stderr || 'CLI failure transition was not acknowledged';
      if (attempt < 7) await new Promise((r) => setTimeout(r, 80 * Math.pow(1.5, attempt)));
    }
    return { ok: false, error: lastError };
  };

  if (config.discovery) {
    const discoveryPath = config.discovery.path.replace(/\\/g, '/');
    const discoveryFile = resolveContainedPath(worktreePath, discoveryPath, 'discovery path');
    if (!fs.statSync(discoveryFile).isFile()) {
      const reason = 'discovery path must reference a regular file';
      const transition = await transitionFailure(reason);
      return output({ error: transition.ok ? reason : `${reason}; ${transition.error}` });
    }
    const before = discoveryStateSnapshot(config.repoPath, worktreePath, discoveryPath);
    const language = typeof config.discovery.language === 'string' && config.discovery.language.trim()
      ? config.discovery.language.trim()
      : undefined;
    const discoveryRes = execArbiter([
      'discover-symbols',
      '--task', taskId,
      '--worker', config.workerId,
      '--lease-epoch', String(leaseEpoch),
      '--path', discoveryPath,
      ...(language ? ['--language', language] : []),
    ]);
    discoveryResult = parseJson(discoveryRes.stdout) || {
      ok: false,
      code: 'ERR_DISCOVERY_RESPONSE',
      message: discoveryRes.stderr || 'Invalid discovery response',
    };
    try {
      discoveryNoWrite = before === discoveryStateSnapshot(config.repoPath, worktreePath, discoveryPath);
    } catch {
      discoveryNoWrite = false;
    }
    if (!discoveryRes.ok || discoveryResult.ok !== true) {
      const reason = String(discoveryResult.message || 'Discovery failed');
      const transition = await transitionFailure(reason);
      return output({ error: transition.ok ? reason : `${reason}; ${transition.error}` });
    }
  }

  try {
    applyFileOperations(worktreePath, config.files, ledger);
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err);
    const transition = await transitionFailure(reason);
    return output({ error: transition.ok ? reason : `${reason}; ${transition.error}` });
  }

  if (config.runTypecheck) {
    const result = runTsc(ledger, worktreePath, ['--noEmit']);
    if (!result.ok) typeErrors++;
  }

  if (config.runTests) {
    try {
      const testMetrics = runTests(ledger, worktreePath, config.testFile);
      typeErrors += testMetrics.typeErrors;
      unitTestsPassed = testMetrics.unitTestsPassed;
      unitTestsTotal = testMetrics.unitTestsTotal;
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      const transition = await transitionFailure(reason);
      return output({ error: transition.ok ? reason : `${reason}; ${transition.error}` });
    }
  }

  // Complete or fail task with retry
  let completionSuccess = false;
  let commitSha: string | undefined;
  let completionError = '';
  if (config.shouldFail) {
    const commitMsg = config.commitMessage || `Failed work for ${taskId}`;
    const addResult = runCommandWithLedger(ledger, 'git', ['add', '.'], worktreePath);
    const commitResult = addResult.ok
      ? runCommandWithLedger(ledger, 'git', ['commit', '--allow-empty', '-m', commitMsg], worktreePath)
      : addResult;
    if (!addResult.ok) completionError = `git add failed: ${addResult.stderr}`;
    else if (!commitResult.ok) completionError = `git commit failed: ${commitResult.stderr}`;
    const transition = await transitionFailure(config.failError || completionError || 'Deliberate worker task failure');
    completionSuccess = transition.ok;
    if (!transition.ok) completionError = completionError || transition.error || 'CLI failure transition failed';
    return output({
      success: false,
      error: completionError || config.failError || 'Deliberate worker task failure',
    });
  } else {
    try {
      recordWaymarkHop(ledger, worktreePath, waymarkTrajectoryId, config.files);
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      const transition = await transitionFailure(reason);
      return output({ error: transition.ok ? reason : `${reason}; ${transition.error}` });
    }
    for (let attempt = 0; attempt < 8; attempt++) {
      completionAttempts = attempt + 1;
      const compRes = execArbiter([
        'complete',
        '--task', taskId,
        '--worker', config.workerId,
        '--answer', `Completed work by ${config.workerId}`,
        '--lease-epoch', String(leaseEpoch),
      ], attempt > 0);
      const compData = compRes.ok ? parseJson(compRes.stdout) : null;
      if (compRes.ok && compData?.ok === true) {
        completionSuccess = true;
        const revision = runCommandWithLedger(ledger, 'git', ['rev-parse', 'HEAD'], worktreePath);
        if (revision.ok) commitSha = revision.stdout.trim();
        else completionError = revision.stderr || 'Unable to read completed task revision';
        break;
      }
      completionError = compRes.stderr || 'CLI completion was not acknowledged';
      if (attempt < 7) await new Promise((r) => setTimeout(r, 80 * Math.pow(1.5, attempt)));
    }
  }

  return output({
    success: completionSuccess,
    commitSha,
    error: completionSuccess ? (completionError || undefined) : (completionError || 'Failed to complete task via CLI'),
  });
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
