import 'dotenv/config';

process.env.NODE_ENV = 'test';
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
