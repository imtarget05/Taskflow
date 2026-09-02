import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { indexProjectHandler, searchHandler } from './rag.controller';

const router = Router();

router.post('/index/:projectId', authenticate, indexProjectHandler);
router.get('/search', authenticate, searchHandler);

export default router;
