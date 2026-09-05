#!/usr/bin/env node

/**
 * Claims Registry Validation Script (arbiter-live-benchmark)
 */

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

const claimsFile = resolve(rootDir, 'CLAIMS.md');
const content = readFileSync(claimsFile, 'utf8');

const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
if (!jsonMatch) {
  console.error('Error: No json block found in CLAIMS.md');
  process.exit(1);
}

const claims = JSON.parse(jsonMatch[1]);
let failed = 0;

for (const entry of claims) {
  try {
    const rawOut = execSync(entry.generatingCommand, { cwd: rootDir, encoding: 'utf8' }).trim();
    const numericValue = parseFloat(rawOut);
    if (isNaN(numericValue)) {
      console.error(`Claim "${entry.claim}" produced non-numeric output: "${rawOut}"`);
      failed++;
      continue;
    }

    const expected = entry.expectedValue;
    const tol = entry.tolerancePercent;
    const maxAllowedDiff = expected === 0 ? 0 : (expected * tol) / 100;

    let outsideTolerance = false;
    if (entry.upperBoundOnly) {
      // For ceiling metrics (token consumption, latency, memory), lower is better.
      // Measured values lower than expected represent positive efficiency gains.
      if (numericValue > expected + maxAllowedDiff) {
        outsideTolerance = true;
      }
    } else {
      const diff = Math.abs(numericValue - expected);
      if (diff > maxAllowedDiff) {
        outsideTolerance = true;
      }
    }

    if (outsideTolerance) {
      console.error(
        `Claim "${entry.claim}" value ${numericValue} outside tolerance (expected ${entry.upperBoundOnly ? '<= ' : ''}${expected} ±${tol}%)`
      );
      failed++;
    }
  } catch (err) {
    console.error(`Failed to verify claim "${entry.claim}":`, err.message);
    failed++;
  }
}

if (failed > 0) {
  console.error(`${failed} claims failed validation.`);
  process.exit(1);
}

console.log('All registered claims within tolerance.');
process.exit(0);
