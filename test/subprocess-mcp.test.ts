import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SubprocessMcpAdapter } from '../src/harness/adapters/subprocessMcp.js';

describe('SubprocessMcpAdapter Suite (Tier 1.5)', () => {
  const adapter = new SubprocessMcpAdapter();

  it('spawns child process communicating via JSON-RPC stdio', async () => {
    const res = await adapter.execute({
      id: '008-agent-semantic-correctness',
      title: 'Agent Semantic Correctness',
      description: 'Test child process MCP lifecycle',
      targetRepo: 'targets/microservice-auth',
      mode: 'refactor'
    });

    assert.ok(res.passed);
    assert.equal(res.tier, 'subprocess_mcp');
    assert.ok(res.metrics.durationMs >= 0);
  });

  it('handles concurrent high-worker scenario via Tier 1.5', async () => {
    const res = await adapter.execute({
      id: '009-parallel-10-workers',
      title: '10 Workers',
      description: 'Test high concurrency',
      targetRepo: 'targets/microservice-auth',
      mode: 'parallel',
      workersCount: 10
    });

    assert.ok(res.passed);
    assert.equal(res.metrics.worktreesProvisioned, 10);
    assert.equal(res.metrics.mainBranchValid, true);
  });
});
