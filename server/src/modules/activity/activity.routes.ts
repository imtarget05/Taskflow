import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import * as activityController from './activity.controller';

const router = Router();

router.use(authenticate);

// GET /api/projects/:projectId/activities
router.get('/:projectId/activities', activityController.list);

export default router;
