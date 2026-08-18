import http from 'http';
import { createApp } from './app';
import { env } from './config/env';
import { closeSocket, initSocket } from './lib/socket';
import { prisma } from './lib/prisma';

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
    console.log(`🚀 TaskFlow server running on http://localhost:${env.PORT}`);
  });
}

async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`🛑 Received ${signal}, shutting down gracefully...`);
  const forceExit = setTimeout(() => process.exit(1), 10_000);
  try {
    if (httpServer) await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    await closeSocket();
    await prisma.$disconnect();
    clearTimeout(forceExit);
    process.exit(0);
  } catch (error) {
    console.error('Graceful shutdown failed:', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
