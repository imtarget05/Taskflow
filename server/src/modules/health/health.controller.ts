import { Router, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { isLLMConfigured } from '../agent/llm';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  dependencies: {
    database: { status: 'up' | 'down'; responseMs?: number };
    llm: { status: 'configured' | 'unconfigured'; provider?: string };
  };
}

// Detailed health probe for production readiness (Render) and dependency monitoring.
// Deliberately public — no auth required.
export const healthRouter = Router();

healthRouter.get('/', async (_req: Request, res: Response) => {
  const checks: HealthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '0.0.0',
    dependencies: {
      database: { status: 'down' },
      llm: { status: isLLMConfigured() ? 'configured' : 'unconfigured', provider: env.LLM_PROVIDER },
    },
  };

  // Check database connectivity
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    checks.dependencies.database = { status: 'up', responseMs: Date.now() - dbStart };
  } catch {
    checks.dependencies.database = { status: 'down' };
    checks.status = 'unhealthy';
  }

  // LLM is optional — degraded if not configured
  if (!isLLMConfigured()) {
    checks.status = checks.status === 'unhealthy' ? 'unhealthy' : 'degraded';
  }

  const statusCode = checks.status === 'unhealthy'
    ? StatusCodes.SERVICE_UNAVAILABLE
    : StatusCodes.OK;

  res.status(statusCode).json({ success: true, ...checks });
});
