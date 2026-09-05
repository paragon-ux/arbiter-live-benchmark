import fs from 'node:fs';
import path from 'node:path';
import { get_encoding, type Tiktoken } from '@dqbd/tiktoken';

let _encoder: Tiktoken | null = null;

function getEncoder(): Tiktoken | null {
  if (!_encoder) {
    try {
      _encoder = get_encoding('cl100k_base');
    } catch {
      _encoder = null;
    }
  }
  return _encoder;
}

/**
 * Live Canonical Token Counter powered by @dqbd/tiktoken (cl100k_base BPE).
 * 
 * Provides authentic, compiled BPE token counts for code, diffs, JSON payloads, and prompts.
 * Falls back gracefully to heuristic character ratio if BPE encoder fails to initialize.
 */
export function countTokens(text: string, charsPerToken: number = 3.8): number {
  if (!text || text.length === 0) return 0;
  const enc = getEncoder();
  if (enc) {
    try {
      return enc.encode(text).length;
    } catch {
      // Fallback if encode errors on unexpected binary/surrogate sequences
    }
  }
  return Math.ceil(text.length / charsPerToken);
}

export function measureTargetTokens(targetDir: string): { totalTokens: number; fileCount: number; bytes: number } {
  let totalBytes = 0;
  let fileCount = 0;
  let combinedText = '';

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === '.arbiter' || entry.name === '.waymark') continue;
        walk(fullPath);
      } else if (entry.isFile()) {
        const content = fs.readFileSync(fullPath, 'utf8');
        combinedText += `\n--- file: ${path.relative(targetDir, fullPath)} ---\n` + content;
        totalBytes += Buffer.byteLength(content, 'utf8');
        fileCount++;
      }
    }
  }

  if (fs.existsSync(targetDir)) {
    walk(targetDir);
  }

  return {
    totalTokens: countTokens(combinedText),
    fileCount,
    bytes: totalBytes
  };
}

export function measureTrajectoryTokens(trajectory: unknown): number {
  const jsonStr = typeof trajectory === 'string' ? trajectory : JSON.stringify(trajectory, null, 2);
  return countTokens(jsonStr);
}
