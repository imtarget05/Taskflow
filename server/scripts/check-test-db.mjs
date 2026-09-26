/**
 * Pre-flight check for the integration test suites.
 *
 * The integration suites drive the real Prisma client against a real
 * PostgreSQL server (they run real `deleteMany` against 9 tables), so
 * `npm run test:integration` cannot pass on a machine without one. Without
 * this check the only signal is a wall of Prisma P1001 connection errors
 * interleaved with assertion failures, which reads like a broken test suite
 * rather than a missing dependency.
 *
 * This script exits 0 when the database is reachable and exits 1 (with
 * remediation instructions) when it is not, so the missing dependency is
 * reported as exactly that. It never converts a failure into a success.
 *
 * Uses only @prisma/client, which is already a dependency. The default
 * DATABASE_URL mirrors tests/setup.ts so this checks the same database the
 * tests will actually use.
 */

process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://taskflow:taskflow@localhost:5432/taskflow_test?schema=public';

const REMEDIATION = [
  'The integration tests need a live PostgreSQL server. Start one with:',
  '',
  '  docker compose up -d db',
  '',
  'Then apply the migrations to the test database:',
  '',
  '  npm run -w server prisma:deploy',
  '',
  'To run only the suites that need no database:',
  '',
  '  npm run test:unit',
].join('\n');

async function main() {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    console.log(`[check-test-db] PostgreSQL reachable at the configured DATABASE_URL.`);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

try {
  await main();
  process.exit(0);
} catch (err) {
  console.error('[check-test-db] FAILED: cannot reach the integration test database.');
  console.error(`[check-test-db] DATABASE_URL=${process.env.DATABASE_URL}`);
  console.error(`[check-test-db] ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`);
  console.error('');
  console.error(REMEDIATION);
  process.exit(1);
}