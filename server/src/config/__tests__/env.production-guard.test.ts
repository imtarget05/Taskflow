// The production JWT-secret guard in server/src/config/env.ts is evaluated at
// module load, so each case re-requires a fresh copy of the module with its
// own process.env. Nothing here touches the singleton the rest of the suite
// uses (that one loads under NODE_ENV=test).
const CONTROLLED_KEYS = ['NODE_ENV', 'JWT_SECRET', 'JWT_REFRESH_SECRET'] as const;
type ControlledKey = (typeof CONTROLLED_KEYS)[number];

const STRONG_ACCESS = 'x'.repeat(40);
const STRONG_REFRESH = 'y'.repeat(40);

describe('env production JWT secret guard (server/src/config/env.ts)', () => {
  let saved: Record<ControlledKey, string | undefined>;

  beforeEach(() => {
    saved = {
      NODE_ENV: process.env.NODE_ENV,
      JWT_SECRET: process.env.JWT_SECRET,
      JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
    };
  });

  afterEach(() => {
    for (const k of CONTROLLED_KEYS) {
      const value = saved[k];
      if (value === undefined) {
        // dotenv never overrides already-set vars, so deleting restores the state.
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete process.env[k];
      } else {
        process.env[k] = value;
      }
    }
  });

  async function loadEnvFresh() {
    let captured: typeof import('../env') | undefined;
    await jest.isolateModulesAsync(async () => {
      captured = await import('../env');
    });
    if (!captured) {
      throw new Error('env module did not load');
    }
    return captured;
  }

  it('rejects the test-mode access fallback that leaked into logs', async () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'test_secret_access';
    process.env.JWT_REFRESH_SECRET = STRONG_REFRESH;
    await expect(loadEnvFresh()).rejects.toThrow(/non-default values in production/);
  });

  it('rejects the test-mode refresh fallback even with a strong access secret', async () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = STRONG_ACCESS;
    process.env.JWT_REFRESH_SECRET = 'test_secret_refresh';
    await expect(loadEnvFresh()).rejects.toThrow(/non-default values in production/);
  });

  it('still rejects the dev schema defaults (previous behaviour preserved)', async () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'dev_secret_access_token';
    process.env.JWT_REFRESH_SECRET = 'dev_secret_refresh_token';
    await expect(loadEnvFresh()).rejects.toThrow(/non-default values in production/);
  });

  it('rejects empty secrets', async () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = '';
    process.env.JWT_REFRESH_SECRET = '';
    await expect(loadEnvFresh()).rejects.toThrow(/non-default values in production/);
  });

  it('accepts two strong, non-default secrets', async () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = STRONG_ACCESS;
    process.env.JWT_REFRESH_SECRET = STRONG_REFRESH;
    const mod = await loadEnvFresh();
    expect(mod.env.JWT_SECRET).toBe(STRONG_ACCESS);
    expect(mod.env.JWT_REFRESH_SECRET).toBe(STRONG_REFRESH);
  });

  it('does not fire in test mode (keeps the existing test setup working)', async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test_secret_access';
    process.env.JWT_REFRESH_SECRET = 'test_secret_refresh';
    const mod = await loadEnvFresh();
    expect(mod.env.JWT_SECRET).toBe('test_secret_access');
  });
});
