export interface SessionRecord {
  sessionId: string;
  userId: string;
  createdAt: number;
  lastActive: number;
  revoked: boolean;
}

export class SessionStore {
  private sessions = new Map<string, SessionRecord>();

  create(sessionId: string, userId: string): SessionRecord {
    const now = Date.now();
    const session: SessionRecord = {
      sessionId,
      userId,
      createdAt: now,
      lastActive: now,
      revoked: false
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  get(sessionId: string): SessionRecord | null {
    const s = this.sessions.get(sessionId);
    if (!s || s.revoked) return null;
    s.lastActive = Date.now();
    return s;
  }

  revoke(sessionId: string): boolean {
    const s = this.sessions.get(sessionId);
    if (!s) return false;
    s.revoked = true;
    return true;
  }

  revokeAllForUser(userId: string): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.userId === userId && !session.revoked) {
        session.revoked = true;
        count++;
      }
    }
    return count;
  }

  size(): number {
    return this.sessions.size;
  }
}
