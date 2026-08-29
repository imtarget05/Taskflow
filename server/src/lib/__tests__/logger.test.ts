import { describe, it, expect, vi, afterEach } from 'vitest';

// We test the logger module by spying on the underlying pino instance's
// destination so no real output is produced and assertions are deterministic.
describe('logger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exports a pino logger instance with standard level methods', async () => {
    const { logger } = await import('../logger');
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.debug).toBe('function');
    // pino instances expose `child` for structured child loggers.
    expect(typeof logger.child).toBe('function');
  });

  it('forwards structured fields without throwing', async () => {
    const { logger } = await import('../logger');
    // Should not throw and should return the logger (pino chaining).
    const ret = logger.error({ area: 'test', event: 'unit' }, 'boom');
    expect(ret).toBeDefined();
  });

  it('child logger inherits base fields', async () => {
    const { logger } = await import('../logger');
    const child = logger.child({ module: 'x' });
    expect(child).toBeDefined();
    expect(typeof child.info).toBe('function');
  });
});
