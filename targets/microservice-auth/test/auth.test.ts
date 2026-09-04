import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AuthService, UserStore, SessionStore, SlidingWindowRateLimiter, AuditLog, InvalidCredentialsError } from '../src/index.js';

describe('AuthService Suite', () => {
  it('registers and authenticates a user successfully', () => {
    const users = new UserStore();
    const sessions = new SessionStore();
    const auth = new AuthService(users, sessions);

    auth.registerUser('alice@example.com', 'SuperSecret123');
    const { token, sessionId } = auth.authenticateUser('alice@example.com', 'SuperSecret123');

    assert.ok(token);
    assert.ok(sessionId);
    const payload = auth.validateSessionToken(token);
    assert.equal(payload.email, 'alice@example.com');
  });

  it('rejects invalid password credentials', () => {
    const users = new UserStore();
    const sessions = new SessionStore();
    const auth = new AuthService(users, sessions);

    auth.registerUser('bob@example.com', 'PasswordA');
    assert.throws(() => {
      auth.authenticateUser('bob@example.com', 'WrongPassword');
    }, InvalidCredentialsError);
  });
});
