import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import * as modelController from './model.controller';

const router = Router();

// All model routes require authentication
router.use(authenticate);

// List locally available models
router.get('/', modelController.listModels);

// Get Ollama connectivity status
router.get('/status', modelController.getStatus);

// Get model recommendations per tier
router.get('/recommendations', modelController.getRecommendations);

// Get model details
router.get('/:name', modelController.getModelDetail);

// Pull a new model
router.post('/pull', modelController.pullModel);

// Delete a local model
router.delete('/:name', modelController.deleteModel);

export default router;
