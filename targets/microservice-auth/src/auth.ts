import { hashPassword, generateSalt, verifyPasswordMatch } from './crypto.js';
import { issueToken, verifyToken, TokenPayload } from './token.js';
import { SessionStore } from './session.js';
import { UserStore, UserRecord } from './users.js';
import { SlidingWindowRateLimiter } from './rateLimiter.js';
import { AuditLog } from './audit.js';
import { InvalidCredentialsError, RateLimitExceededError } from './errors.js';
import { randomBytes } from 'node:crypto';

export class AuthService {
  constructor(
    private users: UserStore,
    private sessions: SessionStore,
    private rateLimiter: SlidingWindowRateLimiter = new SlidingWindowRateLimiter(),
    private audit: AuditLog = new AuditLog()
  ) {}

  registerUser(email: string, password: string, role = 'user'): UserRecord {
    const salt = generateSalt();
    const passwordHash = hashPassword(password, salt);
    const user: UserRecord = {
      id: `usr_${randomBytes(8).toString('hex')}`,
      email,
      passwordHash,
      salt,
      role
    };
    this.users.save(user);
    this.audit.record({ action: 'register', userId: user.id, success: true });
    return user;
  }

  authenticateUser(email: string, password: string, clientIp = '127.0.0.1'): { token: string; sessionId: string } {
    if (!this.rateLimiter.isAllowed(clientIp)) {
      this.audit.record({ action: 'login_blocked_rate_limit', ip: clientIp, success: false });
      throw new RateLimitExceededError();
    }

    const user = this.users.findByEmail(email);
    if (!user || !verifyPasswordMatch(password, user.passwordHash, user.salt)) {
      this.audit.record({ action: 'login_failure', ip: clientIp, success: false });
      throw new InvalidCredentialsError();
    }

    const sessionId = `ses_${randomBytes(12).toString('hex')}`;
    this.sessions.create(sessionId, user.id);
    const token = issueToken({ userId: user.id, email: user.email, role: user.role });

    this.audit.record({ action: 'login_success', userId: user.id, ip: clientIp, success: true });
    return { token, sessionId };
  }

  validateSessionToken(token: string): TokenPayload {
    return verifyToken(token);
  }
}
