export interface AuditEvent {
  action: string;
  userId?: string;
  ip?: string;
  timestamp: number;
  success: boolean;
  details?: Record<string, unknown>;
}

export class AuditLog {
  private events: AuditEvent[] = [];

  record(event: Omit<AuditEvent, 'timestamp'>): AuditEvent {
    const full: AuditEvent = { ...event, timestamp: Date.now() };
    this.events.push(full);
    return full;
  }

  getEvents(userId?: string): AuditEvent[] {
    if (!userId) return [...this.events];
    return this.events.filter(e => e.userId === userId);
  }
}
