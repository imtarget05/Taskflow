import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import * as agenticController from './agentic.controller';

const router = Router();

// All agentic routes require authentication
router.use(authenticate);

// Process order through agentic decision engine
router.post('/process-order', agenticController.processOrder);

// Get decision history for a project
router.get('/decisions/:projectId', agenticController.getDecisions);

export default router;
