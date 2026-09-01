import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import * as promptController from './prompt.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Prompt template routes
router.get('/', promptController.listPrompts);
router.post('/', promptController.createPrompt);
router.get('/:name/active', promptController.getActivePrompt);
router.put('/:id/activate', promptController.activatePrompt);
router.post('/render', promptController.renderPrompt);

// Experiment routes
router.post('/experiments', promptController.createExperiment);
router.get('/experiments', promptController.listExperiments);
router.post('/experiments/:id/record', promptController.recordResult);
router.get('/experiments/:id/analyze', promptController.analyzeExperiment);

export default router;
