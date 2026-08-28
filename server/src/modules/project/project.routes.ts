import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import * as projectController from './project.controller';

const router = Router();

router.use(authenticate);

router.post('/', projectController.create);
router.post('/sc', projectController.createSCProject);
router.get('/', projectController.list);
router.get('/:projectId', projectController.getById);
router.patch('/:projectId', projectController.update);
router.delete('/:projectId', projectController.remove);
router.post('/:projectId/members', projectController.addMember);
router.get('/:projectId/members', projectController.members);
router.delete('/:projectId/members/:userId', projectController.removeMember);

export default router;
