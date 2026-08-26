import express, { Express } from 'express';
import cors, { CorsOptions } from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { csrfProtection } from './middlewares/csrf';
import { errorHandler, notFoundHandler } from './utils/errors';
import authRoutes from './modules/auth/auth.routes';
import projectRoutes from './modules/project/project.routes';
import columnRoutes from './modules/column/column.routes';
import taskRoutes from './modules/task/task.routes';
import commentRoutes from './modules/comment/comment.routes';
import activityRoutes from './modules/activity/activity.routes';
import chatRoutes from './modules/chat/chat.routes';
import searchRoutes from './modules/search/search.routes';
import analyticsRoutes from './modules/analytics/analytics.routes';
import agentRoutes from './modules/agent/agent.routes';
import legalRoutes from './modules/legal/legal.routes';
import exportRoutes from './modules/export/export.routes';
import nlpRoutes from './modules/nlp/nlp.routes';

function isAllowedOrigin(origin: string): boolean {
  if (env.CORS_ORIGINS.some((allowed) => origin === allowed)) return true;
  try {
    const host = new URL(origin).hostname;
    return host.endsWith('.pages.dev');
  } catch {
    return false;
  }
}

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Requests without an Origin (curl, health checks) are allowed.
    if (!origin) return callback(null, true);
    if (isAllowedOrigin(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed by CORS'));
  },
  credentials: true,
};

export function createApp(): Express {
  const app = express();

  // The site is served behind the Cloudflare Pages proxy in production
  // (and the Vite dev proxy locally): trust the immediate hop so req.ip /
  // express-rate-limit resolve the real client IP from X-Forwarded-For.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(csrfProtection);
  app.use(pinoHttp({ redact: ['req.headers.authorization', 'req.headers.cookie'] }));

  // Health check lives before rate limiting so load balancer / container
  // health checks never consume the request budget.
  app.get('/api/health', (_req, res) => {
    res.json({ success: true, status: 'ok', uptime: process.uptime() });
  });

  // Global rate limiting.
  app.use(
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req, _res) => req.path.startsWith('/api/auth/google'),
    })
  );

  // API routes.
  app.use('/api/auth', authRoutes);
  app.use('/api/projects', projectRoutes);
  // Column & task & comment routers hang off a project context:
  app.use('/api/projects', columnRoutes);
  app.use('/api/projects', taskRoutes);
  app.use('/api/projects', commentRoutes);
  app.use('/api/projects', activityRoutes);
  app.use('/api/projects', chatRoutes);
  app.use('/api/search', searchRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/agent', agentRoutes);
  app.use('/api/agent/legal', legalRoutes);
  app.use('/api/nlp', nlpRoutes);
  app.use('/api/projects', exportRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
