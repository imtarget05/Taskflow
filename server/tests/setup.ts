import 'dotenv/config';

// Langfuse v3 ships ESM-only dynamic imports that Jest's CommonJS runtime
// cannot load. Mock the SDK module-wide so no test accidentally pulls in the
// real package — tracing is a no-op under test, which matches production when
// LANGFUSE_* keys are absent.
jest.mock('langfuse', () => {
  const Langfuse = jest.fn().mockImplementation(() => ({
    trace: jest.fn(() => ({ span: jest.fn(() => ({ update: jest.fn(), end: jest.fn() })), update: jest.fn() })),
    flushAsync: jest.fn().mockResolvedValue(undefined),
  }));
  return { Langfuse };
});

process.env.NODE_ENV = 'test';
// Keep in-memory rate limiters far above the integration test request volume.
process.env.RATE_LIMIT_MAX = '5000';
process.env.RATE_LIMIT_AUTH_LOGIN = '10000';
process.env.RATE_LIMIT_AUTH_REGISTER = '10000';
process.env.RATE_LIMIT_AUTH_REFRESH = '10000';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://taskflow:taskflow@localhost:5432/taskflow_test?schema=public';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test_secret_access';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test_secret_refresh';

afterAll(async () => {
  // Allow Prisma to release connections before Jest exits.
  try {
    const { prisma } = await import('../src/lib/prisma');
    if (prisma && typeof (prisma as { $disconnect?: unknown }).$disconnect === 'function') {
      await (prisma as { $disconnect: () => Promise<void> }).$disconnect();
    }
  } catch {
    // Prisma may be mocked in some test suites; skip gracefully.
  }
});
