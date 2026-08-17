import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import * as commentController from './comment.controller';

const router = Router();

router.use(authenticate);

// POST /api/projects/:projectId/tasks/:taskId/comments
// DELETE /api/projects/:projectId/tasks/:taskId/comments/:commentId
router.post('/:projectId/tasks/:taskId/comments', commentController.create);
router.delete('/:projectId/tasks/:taskId/comments/:commentId', commentController.remove);

export default router;
