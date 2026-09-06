import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import { execFileSync as nodeExecFileSync, spawn, spawnSync, type ExecFileSyncOptions } from 'node:child_process';
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

function killProcessTree(pid: number | undefined): void {
  if (!pid) return;
  if (process.platform === 'win32') {
    try {
      nodeExecFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
        timeout: 5_000,
      });
    } catch {}
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try { process.kill(pid, 'SIGTERM'); } catch {}
  }
}

function execFileSync(file: string, args: readonly string[], options: ExecFileSyncOptions = {}): string | Buffer {
  const spawnOptions: ExecFileSyncOptions = {
    timeout: COMMAND_TIMEOUT_MS,
    killSignal: 'SIGTERM',
    ...options,
  };
  if (process.platform !== 'win32') {
    (spawnOptions as ExecFileSyncOptions & { detached?: boolean }).detached = true;
  }
  const result = spawnSync(file, args, spawnOptions);
  if (result.error || result.status !== 0) {
    if (result.signal || (result.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT') {
      killProcessTree(result.pid);
    }
    const error = result.error instanceof Error
      ? result.error
      : new Error(`Command failed: ${file} ${args.join(' ')}`);
    Object.assign(error, {
      stdout: result.stdout,
      stderr: result.stderr,
      status: result.status,
      pid: result.pid,
    });
    throw error;
  }
  return result.stdout as string | Buffer;
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
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_PATH: fs.existsSync(rootNodeModules) ? rootNodeModules : process.env.NODE_PATH,
    };
    if (args.includes('--test')) delete env.NODE_TEST_CONTEXT;
    const output = execFileSync(file, args, {
      cwd,
      windowsHide: true,
      encoding: 'utf8',
      env,
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

function resolveAssignedWorktreePath(repoPath: string, taskId: string, candidate: unknown): string {
  const resolved = resolveWorktreePath(repoPath, candidate);
  const rawTaskId = taskId.startsWith('task-') ? taskId.slice(5) : taskId;
  const safeTaskId = rawTaskId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const expected = canonicalPath(path.join(repoPath, '.arbiter', 'worktrees', `task-${safeTaskId}`));
  if (!isWithin(expected, canonicalPath(resolved), true) || !isWithin(canonicalPath(resolved), expected, true)) {
    throw new Error('Arbiter returned a worktree that is not assigned to the claimed task');
  }
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

function containedParentSegments(worktreePath: string, targetFile: string): string[] {
  const lexicalRoot = path.resolve(worktreePath);
  const relativeParent = path.relative(lexicalRoot, path.dirname(targetFile));
  if (relativeParent === '..' || relativeParent.startsWith(`..${path.sep}`) || path.isAbsolute(relativeParent)) {
    throw new Error('file operation path resolves outside the assigned worktree');
  }
  return relativeParent.split(path.sep).filter(Boolean);
}

function ensureContainedParent(worktreePath: string, targetFile: string): string {
  const root = canonicalPath(worktreePath);

  let current = root;
  for (const segment of containedParentSegments(worktreePath, targetFile)) {
    const candidate = path.join(current, segment);
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(candidate);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      try {
        fs.mkdirSync(candidate);
      } catch (mkdirError: unknown) {
        if ((mkdirError as NodeJS.ErrnoException).code !== 'EEXIST') throw mkdirError;
        stat = fs.lstatSync(candidate);
      }
      stat ??= fs.lstatSync(candidate);
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error('file operation path contains an unsafe parent directory');
    }
    current = canonicalPath(candidate);
    if (!isWithin(root, current, true)) {
      throw new Error('file operation path resolves outside the assigned worktree');
    }
  }
  return current;
}

function openContainedFilePosix(worktreePath: string, targetFile: string, flags: number): number {
  const noFollow = fs.constants.O_NOFOLLOW;
  const directory = fs.constants.O_DIRECTORY;
  if (noFollow === undefined || directory === undefined) throw new Error('secure directory-relative file operations are unavailable');
  const descriptorPath = '/dev/fd';
  const directoryFlags = fs.constants.O_RDONLY | directory | noFollow;
  const parentDescriptors: number[] = [];
  let parentDescriptor = fs.openSync(canonicalPath(worktreePath), directoryFlags);
  parentDescriptors.push(parentDescriptor);
  try {
    for (const segment of containedParentSegments(worktreePath, targetFile)) {
      const childPath = `${descriptorPath}/${parentDescriptor}/${segment}`;
      let childDescriptor: number;
      try {
        childDescriptor = fs.openSync(childPath, directoryFlags);
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT' || (flags & fs.constants.O_CREAT) === 0) throw err;
        fs.mkdirSync(childPath);
        childDescriptor = fs.openSync(childPath, directoryFlags);
      }
      parentDescriptors.push(childDescriptor);
      parentDescriptor = childDescriptor;
    }

    const targetPath = `${descriptorPath}/${parentDescriptor}/${path.basename(targetFile)}`;
    let existed = true;
    try { fs.lstatSync(targetPath); } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      existed = false;
    }
    const exclusiveCreate = !existed && (flags & fs.constants.O_CREAT) !== 0 ? fs.constants.O_EXCL : 0;
    const descriptor = fs.openSync(targetPath, flags | noFollow | exclusiveCreate, 0o600);
    try {
      if (!fs.fstatSync(descriptor).isFile()) throw new Error('file operation path must reference a file');
      return descriptor;
    } catch (err) {
      fs.closeSync(descriptor);
      throw err;
    }
  } finally {
    for (const descriptor of parentDescriptors.reverse()) {
      try { fs.closeSync(descriptor); } catch {}
    }
  }
}

function openContainedFile(worktreePath: string, targetFile: string, flags: number): number {
  if (process.platform !== 'win32') return openContainedFilePosix(worktreePath, targetFile, flags);
  const root = canonicalPath(worktreePath);
  const parent = ensureContainedParent(worktreePath, targetFile);
  const safeTarget = path.join(parent, path.basename(targetFile));
  const existed = fs.existsSync(safeTarget);
  if (existed && fs.lstatSync(safeTarget).isSymbolicLink()) {
    throw new Error('file operation path must not be a symbolic link');
  }
  const noFollow = fs.constants.O_NOFOLLOW;
  const exclusiveCreate = !existed && (flags & fs.constants.O_CREAT) !== 0 ? fs.constants.O_EXCL : 0;
  const descriptor = fs.openSync(safeTarget, flags | (noFollow ?? 0) | exclusiveCreate, 0o600);
  try {
    const actual = canonicalPath(safeTarget);
    if (!isWithin(root, actual) || !fs.fstatSync(descriptor).isFile()) {
      throw new Error('file operation path resolves outside the assigned worktree');
    }
    return descriptor;
  } catch (err) {
    fs.closeSync(descriptor);
    throw err;
  }
}

function deleteContainedFile(worktreePath: string, targetFile: string): void {
  if (!fs.existsSync(path.dirname(targetFile))) return;
  const parent = ensureContainedParent(worktreePath, targetFile);
  const safeTarget = path.join(parent, path.basename(targetFile));
  try {
    const stat = fs.lstatSync(safeTarget);
    if (stat.isDirectory()) throw new Error('delete file operation must reference a file');
    fs.unlinkSync(safeTarget);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

function applyFileOperations(worktreePath: string, files: WorkerFileOperation[] | undefined, ledger: TokenLedger): void {
  for (const op of files || []) {
    const targetFile = resolveContainedPath(worktreePath, op.path, 'file operation path');
    if (op.action === 'delete') {
      deleteContainedFile(worktreePath, targetFile);
    } else if (op.action === 'append' || op.append !== undefined) {
      const content = op.append || '';
      const descriptor = openContainedFile(worktreePath, targetFile, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_APPEND);
      try { fs.writeFileSync(descriptor, content, 'utf8'); } finally { fs.closeSync(descriptor); }
      ledger.add(content, 'content');
    } else {
      const content = op.content || '';
      const descriptor = openContainedFile(worktreePath, targetFile, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC);
      try { fs.writeFileSync(descriptor, content, 'utf8'); } finally { fs.closeSync(descriptor); }
      ledger.add(content, 'content');
    }
  }
}

function runTests(ledger: TokenLedger, worktreePath: string, testFile?: string): { typeErrors: number; unitTestsPassed: number; unitTestsTotal: number } {
  let typeErrors = 0;
  let unitTestsPassed = 0;
  let unitTestsTotal = 0;
  const compile = runTsc(ledger, worktreePath);
  if (!compile.ok) return { typeErrors: 1, unitTestsPassed: 0, unitTestsTotal: 1 };
  const normalizedTestFile = testFile ? resolveTestTarget(worktreePath, testFile) : undefined;
  const testTarget = normalizedTestFile ? ['--test', normalizedTestFile] : ['--test'];
  const testResult = runCommandWithLedger(ledger, process.execPath, testTarget, worktreePath);
  const output = testResult.stdout + testResult.stderr;
  const passMatch = output.match(/# pass (\d+)/);
  const failMatch = output.match(/# fail (\d+)/);
  if (!passMatch || !failMatch) return { typeErrors, unitTestsPassed: 0, unitTestsTotal: 1 };
  unitTestsPassed = parseInt(passMatch[1], 10);
  const failCount = parseInt(failMatch[1], 10);
  unitTestsTotal = unitTestsPassed + failCount;
  if (unitTestsTotal === 0) return { typeErrors, unitTestsPassed: 0, unitTestsTotal: 1 };
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
  const databaseFiles = snapshotTree(databaseDir);
  const sourcePath = resolveContainedPath(worktreePath, relativePath, 'discovery path');
  if (!fs.statSync(sourcePath).isFile()) throw new Error('discovery path must reference a regular file');
  const sourceHash = crypto.createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex');
  const gitStatus = execFileSync('git', ['status', '--porcelain', '--untracked-files=all', '--ignored=all'], {
    cwd: worktreePath,
    windowsHide: true,
    encoding: 'utf8',
  });
  return JSON.stringify({
    sourceHash,
    gitStatus,
    worktreeFiles: snapshotTree(worktreePath),
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
      detached: process.platform !== 'win32',
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
    const completionRequestId = 3;
    let nextRequestId = completionRequestId + 1;
    let failureTransitionRequestId: number | null = null;
    let failureTransitionReason = '';
    let failureTransitionActive = false;
    let settled = false;
    let responseChain = Promise.resolve();
    const ledger = new TokenLedger();

    const send = (msg: JsonRpcMessage) => {
      if (settled || serverProcess.stdin.destroyed) return;
      const jsonStr = JSON.stringify(msg);
      ledger.add(jsonStr, 'request');
      serverProcess.stdin.write(jsonStr + '\n');
    };

    const sendFailureTransition = (reason = failureTransitionReason || config.failError || 'Worker task failure') => {
      if (settled || !claimedTaskId) return;
      failureTransitionActive = true;
      failureTransitionReason = reason;
      failureAttempts += 1;
      failureTransitionRequestId = nextRequestId++;
      send({
        jsonrpc: '2.0',
        id: failureTransitionRequestId,
        method: 'tools/call',
        params: {
          name: 'arbiter_fail_task',
          arguments: {
            task_id: claimedTaskId,
            worker_id: config.workerId,
            error: failureTransitionReason,
          },
        },
      });
    };

    const retryFailureTransition = async (message: string) => {
      if (failureAttempts >= 8) {
        finishFailure(message);
        return;
      }
      await new Promise((r) => setTimeout(r, 80 * Math.pow(1.5, Math.max(0, failureAttempts - 1))));
      sendFailureTransition(failureTransitionReason || message);
    };

    const cleanup = () => {
      try {
        if (!serverProcess.stdin.destroyed) serverProcess.stdin.end();
      } catch {}
      if (!serverProcess.killed) killProcessTree(serverProcess.pid);
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
      if (failureTimeout) clearTimeout(failureTimeout);
      cleanup();
      resolve(result);
    };

    let failureTimeout: NodeJS.Timeout | undefined;
    const finishFailure = (message: string) => {
      finish(output({ error: message, stderr: ledger.stderr || message }));
    };
    const fail = (message: string) => {
      if (claimedTaskId && failureTransitionActive && !settled) return;
      if (claimedTaskId && failureAttempts === 0 && !settled) {
        sendFailureTransition(message);
        failureTimeout = setTimeout(() => {
          if (!settled) finishFailure(message);
        }, COMMAND_TIMEOUT_MS);
        return;
      }
      finishFailure(message);
    };

    const performWork = async (): Promise<void> => {
      if (!worktreePath || !claimedTaskId) throw new Error('MCP claim response did not provide a usable task');
      if (config.crashWithSignal) terminateForTest(config.crashWithSignal);

      if (config.holdLeaseMs && config.holdLeaseMs > 0) {
        await new Promise((r) => setTimeout(r, config.holdLeaseMs));
      }

      if (config.discovery) {
        throw new Error('MCP worker discovery configuration is unsupported; use CLI worker mode');
      }

      applyFileOperations(worktreePath, config.files, ledger);

      if (config.runTypecheck) {
        const result = runTsc(ledger, worktreePath, ['--noEmit']);
        if (!result.ok) {
          typeErrors++;
          throw new Error(`Typecheck failed: ${result.stderr}`);
        }
      }

      if (config.runTests) {
        const testMetrics = runTests(ledger, worktreePath, config.testFile);
        typeErrors += testMetrics.typeErrors;
        unitTestsPassed = testMetrics.unitTestsPassed;
        unitTestsTotal = testMetrics.unitTestsTotal;
        if (testMetrics.typeErrors > 0 || testMetrics.unitTestsTotal < 1 || testMetrics.unitTestsPassed !== testMetrics.unitTestsTotal) {
          throw new Error(`Tests failed: ${testMetrics.unitTestsPassed}/${testMetrics.unitTestsTotal} passed with ${testMetrics.typeErrors} type error(s)`);
        }
      }

      if (config.shouldFail) {
        sendFailureTransition();
        return;
      }

      recordWaymarkHop(ledger, worktreePath, waymarkTrajectoryId, config.files);
      completionAttempts = 1;
      send({
        jsonrpc: '2.0',
        id: completionRequestId,
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
        if (resp.id === failureTransitionRequestId) {
          await retryFailureTransition(`MCP failure transition error for ${claimedTaskId || 'unknown task'}: ${JSON.stringify(resp.error)}`);
          return;
        }
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
        worktreePath = resolveAssignedWorktreePath(config.repoPath, taskId, returnedWorktree);
        const snakeTrajectoryId = parsed.waymark_trajectory_id;
        const camelTrajectoryId = parsed.waymarkTrajectoryId;
        if (typeof snakeTrajectoryId === 'string') waymarkTrajectoryId = snakeTrajectoryId;
        else if (typeof camelTrajectoryId === 'string') waymarkTrajectoryId = camelTrajectoryId;
        else waymarkTrajectoryId = null;
        leaseEpoch = Number(parsed.lease_epoch ?? parsed.leaseEpoch);
        if (!Number.isFinite(leaseEpoch) || !Number.isInteger(leaseEpoch) || leaseEpoch < 1) {
          throw new Error('MCP claim payload did not contain a valid lease epoch');
        }
        try {
          await performWork();
        } catch (err: unknown) {
          fail(err instanceof Error ? err.message : String(err));
        }
        return;
      }

      if (resp.id === completionRequestId) {
        if (failureTransitionActive) return;
        const result = resp.result as { content?: Array<{ text?: string }> } | undefined;
        const text = result?.content?.[0]?.text;
        if (!text) {
          fail('MCP task completion returned no result payload');
          return;
        }
        let resultData: { ok?: boolean };
        try {
          resultData = JSON.parse(text) as { ok?: boolean };
        } catch (err: unknown) {
          fail(`Invalid MCP task completion payload: ${err instanceof Error ? err.message : String(err)}`);
          return;
        }
        if (resultData.ok !== true || !worktreePath) {
          fail('MCP task completion was not acknowledged');
          return;
        }
        const revision = runCommandWithLedger(ledger, 'git', ['rev-parse', 'HEAD'], worktreePath);
        const sha = revision.ok ? revision.stdout.trim() : '';
        if (sha) commitSha = sha;
        finish(output({ success: true, commitSha }));
        return;
      }

      if (resp.id === failureTransitionRequestId) {
        const result = resp.result as { content?: Array<{ text?: string }> } | undefined;
        const text = result?.content?.[0]?.text;
        if (!text) {
          await retryFailureTransition('MCP task transition returned no result payload');
          return;
        }
        let resultData: { ok?: boolean };
        try {
          resultData = JSON.parse(text) as { ok?: boolean };
        } catch (err: unknown) {
          const message = `Invalid MCP task transition payload: ${err instanceof Error ? err.message : String(err)}`;
          await retryFailureTransition(message);
          return;
        }
        if (resultData.ok !== true) {
          const message = `MCP task transition failed for ${claimedTaskId || 'unknown task'}`;
          await retryFailureTransition(message);
          return;
        }
        if (!config.shouldFail && worktreePath) {
          const revision = runCommandWithLedger(ledger, 'git', ['rev-parse', 'HEAD'], worktreePath);
          if (revision.ok) commitSha = revision.stdout.trim();
        }
        finish(output({
          success: !failureTransitionActive,
          error: failureTransitionActive ? failureTransitionReason : undefined,
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
        const resolvedWorktree = resolveAssignedWorktreePath(config.repoPath, candidateTaskId, candidateWorktree);
        const rawLeaseEpoch = parsed?.leaseEpoch ?? parsed?.lease_epoch;
        const parsedLeaseEpoch = Number(rawLeaseEpoch);
        if (!Number.isFinite(parsedLeaseEpoch) || !Number.isInteger(parsedLeaseEpoch) || parsedLeaseEpoch < 1) {
          throw new Error('Arbiter claim returned no valid lease epoch');
        }
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
  const snakeTrajectoryId = claimData.waymark_trajectory_id;
  const camelTrajectoryId = claimData.waymarkTrajectoryId;
  let waymarkTrajectoryId: string | undefined;
  if (typeof snakeTrajectoryId === 'string') waymarkTrajectoryId = snakeTrajectoryId;
  else if (typeof camelTrajectoryId === 'string') waymarkTrajectoryId = camelTrajectoryId;
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
    try {
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
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
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
    if (!result.ok) {
      typeErrors++;
      const reason = `Typecheck failed: ${result.stderr}`;
      const transition = await transitionFailure(reason);
      return output({ error: transition.ok ? reason : `${reason}; ${transition.error}` });
    }
  }

  if (config.runTests) {
    try {
      const testMetrics = runTests(ledger, worktreePath, config.testFile);
      typeErrors += testMetrics.typeErrors;
      unitTestsPassed = testMetrics.unitTestsPassed;
      unitTestsTotal = testMetrics.unitTestsTotal;
      if (testMetrics.typeErrors > 0 || testMetrics.unitTestsTotal < 1 || testMetrics.unitTestsPassed !== testMetrics.unitTestsTotal) {
        const reason = `Tests failed: ${testMetrics.unitTestsPassed}/${testMetrics.unitTestsTotal} passed with ${testMetrics.typeErrors} type error(s)`;
        const transition = await transitionFailure(reason);
        return output({ error: transition.ok ? reason : `${reason}; ${transition.error}` });
      }
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
    const transition = await transitionFailure(config.failError || 'Deliberate worker task failure');
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
        completionError = '';
        const revision = runCommandWithLedger(ledger, 'git', ['rev-parse', 'HEAD'], worktreePath);
        const sha = revision.ok ? revision.stdout.trim() : '';
        if (sha) commitSha = sha;
        break;
      }
      completionError = compRes.stderr || 'CLI completion was not acknowledged';
      if (attempt < 7) await new Promise((r) => setTimeout(r, 80 * Math.pow(1.5, attempt)));
    }
    if (!completionSuccess) {
      const statusRes = execArbiter(['status', '--task', taskId], true);
      const statusData = statusRes.ok ? parseJson(statusRes.stdout) : null;
      const statusTask = statusData?.task && typeof statusData.task === 'object'
        ? statusData.task as Record<string, unknown>
        : undefined;
      if (statusTask?.status === 'COMPLETED') {
        completionSuccess = true;
        completionError = '';
        const revision = runCommandWithLedger(ledger, 'git', ['rev-parse', 'HEAD'], worktreePath);
        const sha = revision.ok ? revision.stdout.trim() : '';
        if (sha) commitSha = sha;
      }
    }
  }

  return output({
    success: completionSuccess,
    commitSha,
    error: completionSuccess ? (completionError || undefined) : (completionError || 'Failed to complete task via CLI'),
  });
}

function validateConfigRelativePath(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '' || value.includes('\0') || path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\')) {
    throw new Error(`${label} must be a non-empty relative path`);
  }
  const root = path.resolve('__worker_config_root__');
  const resolved = path.resolve(root, value);
  if (!isWithin(root, resolved, true)) throw new Error(`${label} escapes the assigned worktree`);
  return value;
}

function parseWorkerConfig(value: unknown): WorkerTaskConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Worker configuration must be a JSON object');
  const config = value as Record<string, unknown>;
  if (typeof config.workerId !== 'string' || config.workerId.trim() === '') throw new Error('Worker configuration requires workerId');
  if (typeof config.repoPath !== 'string' || config.repoPath.trim() === '') throw new Error('Worker configuration requires repoPath');
  if (config.mode !== 'mcp' && config.mode !== 'cli') throw new Error('Worker configuration mode must be mcp or cli');

  const normalized: WorkerTaskConfig = {
    workerId: config.workerId.trim(),
    repoPath: config.repoPath,
    mode: config.mode,
  };

  if (config.taskId !== undefined) {
    if (typeof config.taskId !== 'string' || config.taskId.trim() === '') throw new Error('Worker configuration taskId must be a non-empty string');
    normalized.taskId = config.taskId;
  }
  if (config.files !== undefined) {
    if (!Array.isArray(config.files)) throw new Error('Worker configuration files must be an array');
    normalized.files = config.files.map((value, index) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Worker file operation ${index} must be an object`);
      const operation = value as Record<string, unknown>;
      const file: WorkerFileOperation = {
        path: validateConfigRelativePath(operation.path, `Worker file operation ${index} path`),
      };
      const action = operation.action === undefined ? 'write' : operation.action;
      if (action !== 'write' && action !== 'append' && action !== 'delete') throw new Error(`Worker file operation ${index} action is invalid`);
      file.action = action;
      if (operation.content !== undefined && typeof operation.content !== 'string') throw new Error(`Worker file operation ${index} content must be a string`);
      if (operation.append !== undefined && typeof operation.append !== 'string') throw new Error(`Worker file operation ${index} append must be a string`);
      if (operation.content !== undefined && operation.append !== undefined) throw new Error(`Worker file operation ${index} cannot specify both content and append`);
      if (operation.content !== undefined) file.content = operation.content;
      if (operation.append !== undefined) file.append = operation.append;
      return file;
    });
  }
  for (const key of ['commitMessage', 'failError'] as const) {
    const candidate = config[key];
    if (candidate !== undefined && typeof candidate !== 'string') throw new Error(`Worker configuration ${key} must be a string`);
    if (typeof candidate === 'string') normalized[key] = candidate;
  }
  for (const key of ['runTypecheck', 'runTests', 'shouldFail'] as const) {
    const candidate = config[key];
    if (candidate !== undefined && typeof candidate !== 'boolean') throw new Error(`Worker configuration ${key} must be boolean`);
    if (typeof candidate === 'boolean') normalized[key] = candidate;
  }
  if (config.testFile !== undefined) normalized.testFile = validateConfigRelativePath(config.testFile, 'Worker testFile');
  if (config.crashWithSignal !== undefined) {
    if (config.crashWithSignal !== 'SIGKILL' && config.crashWithSignal !== 'SIGTERM') throw new Error('Worker configuration crashWithSignal is invalid');
    normalized.crashWithSignal = config.crashWithSignal;
  }
  if (config.holdLeaseMs !== undefined) {
    if (typeof config.holdLeaseMs !== 'number' || !Number.isFinite(config.holdLeaseMs) || !Number.isInteger(config.holdLeaseMs) || config.holdLeaseMs < 0 || config.holdLeaseMs > MCP_TIMEOUT_MS) {
      throw new Error(`Worker configuration holdLeaseMs must be an integer from 0 to ${MCP_TIMEOUT_MS}`);
    }
    normalized.holdLeaseMs = config.holdLeaseMs;
  }
  if (config.discovery !== undefined) {
    if (!config.discovery || typeof config.discovery !== 'object' || Array.isArray(config.discovery)) throw new Error('Worker configuration discovery must be an object');
    const discovery = config.discovery as Record<string, unknown>;
    const parsedDiscovery: DiscoveryRequest = { path: validateConfigRelativePath(discovery.path, 'Worker discovery path') };
    if (discovery.language !== undefined) {
      if (typeof discovery.language !== 'string' || discovery.language.trim() === '') throw new Error('Worker discovery language must be a non-empty string');
      parsedDiscovery.language = discovery.language.trim();
    }
    normalized.discovery = parsedDiscovery;
  }
  return normalized;
}

async function main(): Promise<void> {
  const payloadArg = process.argv[2] || process.env.ARBITER_WORKER_PAYLOAD;
  if (!payloadArg) {
    console.error('WorkerProcess error: No configuration payload provided.');
    process.exitCode = 1;
    return;
  }

  let config: WorkerTaskConfig | undefined;
  try {
    config = parseWorkerConfig(JSON.parse(payloadArg));
  } catch (err) {
    console.error('WorkerProcess error: Invalid JSON payload:', err);
    process.exitCode = 1;
    return;
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
    process.exitCode = result.success ? 0 : 1;
  } catch (err) {
    console.error(JSON.stringify({
      pid: process.pid,
      workerId: config?.workerId || 'unknown',
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main();
}
