import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../../middlewares/auth';
import { env } from '../../config/env';
import * as agenticController from './agentic.controller';

// Agentic processing triggers LLM calls + n8n webhooks; keep per-user traffic modest.
const processLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

const router = Router();

// All agentic routes require authentication
router.use(authenticate);

// Process order through agentic decision engine
router.post('/process-order', processLimiter, agenticController.processOrder);

// Get decision history for a project
router.get('/decisions/:projectId', agenticController.getDecisions);

export default router;
