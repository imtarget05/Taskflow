import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import * as taskController from './task.controller';

const router = Router();

router.use(authenticate);

// GET /api/tasks?assigneeId=me — global tasks for current user
router.get('/tasks', taskController.listMyTasks);

// POST /api/projects/:projectId/tasks
// GET /api/projects/:projectId/tasks
// GET /api/projects/:projectId/tasks/:taskId
// PATCH /api/projects/:projectId/tasks/:taskId
// DELETE /api/projects/:projectId/tasks/:taskId
router.post('/:projectId/tasks', taskController.create);
router.get('/:projectId/tasks', taskController.list);
router.get('/:projectId/tasks/:taskId', taskController.getById);
router.patch('/:projectId/tasks/:taskId', taskController.update);
router.delete('/:projectId/tasks/:taskId', taskController.remove);

export default router;
