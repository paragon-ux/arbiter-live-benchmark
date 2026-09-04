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

export interface McpProtocolDetails {
  mcpProtocol: string;
  mcpServerPid?: number;
  toolCallsExecuted: number;
  protocolCompliant: boolean;
  rpcLatencyMs: number;
}

export interface StaleHeartbeatDetails {
  heartbeatAgeMs: number;
  heartbeatTimeoutMs: number;
  workerPidAlive: boolean;
  leaseExpired: boolean;
  taskResetToReady: boolean;
  waymarkLockRecovered: boolean;
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
  | UpstreamMainDriftDetails
  | McpProtocolDetails
  | StaleHeartbeatDetails;

export interface ScenarioDetailsMap {
  '001-single-agent-cold': ColdExplorationDetails;
  '002-single-agent-waymark': WaymarkContinuityDetails;
  '003-parallel-no-isolation': ChaosNoIsolationDetails;
  '004-parallel-arbiter': WorktreeSwarmDetails;
  '005-dag-dependencies': DagSchedulingDetails;
  '006-conflict-quarantine': ConflictQuarantineDetails;
  '007-watchdog-dead-worker': WatchdogDetails;
  '008-agent-semantic-correctness': SemanticCorrectnessDetails;
  '009-parallel-10-workers': WorktreeSwarmDetails;
  '010-cyclic-dag-rejection': CyclicDagDetails;
  '011-concurrent-lease-collision': LeaseCollisionDetails;
  '012-signal-interrupted-merge': SignalInterruptedDetails;
  '013-waymark-multi-compaction': MultiCompactionDetails;
  '014-disk-full-recovery': DiskFullDetails;
  '015-docker-isolated-overhead': DockerOverheadDetails;
  '016-naive-mutex-contention': NaiveMutexDetails;
  '017-parallel-50-workers': WorktreeSwarmDetails;
  '018-cross-repo-workspace-dag': CrossRepoDagDetails;
  '019-n-way-merge-conflicts': NWayConflictDetails;
  '020-concurrent-main-drift': UpstreamMainDriftDetails;
  '021-mcp-protocol-resilience': McpProtocolDetails;
  '022-watchdog-heartbeat-stale-reclaim': StaleHeartbeatDetails;
}

export type ScenarioDetails = Record<string, any>;

export interface ScenarioMetrics<T = ScenarioDetails> {
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
  details: T;
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

export interface ScenarioResult<T = ScenarioDetails> {
  scenarioId: string;
  title: string;
  tier: ExecutionTier;
  passed: boolean;
  metrics: ScenarioMetrics<T>;
  rawDurationMs?: number;
  trialHistory?: { trialIndex: number; durationMs: number; passed: boolean }[];
  stats?: StatisticalMetrics;
  error?: string;
}

export type TypedScenarioResult<K extends keyof ScenarioDetailsMap = keyof ScenarioDetailsMap> = ScenarioResult<ScenarioDetailsMap[K]> & { scenarioId: K };

export interface BenchmarkSummary {
  $schema?: string;
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
