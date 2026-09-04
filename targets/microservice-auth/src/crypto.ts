import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function hashPassword(password: string, salt: string): string {
  return createHash('sha256').update(`${password}:${salt}`).digest('hex');
}

export function generateSalt(length = 16): string {
  return randomBytes(length).toString('hex');
}

export function verifyPasswordMatch(candidate: string, hash: string, salt: string): boolean {
  const candidateHash = hashPassword(candidate, salt);
  const hashBuf = Buffer.from(hash, 'hex');
  const candBuf = Buffer.from(candidateHash, 'hex');
  if (hashBuf.length !== candBuf.length) return false;
  return timingSafeEqual(hashBuf, candBuf);
}
