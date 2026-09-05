#!/usr/bin/env node

/**
 * Automated Results Table Generator
 * 
 * Generates and validates the markdown results table in README.md
 * from BASELINE_v2.1.0.json to prevent documentation drift.
 * 
 * Usage:
 *   node scripts/generate-readme-table.mjs --check
 *   node scripts/generate-readme-table.mjs --write
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

const baselinePath = resolve(rootDir, 'BASELINE_v2.1.0.json');
const readmePath = resolve(rootDir, 'README.md');

const SCENARIO_META = {
  '001-single-agent-cold': { mode: 'Cold Exploration Baseline', sla: '2,500ms' },
  '002-single-agent-waymark': { mode: 'Waymark In-Flight Continuity', sla: '1,000ms' },
  '003-parallel-no-isolation': { mode: 'Chaos Baseline (Shared Tree)', sla: '200.0ms' },
  '004-parallel-arbiter': { mode: 'Arbiter Worktree Swarm (3 W)', sla: '8,000ms' },
  '005-dag-dependencies': { mode: '12-Task Topological DAG', sla: '600.0ms' },
  '006-conflict-quarantine': { mode: 'Fail-Closed Merge Quarantine', sla: '4,000ms' },
  '007-watchdog-dead-worker': { mode: 'Zero-Daemon Process Reclaim', sla: '500.0ms' },
  '008-agent-semantic-correctness': { mode: 'Typecheck & Test Pass Rate', sla: '2,000ms' },
  '009-parallel-10-workers': { mode: '10-Worker Atomic CAS Swarm', sla: '25,000ms' },
  '010-cyclic-dag-rejection': { mode: 'Directed Cycle Detection', sla: '250.0ms' },
  '011-concurrent-lease-collision': { mode: 'Atomic CAS Lease & Unique Index', sla: '300.0ms' },
  '012-signal-interrupted-merge': { mode: 'Active Merge Rollback', sla: '2,500ms' },
  '013-waymark-multi-compaction': { mode: '3-Cycle Trajectory Stability', sla: '50.0ms' },
  '014-disk-full-recovery': { mode: 'SQLite Transaction Rollback Recovery', sla: '250.0ms' },
  '015-docker-isolated-overhead': { mode: 'Host Process/Docker Overhead', sla: '1,200ms' },
  '016-naive-mutex-contention': { mode: 'Naive Mutex Contention', sla: '150.0ms' },
  '017-parallel-50-workers': { mode: 'High-Concurrency Scale Swarm', sla: '120,000ms' },
  '018-cross-repo-workspace-dag': { mode: 'Monorepo Workspace Cross-DAG', sla: '500.0ms' },
  '019-n-way-merge-conflicts': { mode: 'N-Way Conflict & Quarantine', sla: '12,000ms' },
  '020-concurrent-main-drift': { mode: 'Upstream Drift Auto-Rebase', sla: '3,000ms' },
  '021-mcp-protocol-resilience': { mode: 'Subprocess MCP Protocol Boundary', sla: '2,500ms' },
  '022-watchdog-heartbeat-stale-reclaim': { mode: 'Watchdog Stale Heartbeat Recovery', sla: '250.0ms' }
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
    '| Scenario | Mode | Median Latency | Baseline SLA | Tokens | Conflicts | Accuracy | Status |',
    '| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |'
  ];

  for (const item of results) {
    const meta = SCENARIO_META[item.scenarioId] || { mode: item.title, sla: 'N/A' };
    const m = item.metrics || {};
    const lat = formatLatency(m.durationMs ?? 0);
    const tok = formatTokens(m.tokensTotal, item.scenarioId);
    const conf = formatConflicts(m.conflictsDetected ?? 0, m.conflictsResolved ?? 0);
    const acc = formatAccuracy(m.accuracyPercent ?? 100);
    const status = item.passed ? '✅ PASS' : '❌ FAIL';

    const idDisplay = `**\`${item.scenarioId}\`**`;
    lines.push(`| ${idDisplay} | ${meta.mode} | ${lat} | ${meta.sla} | ${tok} | ${conf} | ${acc} | ${status} |`);
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
      console.error('Drift detected between README.md and BASELINE_v2.1.0.json!');
      console.error('Run node scripts/generate-readme-table.mjs --write to update.');
      process.exit(1);
    }
    console.log('README results table matches BASELINE_v2.1.0.json (0 drift).');
    process.exit(0);
  }

  // Update README.md
  const updatedReadme = 
    readmeContent.slice(0, beginIdx + beginMarker.length) + 
    '\n' + cleanGenerated + '\n' + 
    readmeContent.slice(endIdx);

  writeFileSync(readmePath, updatedReadme, 'utf8');
  console.log('Updated README.md results table from BASELINE_v2.1.0.json.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
