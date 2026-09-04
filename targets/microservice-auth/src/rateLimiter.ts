export class SlidingWindowRateLimiter {
  private hits = new Map<string, number[]>();

  constructor(private windowMs: number = 60000, private maxHits: number = 5) {}

  isAllowed(key: string): boolean {
    const now = Date.now();
    const timestamps = this.hits.get(key) || [];
    const recent = timestamps.filter(t => now - t < this.windowMs);
    if (recent.length >= this.maxHits) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  reset(key: string): void {
    this.hits.delete(key);
  }
}
