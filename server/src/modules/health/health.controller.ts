import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { isEmailConfigured } from '../../config/env';
import { verifyEmailConnection } from '../auth/email.service';

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

  const emailConfigured = isEmailConfigured();
  const emailOk = emailConfigured ? await verifyEmailConnection() : false;

  const services = {
    db: dbOk ? 'connected' : 'disconnected',
    email: emailConfigured ? (emailOk ? 'connected' : 'disconnected') : 'not_configured',
  };

  const overall = dbOk && (!emailConfigured || emailOk) ? 'ok' : 'degraded';

  res.json({
    status: overall,
    services,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});
