import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../../middlewares/auth';
import { env } from '../../config/env';
import * as agentController from './agent.controller';

// LLM calls are slow and expensive; keep per-user chat traffic modest.
const chatLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

const router = Router();

router.get('/status', agentController.status);
router.post('/chat', authenticate, chatLimiter, agentController.chat);

export default router;