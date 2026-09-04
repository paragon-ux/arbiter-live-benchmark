import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AuthService, UserStore, SessionStore } from '../targets/microservice-auth/src/index.js';
import { StreamExtractor, RecordTransformer, DataSink, ETLPipeline } from '../targets/data-pipeline/src/index.js';

describe('Target Codebases Verification Suite', () => {
  it('verifies microservice-auth functionality end-to-end', () => {
    const users = new UserStore();
    const sessions = new SessionStore();
    const auth = new AuthService(users, sessions);

    const user = auth.registerUser('operator@example.com', 'SecureP@ss123');
    assert.ok(user.id);
    const { token, sessionId } = auth.authenticateUser('operator@example.com', 'SecureP@ss123');
    assert.ok(token);
    assert.ok(sessionId);

    const verified = auth.validateSessionToken(token);
    assert.equal(verified.userId, user.id);
  });

  it('verifies data-pipeline functionality end-to-end', async () => {
    const raw = [
      { id: '1', timestamp: '2026-09-04T12:00:00Z', source: 'SENSOR_1', value: 10 },
      { id: '2', timestamp: '2026-09-04T12:05:00Z', source: 'SENSOR_2', value: '25.5' }
    ];
    const pipeline = new ETLPipeline(
      new StreamExtractor(raw),
      new RecordTransformer(),
      new DataSink()
    );

    const summary = await pipeline.run();
    assert.equal(summary.totalProcessed, 2);
    assert.equal(summary.totalErrors, 0);
  });
});
