import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../../middlewares/auth';
import { env } from '../../config/env';
import * as memoryController from './memory.controller';

const memoryLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

const router = Router();

router.get('/memories', authenticate, memoryLimiter, memoryController.listMemories);
router.post('/memories/search', authenticate, memoryLimiter, memoryController.searchMemories);
router.post('/memories', authenticate, memoryLimiter, memoryController.createMemory);
router.get('/memories/summary', authenticate, memoryLimiter, memoryController.crossSessionSummary);
router.delete('/memories/:id', authenticate, memoryLimiter, memoryController.deleteMemory);

export default router;
