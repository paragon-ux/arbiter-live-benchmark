#!/usr/bin/env node

/**
 * Automated Results Table Generator
 * 
 * Generates and validates the markdown results table in README.md
 * from the current versioned baseline to prevent documentation drift.
 * 
 * Usage:
 *   node scripts/generate-readme-table.mjs --check
 *   node scripts/generate-readme-table.mjs --write
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveBaselinePath } from './baseline-path.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

const baselinePath = resolveBaselinePath(rootDir);
const baselineFile = basename(baselinePath);
const readmePath = resolve(rootDir, 'README.md');

const SCENARIO_META = {
  '001-single-agent-cold': { mode: 'Cold Exploration Baseline' },
  '002-single-agent-waymark': { mode: 'Waymark In-Flight Continuity' },
  '003-parallel-no-isolation': { mode: 'Chaos Baseline (Shared Tree)' },
  '004-parallel-arbiter': { mode: 'Arbiter Worktree Swarm (3 W)' },
  '005-dag-dependencies': { mode: '12-Task Topological DAG' },
  '006-conflict-quarantine': { mode: 'Fail-Closed Merge Quarantine' },
  '007-watchdog-dead-worker': { mode: 'Zero-Daemon Process Reclaim' },
  '008-agent-semantic-correctness': { mode: 'Typecheck & Test Pass Rate' },
  '009-parallel-10-workers': { mode: '10-Worker Atomic CAS Swarm' },
  '010-cyclic-dag-rejection': { mode: 'Directed Cycle Detection' },
  '011-concurrent-lease-collision': { mode: 'Atomic CAS Lease & Unique Index' },
  '012-signal-interrupted-merge': { mode: 'Active Merge Rollback' },
  '013-waymark-multi-compaction': { mode: '3-Cycle Trajectory Stability' },
  '014-disk-full-recovery': { mode: 'SQLite Transaction Rollback Recovery' },
  '015-docker-isolated-overhead': { mode: 'Host Process/Docker Overhead' },
  '016-naive-mutex-contention': { mode: 'Naive Mutex Contention' },
  '017-parallel-50-workers': { mode: 'High-Concurrency Scale Swarm' },
  '018-cross-repo-workspace-dag': { mode: 'Monorepo Workspace Cross-DAG' },
  '019-n-way-merge-conflicts': { mode: 'N-Way Conflict & Quarantine' },
  '020-concurrent-main-drift': { mode: 'Upstream Drift Auto-Rebase' },
  '021-mcp-protocol-resilience': { mode: 'Subprocess MCP Protocol Boundary' },
  '022-watchdog-heartbeat-stale-reclaim': { mode: 'Watchdog Stale Heartbeat Recovery' },
  '023-symbol-discovery': { mode: 'Structured AST Symbol Discovery' }
};

export function formatLatency(durationMs) {
  if (durationMs < 100 && durationMs % 1 !== 0) {
    return `~${durationMs.toFixed(1)}ms`;
  }
  return `~${Math.round(durationMs).toLocaleString()}ms`;
}

export function formatTokens(tokensTotal, scenarioId) {
  if (tokensTotal === 0 || tokensTotal === null || tokensTotal === undefined) {
    return 'N/A';
  }
  const formatted = tokensTotal.toLocaleString();
  if (scenarioId === '002-single-agent-waymark') {
    return `**${formatted}**`;
  }
  return formatted;
}

export function formatConflicts(detected, resolved) {
  if (detected === 0) return '0';
  return `${detected} (${resolved} resolved)`;
}

export function formatAccuracy(accuracyPercent) {
  if (accuracyPercent >= 95) {
    return `**${accuracyPercent}%**`;
  }
  return `${accuracyPercent}%`;
}

export function generateTable(baseline) {
  const results = baseline.results || baseline.scenarios || [];
  const lines = [
    '| Scenario | Mode | Median Latency | Tokens | Conflicts | Accuracy | Status |',
    '| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |'
  ];

  for (const item of results) {
    const meta = SCENARIO_META[item.scenarioId] || { mode: item.title };
    const m = item.metrics || {};
    const lat = formatLatency(m.durationMs ?? 0);
    const tok = formatTokens(m.tokensTotal, item.scenarioId);
    const conf = formatConflicts(m.conflictsDetected ?? 0, m.conflictsResolved ?? 0);
    const acc = formatAccuracy(m.accuracyPercent ?? 100);
    const status = item.passed ? '✅ PASS' : '❌ FAIL';

    const idDisplay = `**\`${item.scenarioId}\`**`;
    lines.push(`| ${idDisplay} | ${meta.mode} | ${lat} | ${tok} | ${conf} | ${acc} | ${status} |`);
  }

  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const isCheck = args.includes('--check');

  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  const generatedTable = generateTable(baseline);

  const readmeContent = readFileSync(readmePath, 'utf8');
  const beginMarker = '<!-- BEGIN:RESULTS_TABLE -->';
  const endMarker = '<!-- END:RESULTS_TABLE -->';

  const beginIdx = readmeContent.indexOf(beginMarker);
  const endIdx = readmeContent.indexOf(endMarker);

  if (beginIdx === -1 || endIdx === -1) {
    console.error('Error: Markers <!-- BEGIN:RESULTS_TABLE --> or <!-- END:RESULTS_TABLE --> not found in README.md');
    process.exit(1);
  }

  const existingTable = readmeContent.slice(beginIdx + beginMarker.length, endIdx).trim();
  const cleanGenerated = generatedTable.trim();

  if (isCheck) {
    if (existingTable.replace(/\r\n/g, '\n') !== cleanGenerated.replace(/\r\n/g, '\n')) {
      console.error(`Drift detected between README.md and ${baselineFile}!`);
      console.error('Run node scripts/generate-readme-table.mjs --write to update.');
      process.exit(1);
    }
    console.log(`README results table matches ${baselineFile} (0 drift).`);
    process.exit(0);
  }

  // Update README.md
  const updatedReadme = 
    readmeContent.slice(0, beginIdx + beginMarker.length) + 
    '\n' + cleanGenerated + '\n' + 
    readmeContent.slice(endIdx);

  writeFileSync(readmePath, updatedReadme, 'utf8');
  console.log(`Updated README.md results table from ${baselineFile}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
