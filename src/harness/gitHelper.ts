import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

let gitWarmedUp = false;
export function warmupGit(): void {
  if (gitWarmedUp) return;
  try {
    execFileSync('git', ['--version'], { windowsHide: true });
    gitWarmedUp = true;
  } catch {}
}

export function copyRecursive(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.arbiter' || entry.name === '.waymark') {
      continue;
    }
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

export function createTempGitRepo(targetSourceDir?: string): { repoPath: string; cleanup: () => void } {
  warmupGit();
  const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'arbiter-bench-live-'));
  
  execFileSync('git', ['init', '-b', 'main'], { cwd: repoPath, windowsHide: true });
  execFileSync('git', ['config', 'core.autocrlf', 'false'], { cwd: repoPath, windowsHide: true });
  execFileSync('git', ['config', 'user.name', 'Arbiter Live Benchmark'], { cwd: repoPath, windowsHide: true });
  execFileSync('git', ['config', 'user.email', 'benchmark@arbiter.live'], { cwd: repoPath, windowsHide: true });

  fs.writeFileSync(path.join(repoPath, '.gitignore'), '.arbiter/\n.waymark/\nnode_modules/\n', 'utf8');
  fs.writeFileSync(path.join(repoPath, 'README.md'), '# Arbiter Live Benchmark Repository\n', 'utf8');

  if (targetSourceDir && fs.existsSync(targetSourceDir)) {
    copyRecursive(targetSourceDir, repoPath);
  }

  execFileSync('git', ['add', '.'], { cwd: repoPath, windowsHide: true });
  execFileSync('git', ['commit', '-m', 'Initial benchmark repository commit'], { cwd: repoPath, windowsHide: true });

  const cleanup = () => {
    const cleanupErrors: string[] = [];
    try {
      const worktreeOutput = execFileSync('git', ['worktree', 'list', '--porcelain'], {
        cwd: repoPath,
        windowsHide: true,
        encoding: 'utf8',
      });
      const canonicalPath = (candidate: string): string => {
        const resolved = path.resolve(candidate);
        try { return fs.realpathSync.native(resolved); } catch { return resolved; }
      };
      const root = canonicalPath(repoPath);
      const worktreePaths = worktreeOutput
        .split(/\r?\n/)
        .filter((line) => line.startsWith('worktree '))
        .map((line) => line.slice('worktree '.length).trim())
        .filter((worktreePath) => canonicalPath(worktreePath) !== root);
      for (const worktreePath of worktreePaths) {
        try {
          execFileSync('git', ['worktree', 'remove', '--force', worktreePath], { cwd: repoPath, windowsHide: true });
        } catch (err: unknown) {
          cleanupErrors.push(`worktree remove ${worktreePath}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      try {
        execFileSync('git', ['worktree', 'prune'], { cwd: repoPath, windowsHide: true });
      } catch (err: unknown) {
        cleanupErrors.push(`worktree prune: ${err instanceof Error ? err.message : String(err)}`);
      }
    } catch (err: unknown) {
      cleanupErrors.push(`worktree enumeration: ${err instanceof Error ? err.message : String(err)}`);
    }
    try {
      fs.rmSync(repoPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch (err: unknown) {
      cleanupErrors.push(`repository removal: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (cleanupErrors.length > 0) {
      throw new Error(`Temporary repository cleanup failed: ${cleanupErrors.join('; ')}`);
    }
  };

  return { repoPath, cleanup };
}
