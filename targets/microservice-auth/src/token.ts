import { createHmac } from 'node:crypto';
import { TokenExpiredError } from './errors.js';

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  exp: number;
}

const DEFAULT_SECRET = 'microservice-auth-test-secret-2026';

export function issueToken(payload: Omit<TokenPayload, 'exp'>, ttlSeconds = 3600, secret = DEFAULT_SECRET): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const fullPayload: TokenPayload = { ...payload, exp };
  const encoded = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyToken(token: string, secret = DEFAULT_SECRET): TokenPayload {
  const parts = token.split('.');
  if (parts.length !== 2) throw new Error('Invalid token structure');
  const [encoded, signature] = parts;
  const expectedSig = createHmac('sha256', secret).update(encoded).digest('base64url');
  if (signature !== expectedSig) throw new Error('Invalid token signature');

  const payload: TokenPayload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) throw new TokenExpiredError();
  return payload;
}
