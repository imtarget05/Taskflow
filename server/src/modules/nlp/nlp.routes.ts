import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../../middlewares/auth';
import { env } from '../../config/env';
import * as nlpController from './nlp.controller';

// LLM-backed classification is slow and costs tokens; keep per-user traffic modest.
const analyseLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

const router = Router();

router.post('/analyse', authenticate, analyseLimiter, nlpController.analyse);
router.get('/', authenticate, nlpController.list);
router.get('/:id', authenticate, nlpController.get);
router.delete('/:id', authenticate, nlpController.remove);

export default router;
