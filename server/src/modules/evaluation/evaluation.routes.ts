import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../../middlewares/auth';
import { env } from '../../config/env';
import * as evaluationController from './evaluation.controller';

// Evaluation runs can be expensive (LLM calls); rate-limit modestly.
const evalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_LEGAL,
  standardHeaders: true,
  legacyHeaders: false,
});

const router = Router();

router.use(authenticate);

router.post('/ragas', evaluationController.computeRagas);
router.post('/run', evalLimiter, evaluationController.runEvaluation);
router.get('/history', evaluationController.history);
router.get('/compare/:a/:b', evaluationController.compare);

export default router;
