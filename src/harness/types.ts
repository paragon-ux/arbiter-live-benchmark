export type ExecutionTier = 'deterministic' | 'subprocess_mcp' | 'agy' | 'naive_mutex' | 'process_pool' | 'docker';

export interface BaseScenario {
  id: string;
  title: string;
  description: string;
  targetRepo: string;
  mode: string;
  timeoutMs?: number;
  expectedMetrics?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ColdExplorationDetails {
  targetCodebase: string;
  fileCountScanned: number;
  bytesScanned: number;
  compactionRecoveryType: 'COLD_REREAD' | string;
}

export interface WaymarkContinuityDetails {
  waymarkResumeTokens: number;
  coldBaselineTokens: number;
  continuityStatus: 'FRESH' | 'STALE' | 'FALLBACK';
}

export interface ChaosNoIsolationDetails {
  dirtyWorkingTree: boolean;
  clobberedFile: string;
  isolationPreserved: boolean;
}

export interface WorktreeSwarmDetails {
  worktreesProvisioned: number;
  worktreesIsolated: boolean;
  mergeQueueSequential: boolean;
  sqliteWalBusyTimeoutMs?: number;
}

export interface DagSchedulingDetails {
  dagNodesResolved: number;
  topologicalSortValid: boolean;
  topologicalSortLatencyMs: number;
}

export interface ConflictQuarantineDetails {
  quarantineStatus: 'CONFLICT' | 'RESOLVED';
  rollbackCommand: string;
  reconciliationStaged?: boolean;
}

export interface WatchdogDetails {
  livenessProbe: string;
  pidAlive: boolean;
  pidReaped: number;
  leaseReclaimed: boolean;
  taskResetStatus: string;
}

export interface SemanticCorrectnessDetails {
  typeErrors: number;
  unitTestsPassed: number;
  unitTestsTotal: number;
  semanticTestsPassed: boolean;
  zeroRegression: boolean;
}

export interface CyclicDagDetails {
  cycleDetected: boolean;
  tasksExecuted: number;
  rejectionLatencyMs: number;
}

export interface LeaseCollisionDetails {
  workerA_status: string;
  workerB_status: string;
  backoffRetries: number;
  deadlockDetected: boolean;
}

export interface SignalInterruptedDetails {
  signalCaught: string;
  rollbackCommand: string;
  quarantinedWorktree: string;
}

export interface MultiCompactionDetails {
  compactionCycles: number;
  trajectoryHash: string;
  hashStability: string;
}

export interface DiskFullDetails {
  faultInjected: string;
  transactionRolledBack: boolean;
  orphanLocksRemaining: number;
  leaseReleased: boolean;
}

export interface DockerOverheadDetails {
  dockerDaemonAvailable: boolean;
  coordinationStrategy: string;
  containerStartupLatencyMs: number;
  worktreeLatencyMs: number;
  overheadVsWorktrees: string;
}

export interface NaiveMutexDetails {
  coordinationStrategy: string;
  lockContentionCount: number;
  mutexWaitMs: number;
}

export interface CrossRepoDagDetails {
  dagNodesTotal: number;
  topologicalResolution: string;
}

export interface NWayConflictDetails {
  contendingWorkers: number;
  sharedFilesModified: string[];
  conflictsQuarantined: number;
  mainBranchIntact: boolean;
}

export interface UpstreamMainDriftDetails {
  upstreamCommitsInjected: number;
  featureBranchRebased: boolean;
  mergeClean: boolean;
}

export type TypedScenarioDetails =
  | ColdExplorationDetails
  | WaymarkContinuityDetails
  | ChaosNoIsolationDetails
  | WorktreeSwarmDetails
  | DagSchedulingDetails
  | ConflictQuarantineDetails
  | WatchdogDetails
  | SemanticCorrectnessDetails
  | CyclicDagDetails
  | LeaseCollisionDetails
  | SignalInterruptedDetails
  | MultiCompactionDetails
  | DiskFullDetails
  | DockerOverheadDetails
  | NaiveMutexDetails
  | CrossRepoDagDetails
  | NWayConflictDetails
  | UpstreamMainDriftDetails;

export type ScenarioDetails = Record<string, any>;

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
  details: ScenarioDetails;
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
  rawDurationMs?: number;
  trialHistory?: { trialIndex: number; durationMs: number; passed: boolean }[];
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
