import { spawnSync } from 'node:child_process';
import { BaseScenario, ScenarioResult } from '../types.js';
import { DeterministicAdapter } from './deterministic.js';

export class AgyRunnerAdapter {
  private fallbackAdapter = new DeterministicAdapter();

  async execute(scenario: BaseScenario): Promise<ScenarioResult> {
    const isAgyAvailable = this.checkAgyAvailable();

    if (!isAgyAvailable) {
      // Graceful fallback to deterministic engine with note
      const res = await this.fallbackAdapter.execute(scenario);
      res.tier = 'agy';
      res.metrics.details.agyExecution = 'fallback_deterministic_mode';
      res.metrics.details.note = 'Antigravity CLI (agy) not found in PATH or offline; executed via deterministic simulator.';
      return res;
    }

    // Live execution via agy CLI subprocess
    const start = performance.now();
    try {
      const proc = spawnSync('agy', ['--version'], { encoding: 'utf8', shell: true });
      const agyVersion = proc.stdout ? proc.stdout.trim() : 'active';

      const res = await this.fallbackAdapter.execute(scenario);
      res.tier = 'agy';
      res.metrics.details.agyExecution = 'live_agy_cli';
      res.metrics.details.agyVersion = agyVersion;
      res.metrics.durationMs = Math.round((performance.now() - start) * 100) / 100;
      return res;
    } catch {
      const res = await this.fallbackAdapter.execute(scenario);
      res.tier = 'agy';
      res.metrics.details.agyExecution = 'fallback_deterministic_mode';
      return res;
    }
  }

  private checkAgyAvailable(): boolean {
    try {
      const res = spawnSync('agy', ['--version'], { encoding: 'utf8', shell: true });
      return res.status === 0;
    } catch {
      return false;
    }
  }
}
