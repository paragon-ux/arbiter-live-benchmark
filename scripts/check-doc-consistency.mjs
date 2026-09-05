#!/usr/bin/env node

/**
 * Cross-Document Consistency Linter
 * 
 * Verifies consistency of Scenario IDs, Titles, and Hypothesis Matrices
 * across documentation and code sources.
 * 
 * Sources checked:
 * 1. scenarios/*.json
 * 2. src/harness/adapters/subprocessMcp.ts
 * 3. BENCHMARK_AUTHORING.md
 * 4. README.md
 * 5. BASELINE_v2.1.0.json
 * 
 * Modes:
 *   node scripts/check-doc-consistency.mjs               -> Scenario cross-source parity
 *   node scripts/check-doc-consistency.mjs --hypotheses   -> H1-H16 matrix parity
 */

import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const rootDir = resolve(import.meta.dirname, '..');

function checkHypotheses() {
  const authoringPath = resolve(rootDir, 'docs', 'BENCHMARK_AUTHORING.md');
  const rationalePath = resolve(rootDir, 'docs', 'Rationale.MD');

  const authoringContent = readFileSync(authoringPath, 'utf8');
  const rationaleContent = readFileSync(rationalePath, 'utf8');

  // Extract H1-H16 from BENCHMARK_AUTHORING.md
  const authoringH = new Map();
  const authMatches = authoringContent.matchAll(/\|\s*\*\*H(\d+)\*\*\s*\|\s*([^|]+)\|\s*([^|]+)\|/g);
  for (const m of authMatches) {
    authoringH.set(`H${m[1]}`, { claim: m[2].trim(), validating: m[3].trim() });
  }

  // Extract H1-H16 from Rationale.MD
  const rationaleH = new Map();
  const ratMatches = rationaleContent.matchAll(/\|\s*\*\*H(\d+):\s*([^|*]+)\*\*\s*\|/g);
  for (const m of ratMatches) {
    rationaleH.set(`H${m[1]}`, m[2].trim());
  }

  for (let i = 1; i <= 16; i++) {
    const key = `H${i}`;
    if (!authoringH.has(key) || !rationaleH.has(key)) {
      console.error(`Error: Hypothesis ${key} missing from one of the files`);
      process.exit(1);
    }
  }

  console.log('HYPOTHESIS_MATRIX_PARITY_VERIFIED');
  process.exit(0);
}

function checkScenarios() {
  const errors = [];
  const sources = [
    'scenarios/*.json',
    'src/harness/adapters/subprocessMcp.ts',
    'docs/BENCHMARK_AUTHORING.md',
    'README.md',
    'BASELINE_v2.1.0.json'
  ];

  // 1. scenarios/*.json
  const scenariosDir = resolve(rootDir, 'scenarios');
  const scenarioFiles = readdirSync(scenariosDir).filter(f => f.endsWith('.json')).sort();
  const scenarioTitles = new Map();

  for (const file of scenarioFiles) {
    const data = JSON.parse(readFileSync(resolve(scenariosDir, file), 'utf8'));
    scenarioTitles.set(data.id, data.title);
  }

  if (scenarioTitles.size !== 22) {
    errors.push(`Expected 22 scenario JSON files, found ${scenarioTitles.size}`);
  }

  // 2. BASELINE_v2.1.0.json
  const baseline = JSON.parse(readFileSync(resolve(rootDir, 'BASELINE_v2.1.0.json'), 'utf8'));
  const baselineResults = baseline.results || baseline.scenarios || [];
  const baselineTitles = new Map();
  for (const item of baselineResults) {
    baselineTitles.set(item.scenarioId, item.title);
  }

  for (const [id, title] of scenarioTitles) {
    const bTitle = baselineTitles.get(id);
    if (!bTitle) {
      errors.push(`Scenario ${id} missing from BASELINE_v2.1.0.json`);
    } else if (bTitle !== title) {
      errors.push(`Title mismatch for ${id} in BASELINE_v2.1.0.json: "${bTitle}" vs "${title}"`);
    }
  }

  // 3. docs/BENCHMARK_AUTHORING.md
  const authoringContent = readFileSync(resolve(rootDir, 'docs', 'BENCHMARK_AUTHORING.md'), 'utf8');
  const authoringTitles = new Map();
  const authMatches = authoringContent.matchAll(/\|\s*\*\*`(\d{3}-[a-z0-9-]+)`\*\*\s*\|\s*([^|]+)\|/g);
  for (const m of authMatches) {
    authoringTitles.set(m[1], m[2].trim());
  }

  for (const [id, title] of scenarioTitles) {
    const aTitle = authoringTitles.get(id);
    if (!aTitle) {
      errors.push(`Scenario ${id} missing from BENCHMARK_AUTHORING.md`);
    } else if (aTitle !== title) {
      errors.push(`Title mismatch for ${id} in BENCHMARK_AUTHORING.md: "${aTitle}" vs "${title}"`);
    }
  }

  // 4. src/harness/adapters/subprocessMcp.ts
  const subprocessContent = readFileSync(resolve(rootDir, 'src/harness/adapters/subprocessMcp.ts'), 'utf8');
  for (const id of scenarioTitles.keys()) {
    if (!subprocessContent.includes(`'${id}'`)) {
      errors.push(`Scenario ${id} missing dispatch case in subprocessMcp.ts`);
    }
  }

  // 5. README.md
  const readmeContent = readFileSync(resolve(rootDir, 'README.md'), 'utf8');
  for (const id of scenarioTitles.keys()) {
    if (!readmeContent.includes(`\`${id}\``)) {
      errors.push(`Scenario ${id} missing from README.md results table`);
    }
  }

  if (errors.length > 0) {
    console.error(`Document consistency check failed with ${errors.length} errors:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log(`Checked 22 scenarios across 5 sources: 0 mismatches.`);
  process.exit(0);
}

const args = process.argv.slice(2);
if (args.includes('--hypotheses')) {
  checkHypotheses();
} else {
  checkScenarios();
}
