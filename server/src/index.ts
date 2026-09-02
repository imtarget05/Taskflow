import http from 'http';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';
import { closeSocket, initSocket } from './lib/socket';
import { prisma } from './lib/prisma';
import { flushTracer } from './modules/agent/tracer';

let httpServer: ReturnType<typeof http.createServer> | null = null;

async function bootstrap(): Promise<void> {
  const app = createApp();
  const server = http.createServer(app);
  httpServer = server;

  // Wire up Socket.io for realtime collaboration.
  initSocket(server);
  const cleanup = setInterval(async () => {
    const { cleanupExpiredRefreshTokens } = await import('./modules/auth/auth.service');
    await cleanupExpiredRefreshTokens();
  }, 24 * 60 * 60 * 1000);
  cleanup.unref();

  server.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'TaskFlow server started');
  });
}

async function gracefulShutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Graceful shutdown requested');
  const forceExit = setTimeout(() => process.exit(1), 10_000);
  try {
    if (httpServer) await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    await closeSocket();
    await prisma.$disconnect();
    // Flush any pending Langfuse traces (no-op when tracing is disabled).
    await flushTracer();
    clearTimeout(forceExit);
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, 'Graceful shutdown failed');
    process.exit(1);
  }
}

process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));

bootstrap().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
