import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../../middlewares/auth';
import { env } from '../../config/env';
import * as legalController from './legal.controller';

// LLM calls are slow and expensive; keep legal lookups modest per user.
const legalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_LEGAL,
  standardHeaders: true,
  legacyHeaders: false,
});

const router = Router();

router.get('/status', legalController.status);
router.post('/', authenticate, legalLimiter, legalController.search);

export default router;