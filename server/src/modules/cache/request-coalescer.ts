interface PendingRequest<T> {
  promise: Promise<T>;
  timestamp: number;
}

export class RequestCoalescer<T> {
  private pending = new Map<string, PendingRequest<T>>();
  private ttlMs: number;

  constructor(ttlMs = 5000) {
    this.ttlMs = ttlMs;
  }

  /**
   * Coalesce concurrent requests with same key.
   * If a request with the same key is already in-flight, return its promise.
   */
  async coalesce(key: string, factory: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const existing = this.pending.get(key);

    // Return existing promise if still valid
    if (existing && now - existing.timestamp < this.ttlMs) {
      return existing.promise;
    }

    // Create new request
    const promise = factory().finally(() => {
      this.pending.delete(key);
    });

    this.pending.set(key, { promise, timestamp: now });
    return promise;
  }

  /**
   * Clear stale entries.
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.pending.entries()) {
      if (now - entry.timestamp > this.ttlMs) {
        this.pending.delete(key);
      }
    }
  }
}
