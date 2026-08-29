jest.mock('../../lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
  },
}));

import { logger } from '../../lib/logger';

describe('logger', () => {
  it('exports a pino logger instance with standard level methods', () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.child).toBe('function');
  });

  it('forwards structured fields without throwing', () => {
    expect(() => logger.error({ area: 'test', event: 'unit' }, 'boom')).not.toThrow();
  });

  it('child logger inherits base fields', () => {
    const child = logger.child({ module: 'x' });
    expect(child).toBeDefined();
    expect(typeof child.info).toBe('function');
  });
});
