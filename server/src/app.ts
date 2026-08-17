import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './utils/errors';
import authRoutes from './modules/auth/auth.routes';
import projectRoutes from './modules/project/project.routes';
import columnRoutes from './modules/column/column.routes';
import taskRoutes from './modules/task/task.routes';
import commentRoutes from './modules/comment/comment.routes';
import activityRoutes from './modules/activity/activity.routes';

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.CLIENT_URL,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Global rate limiting.
  app.use(
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  // Health check.
  app.get('/api/health', (_req, res) => {
    res.json({ success: true, status: 'ok', uptime: process.uptime() });
  });

  // API routes.
  app.use('/api/auth', authRoutes);
  app.use('/api/projects', projectRoutes);
  // Column & task & comment routers hang off a project context:
  app.use('/api/projects', columnRoutes);
  app.use('/api/projects', taskRoutes);
  app.use('/api/projects', commentRoutes);
  app.use('/api/projects', activityRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
