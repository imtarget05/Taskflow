/**
 * Lightweight circuit breaker — no external dep.
 * States: CLOSED (normal) → OPEN (fail fast) → HALF_OPEN (trial)
 */

export type BreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface BreakerOptions {
  failureThreshold?: number;
  resetTimeoutMs?: number;
  halfOpenMaxAttempts?: number;
}

interface BreakerEntry {
  state: BreakerState;
  failures: number;
  successes: number;
  openedAt: number | null;
  halfOpenAttempts: number;
}

const DEFAULTS: Required<BreakerOptions> = {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  halfOpenMaxAttempts: 1,
};

const breakers = new Map<string, BreakerEntry>();

function getEntry(key: string): BreakerEntry {
  let e = breakers.get(key);
  if (!e) {
    e = { state: 'CLOSED', failures: 0, successes: 0, openedAt: null, halfOpenAttempts: 0 };
    breakers.set(key, e);
  }
  // Auto-transition OPEN → HALF_OPEN after resetTimeout
  if (e.state === 'OPEN' && e.openedAt !== null && Date.now() - e.openedAt >= DEFAULTS.resetTimeoutMs) {
    e.state = 'HALF_OPEN';
    e.halfOpenAttempts = 0;
  }
  return e;
}

export function getBreakerState(key: string): BreakerState {
  return getEntry(key).state;
}

export function recordSuccess(key: string): void {
  const e = getEntry(key);
  if (e.state === 'HALF_OPEN') {
    e.state = 'CLOSED';
    e.failures = 0;
    e.openedAt = null;
    e.halfOpenAttempts = 0;
  } else if (e.state === 'CLOSED') {
    e.failures = 0;
  }
  e.successes += 1;
}

export function recordFailure(key: string, opts: BreakerOptions = {}): void {
  const threshold = opts.failureThreshold ?? DEFAULTS.failureThreshold;
  const e = getEntry(key);
  if (e.state === 'HALF_OPEN') {
    e.state = 'OPEN';
    e.openedAt = Date.now();
    return;
  }
  e.failures += 1;
  if (e.failures >= threshold) {
    e.state = 'OPEN';
    e.openedAt = Date.now();
  }
}

export function isOpen(key: string): boolean {
  const e = getEntry(key);
  // Re-evaluate transition
  getEntry(key);
  return e.state === 'OPEN';
}

export function canExecute(key: string): boolean {
  const state = getBreakerState(key);
  if (state === 'CLOSED') return true;
  if (state === 'HALF_OPEN') {
    const e = getEntry(key);
    return e.halfOpenAttempts < DEFAULTS.halfOpenMaxAttempts;
  }
  return false;
}

export function resetBreaker(key: string): void {
  breakers.delete(key);
}

export function resetAllBreakers(): void {
  breakers.clear();
}

export async function withCircuitBreaker<T>(
  key: string,
  fn: () => Promise<T>,
  opts: BreakerOptions & { fallback?: () => T | Promise<T> } = {}
): Promise<T> {
  if (!canExecute(key)) {
    if (opts.fallback) return opts.fallback();
    throw new Error(`Circuit breaker OPEN for ${key}`);
  }
  const entry = getEntry(key);
  if (entry.state === 'HALF_OPEN') entry.halfOpenAttempts += 1;
  try {
    const result = await fn();
    recordSuccess(key);
    return result;
  } catch (err) {
    recordFailure(key, opts);
    throw err;
  }
}

export function getBreakerSnapshot(key: string): BreakerEntry {
  return { ...getEntry(key) };
}
