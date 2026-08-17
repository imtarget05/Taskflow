import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import * as columnController from './column.controller';

const router = Router();

router.use(authenticate);

// POST /api/projects/:projectId/columns  (create)
// PATCH /api/projects/:projectId/columns/:columnId  (rename)
// DELETE /api/projects/:projectId/columns/:columnId  (delete)
// POST /api/projects/:projectId/columns/:columnId/move  (drag-and-drop)
router.post('/:projectId/columns', columnController.create);
router.patch('/:projectId/columns/:columnId', columnController.update);
router.delete('/:projectId/columns/:columnId', columnController.remove);
router.post('/:projectId/columns/:columnId/move', columnController.moveTask);

export default router;
