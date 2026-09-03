import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../../middlewares/auth';
import { env } from '../../config/env';
import { routeHandler, routePreviewHandler } from './supervisor.controller';

const supervisorLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

const router = Router();

// All supervisor endpoints require auth (same security model as /api/agent/chat)
router.post('/route', authenticate, supervisorLimiter, routeHandler);
router.get('/route', authenticate, routePreviewHandler);

export default router;
