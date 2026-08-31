import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';

// Lightweight health endpoint for production readiness probes.
// Deliberately public — no auth required.
export const healthRouter = Router();

healthRouter.get('/', async (_req: Request, res: Response) => {
  let dbOk = true;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbOk = false;
  }

  res.json({
    status: dbOk ? 'ok' : 'degraded',
    db: dbOk ? 'connected' : 'disconnected',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});
