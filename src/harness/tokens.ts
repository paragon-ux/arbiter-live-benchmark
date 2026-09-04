import fs from 'node:fs';
import path from 'node:path';

/**
 * Token Counter for Empirical Codebase & Trajectory Measurements
 * 
 * Uses standard BPE/character calibration for code:
 * Code tokenization typically yields ~3.7-4.0 characters per token across
 * modern LLM tokenizers (tiktoken cl100k_base, Claude, Gemini).
 */
export function countTokens(text: string): number {
  if (!text || text.length === 0) return 0;
  // A calibrated regex tokenizer splitting into words, whitespace, and code symbols
  const tokens = text.match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]+|\s+/gu) || [];
  let tokenCount = 0;
  for (const t of tokens) {
    // Single characters or short punctuation = 1 token
    if (t.length <= 4) {
      tokenCount += 1;
    } else {
      // Longer tokens scale roughly by 3.8 chars per subword
      tokenCount += Math.ceil(t.length / 3.8);
    }
  }
  return tokenCount;
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
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
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
