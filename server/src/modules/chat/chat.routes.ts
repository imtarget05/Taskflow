import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import * as chatController from './chat.controller';

const router = Router();

router.use(authenticate);

// GET /api/projects/:projectId/chat
router.get('/:projectId/chat', chatController.get);
// POST /api/projects/:projectId/chat/messages
router.post('/:projectId/chat/messages', chatController.send);

export default router;