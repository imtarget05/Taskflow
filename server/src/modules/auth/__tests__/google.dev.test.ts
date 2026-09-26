/**
 * Tests for google.dev.ts — uses jest.resetModules + dynamic import to
 * re-evaluate the module under different env configurations.
 */

describe('google.dev', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalClientId = process.env.GOOGLE_CLIENT_ID;
  const originalJwtSecret = process.env.JWT_SECRET;
  const originalJwtRefreshSecret = process.env.JWT_REFRESH_SECRET;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.GOOGLE_CLIENT_ID = originalClientId;
    process.env.JWT_SECRET = originalJwtSecret;
    process.env.JWT_REFRESH_SECRET = originalJwtRefreshSecret;
    jest.resetModules();
  });

  describe('isDevGoogleEnabled', () => {
    it('returns false in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.GOOGLE_CLIENT_ID = 'dev-mock-id';
      // The production JWT guard rejects missing/fallback secrets, so use
      // explicit strong values here: this test is about Google dev mode,
      // not about env validation.
      process.env.JWT_SECRET = 'x'.repeat(40);
      process.env.JWT_REFRESH_SECRET = 'y'.repeat(40);
      const { isDevGoogleEnabled } = await import('../google.dev');
      expect(isDevGoogleEnabled()).toBe(false);
    });

    it('returns false without dev- prefix', async () => {
      process.env.NODE_ENV = 'development';
      process.env.GOOGLE_CLIENT_ID = 'real-google-id';
      const { isDevGoogleEnabled } = await import('../google.dev');
      expect(isDevGoogleEnabled()).toBe(false);
    });

    it('returns true in dev mode with dev- prefix', async () => {
      process.env.NODE_ENV = 'development';
      process.env.GOOGLE_CLIENT_ID = 'dev-mock-id';
      const { isDevGoogleEnabled } = await import('../google.dev');
      expect(isDevGoogleEnabled()).toBe(true);
    });

    it('returns false when GOOGLE_CLIENT_ID is not set', async () => {
      process.env.NODE_ENV = 'development';
      process.env.GOOGLE_CLIENT_ID = undefined;
      const { isDevGoogleEnabled } = await import('../google.dev');
      expect(isDevGoogleEnabled()).toBe(false);
    });
  });
});
