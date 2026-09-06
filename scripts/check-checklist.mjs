#!/usr/bin/env node

/**
 * Checklist Audit Gate (Arbiter & Benchmark)
 * 
 * Verifies that all checked items [x] in REMEDIATION_AND_ANTI_REGRESSION_CHECKLIST.md
 * have valid status and referencing files in the repository.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const rootDir = resolve(import.meta.dirname, '..');
const packageData = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8'));
const currentVersion = String(packageData.version);
const parseVersion = (value) => String(value).split('.').slice(0, 3).map((part) => Number.parseInt(part, 10));
const isVersionAtMost = (candidate, current) => {
  const candidateParts = parseVersion(candidate);
  const currentParts = parseVersion(current);
  if (candidateParts.some((part) => !Number.isInteger(part)) || currentParts.some((part) => !Number.isInteger(part))) return false;
  for (let index = 0; index < 3; index++) {
    if (candidateParts[index] !== currentParts[index]) return candidateParts[index] < currentParts[index];
  }
  return true;
};
const historicalVersions = ['2.3.0', '2.1.0'].filter((version) => isVersionAtMost(version, currentVersion));
const versionedCandidates = historicalVersions.flatMap((version) => [
  resolve(rootDir, 'docs', version, 'REMEDIATION_AND_ANTI_REGRESSION_CHECKLIST.md'),
  resolve(rootDir, version, 'REMEDIATION_AND_ANTI_REGRESSION_CHECKLIST.md'),
  resolve(rootDir, '..', version, 'REMEDIATION_AND_ANTI_REGRESSION_CHECKLIST.md'),
  resolve(rootDir, '..', 'docs', version, 'REMEDIATION_AND_ANTI_REGRESSION_CHECKLIST.md'),
]);
const candidates = [
  resolve(rootDir, 'REMEDIATION_AND_ANTI_REGRESSION_CHECKLIST.md'),
  resolve(rootDir, 'docs', currentVersion, 'REMEDIATION_AND_ANTI_REGRESSION_CHECKLIST.md'),
  ...versionedCandidates,
  resolve(rootDir, 'docs', 'REMEDIATION_AND_ANTI_REGRESSION_CHECKLIST.md'),
  resolve(rootDir, '..', 'REMEDIATION_AND_ANTI_REGRESSION_CHECKLIST.md'),
  resolve(rootDir, '..', 'docs', 'REMEDIATION_AND_ANTI_REGRESSION_CHECKLIST.md')
];
const checklistPath = candidates.find(existsSync);

if (!checklistPath) {
  console.log('Checklist file not found in local paths; skipping checklist audit in isolated CI.');
  process.exit(0);
}

const content = readFileSync(checklistPath, 'utf8');
const seqBlocks = content.split(/###\s*\[(SEQ-\d+)\]/g);

let checkedCount = 0;
let errors = 0;

function verifyScopeFiles(body, seqId) {
  const scopeMatch = body.match(/- \*\*Scope:\*\*\s*`([^`]+)`\s*\(([^)]+)\)/);
  if (!scopeMatch) return true;

  const repoName = scopeMatch[1].trim();
  const filesStr = scopeMatch[2];
  const files = [...filesStr.matchAll(/`([^`]+)`/g)].map(m => m[1]);

  let repoRoot = rootDir;
  if (repoName === 'Arbiter') {
    repoRoot = resolve(rootDir, '..', 'Arbiter');
    if (!existsSync(repoRoot)) repoRoot = resolve(rootDir, 'Arbiter');
  } else if (repoName === 'arbiter-live-benchmark') {
    repoRoot = resolve(rootDir, '..', 'arbiter-live-benchmark');
    if (!existsSync(repoRoot)) repoRoot = resolve(rootDir);
  }

  let ok = true;
  for (const f of files) {
    const cleanPath = f.split(/[,*]/)[0].trim();
    if (!cleanPath) continue;
    const absPath = resolve(repoRoot, cleanPath);
    if (!existsSync(absPath)) {
      console.error(`[${seqId}] Referenced scope file missing: ${cleanPath} (in ${absPath})`);
      ok = false;
    }
  }
  return ok;
}

function verifyTestFileExists(body, seqId) {
  const testMatch = body.match(/(?:dist\/test|test)\/([a-zA-Z0-9_-]+\.test\.(?:js|ts))/);
  if (!testMatch) return true;
  const testFileName = testMatch[1].replace(/\.js$/, '.ts');
  const candidates = [
    resolve(rootDir, 'test', testFileName),
    resolve(rootDir, '..', 'Arbiter', 'test', testFileName),
    resolve(rootDir, '..', 'arbiter-live-benchmark', 'test', testFileName),
  ];
  const exists = candidates.some(existsSync);
  if (!exists) {
    console.error(`[${seqId}] Referenced test file missing from repository: ${testFileName}`);
    return false;
  }
  return true;
}

for (let i = 1; i < seqBlocks.length; i += 2) {
  const seqId = seqBlocks[i];
  const body = seqBlocks[i + 1] || '';

  const isChecked = /- \[[xX]\]\s*\*\*Status:\*\*/.test(body);
  if (isChecked) {
    checkedCount++;
    // 1. Verify verification command exists in body
    if (!body.includes('```bash')) {
      console.error(`[${seqId}] Checked item lacks verification command block`);
      errors++;
    }
    // 2. Verify expected output block exists in body
    if (!body.includes('Expected Output:')) {
      console.error(`[${seqId}] Checked item lacks Expected Output block`);
      errors++;
    }
    // 3. Verify scope files exist on disk
    if (!verifyScopeFiles(body, seqId)) {
      errors++;
    }
    // 4. Verify test files exist on disk
    if (!verifyTestFileExists(body, seqId)) {
      errors++;
    }
  }
}

if (errors > 0) {
  console.error(`Checklist audit failed with ${errors} errors across ${checkedCount} checked items.`);
  process.exit(1);
}

console.log(`All checked items verified against live repository state (${checkedCount} checked items audited).`);
process.exit(0);
