export type ExecutionTier = 'deterministic' | 'subprocess_mcp' | 'agy' | 'naive_mutex' | 'process_pool' | 'docker';

export interface BaseScenario {
  id: string;
  title: string;
  description: string;
  targetRepo: string;
  mode: string;
  expectedMetrics?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ScenarioMetrics {
  durationMs: number;
  tokensTotal: number;
  waymarkResumeTokens?: number;
  tokensSaved?: number;
  continuitySavingsPercent?: number;
  worktreesProvisioned?: number;
  worktreesIsolated?: boolean;
  conflictsDetected: number;
  conflictsResolved: number;
  mainBranchValid: boolean;
  accuracyPercent: number;
  containerStartupMs?: number;
  mutexWaitMs?: number;
  lockContentionCount?: number;
  overheadRatio?: number;
  details: Record<string, unknown>;
}

export interface StatisticalMetrics {
  trials: number;
  medianDurationMs: number;
  meanDurationMs: number;
  stddevDurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
  cvDuration: number;
  trialDurations: number[];
}

export interface ScenarioResult {
  scenarioId: string;
  title: string;
  tier: ExecutionTier;
  passed: boolean;
  metrics: ScenarioMetrics;
  stats?: StatisticalMetrics;
  error?: string;
}

export interface BenchmarkSummary {
  timestamp: string;
  nodeVersion: string;
  platform: string;
  tier: ExecutionTier;
  trials: number;
  totalScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  totalDurationMs: number;
  averageSavingsPercent: number;
  heapUsedMb: number;
  results: ScenarioResult[];
}
