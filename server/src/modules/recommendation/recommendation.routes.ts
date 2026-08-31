import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import * as recommendationController from './recommendation.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Recommendation routes
router.get('/me', recommendationController.listMyRecommendations);
router.post('/refresh', recommendationController.refresh);
router.get('/config', recommendationController.getConfig);
router.put('/config', recommendationController.updateConfig);
router.post('/:id/accept', recommendationController.accept);
router.post('/:id/dismiss', recommendationController.dismiss);
router.get('/stats', recommendationController.getStats);

// User profile routes (skills & availability)
router.get('/users/me/skills', recommendationController.getMySkills);
router.put('/users/me/skills', recommendationController.updateMySkills);
router.get('/users/me/availability', recommendationController.getMyAvailability);
router.put('/users/me/availability', recommendationController.updateMyAvailability);

export default router;
