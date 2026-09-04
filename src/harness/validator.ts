import fs from 'node:fs';
import path from 'node:path';

export const VALID_SCENARIO_MODES = [
  'cold',
  'waymark',
  'unisolated_chaos',
  'arbiter_swarm',
  'dag_scheduling',
  'conflict_quarantine',
  'watchdog_recovery',
  'refactor',
  'parallel',
  'dag',
  'lease',
  'merge',
  'continuity',
  'fault_injection',
  'docker_comparative',
  'naive_mutex_comparative',
  'arbiter_swarm_50',
  'monorepo_dag',
  'n_way_merge_conflicts',
  'concurrent_main_drift',
  'mcp_protocol',
  'stale_heartbeat'
] as const;

export type ValidScenarioMode = typeof VALID_SCENARIO_MODES[number];

export interface ValidationIssue {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

/**
 * Strict Zero-Dependency Scenario Validator
 * Asserts structural schema, physical target directory existence, known execution modes,
 * and valid task / metric boundaries.
 */
export function validateScenario(data: unknown, rootDir: string, filename?: string): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {
      valid: false,
      issues: [{ field: 'root', message: 'Scenario must be a non-null object' }]
    };
  }

  const obj = data as Record<string, unknown>;

  // 1. id
  if (typeof obj.id !== 'string' || !/^\d{3}-[\w-]+$/.test(obj.id)) {
    issues.push({ field: 'id', message: `Invalid scenario id format: ${String(obj.id)}` });
  } else if (filename) {
    const expectedId = filename.replace(/\.json$/, '');
    if (obj.id !== expectedId) {
      issues.push({ field: 'id', message: `Scenario id "${obj.id}" does not match filename "${filename}"` });
    }
  }

  // 2. title & description
  if (typeof obj.title !== 'string' || obj.title.trim().length === 0) {
    issues.push({ field: 'title', message: 'Scenario title must be a non-empty string' });
  }
  if (typeof obj.description !== 'string' || obj.description.trim().length === 0) {
    issues.push({ field: 'description', message: 'Scenario description must be a non-empty string' });
  }

  // 3. targetRepo (must exist on disk as a directory)
  if (typeof obj.targetRepo !== 'string' || obj.targetRepo.trim().length === 0) {
    issues.push({ field: 'targetRepo', message: 'targetRepo must be a non-empty string' });
  } else {
    const resolvedPath = path.resolve(rootDir, obj.targetRepo);
    if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isDirectory()) {
      issues.push({ field: 'targetRepo', message: `targetRepo path does not exist or is not a directory: ${obj.targetRepo}` });
    }
  }

  // 4. mode
  if (typeof obj.mode !== 'string' || !VALID_SCENARIO_MODES.includes(obj.mode as ValidScenarioMode)) {
    issues.push({ field: 'mode', message: `mode "${String(obj.mode)}" is not a known scenario mode. Allowed: ${VALID_SCENARIO_MODES.join(', ')}` });
  }

  // 5. concurrency / workersCount
  if (obj.concurrency !== undefined) {
    if (typeof obj.concurrency !== 'number' || !Number.isInteger(obj.concurrency) || obj.concurrency <= 0) {
      issues.push({ field: 'concurrency', message: 'concurrency must be a positive integer' });
    }
  }
  if (obj.workersCount !== undefined) {
    if (typeof obj.workersCount !== 'number' || !Number.isInteger(obj.workersCount) || obj.workersCount <= 0) {
      issues.push({ field: 'workersCount', message: 'workersCount must be a positive integer' });
    }
  }

  // 6. timeoutMs
  if (obj.timeoutMs !== undefined) {
    if (typeof obj.timeoutMs !== 'number' || !Number.isInteger(obj.timeoutMs) || obj.timeoutMs <= 0) {
      issues.push({ field: 'timeoutMs', message: 'timeoutMs must be a positive integer' });
    }
  }

  // 7. tasks
  if (obj.tasks !== undefined) {
    if (!Array.isArray(obj.tasks)) {
      issues.push({ field: 'tasks', message: 'tasks must be an array' });
    } else {
      for (let i = 0; i < obj.tasks.length; i++) {
        const task = obj.tasks[i];
        if (!task || typeof task !== 'object') {
          issues.push({ field: `tasks[${i}]`, message: 'Task must be an object' });
          continue;
        }
        if (typeof task.id !== 'string' || task.id.trim().length === 0) {
          issues.push({ field: `tasks[${i}].id`, message: 'Task id must be a non-empty string' });
        }
        if (task.file !== undefined && (typeof task.file !== 'string' || task.file.trim().length === 0)) {
          issues.push({ field: `tasks[${i}].file`, message: 'Task file must be a non-empty string when defined' });
        }
        if (task.workerId !== undefined && (typeof task.workerId !== 'string' || task.workerId.trim().length === 0)) {
          issues.push({ field: `tasks[${i}].workerId`, message: 'Task workerId must be a non-empty string when defined' });
        }
        if (task.branch !== undefined && (typeof task.branch !== 'string' || task.branch.trim().length === 0)) {
          issues.push({ field: `tasks[${i}].branch`, message: 'Task branch must be a non-empty string when defined' });
        }
        if (task.deps !== undefined && (!Array.isArray(task.deps) || task.deps.some((d: unknown) => typeof d !== 'string'))) {
          issues.push({ field: `tasks[${i}].deps`, message: 'Task deps must be an array of strings when defined' });
        }
      }
    }
  }

  // 8. expectedMetrics
  if (!obj.expectedMetrics || typeof obj.expectedMetrics !== 'object' || Array.isArray(obj.expectedMetrics)) {
    issues.push({ field: 'expectedMetrics', message: 'expectedMetrics must be a non-null object' });
  } else {
    const metrics = obj.expectedMetrics as Record<string, unknown>;
    for (const [key, val] of Object.entries(metrics)) {
      if (typeof val === 'number') {
        if (isNaN(val) || val < 0) {
          issues.push({ field: `expectedMetrics.${key}`, message: `Metric ${key} must be a non-negative number` });
        }
      } else if (typeof val !== 'boolean' && typeof val !== 'string' && val !== null && !Array.isArray(val)) {
        issues.push({ field: `expectedMetrics.${key}`, message: `Metric ${key} has unsupported type: ${typeof val}` });
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues
  };
}
