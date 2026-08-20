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

// Uploads are cheap to process but cap abuse of the parser.
const uploadLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

const router = Router();

router.get('/status', agentController.status);
router.post('/chat', authenticate, chatLimiter, agentController.chat);
router.post('/upload', authenticate, uploadLimiter, agentController.upload.single('file'), agentController.uploadFile);
router.get('/conversations', authenticate, agentController.listConversations);
router.get('/conversations/:conversationId', authenticate, agentController.getConversation);
router.delete('/conversations/:conversationId', authenticate, agentController.deleteConversation);

export default router;