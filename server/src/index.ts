import http from 'http';
import { createApp } from './app';
import { env } from './config/env';
import { initSocket } from './lib/socket';
import { prisma } from './lib/prisma';

async function bootstrap(): Promise<void> {
  const app = createApp();
  const server = http.createServer(app);

  // Wire up Socket.io for realtime collaboration.
  initSocket(server);

  server.listen(env.PORT, () => {
    console.log(`🚀 TaskFlow server running on http://localhost:${env.PORT}`);
  });
}

async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`🛑 Received ${signal}, shutting down gracefully...`);
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});