import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import * as mlopsController from './mlops.controller';

const router = Router();

router.use(authenticate);

router.get('/experiments', mlopsController.listExperiments);
router.post('/experiments', mlopsController.createExperiment);
router.get('/experiments/:id', mlopsController.getExperiment);
router.put('/experiments/:id/metrics', mlopsController.recordMetrics);
router.get('/compare', mlopsController.compareExperiments);
router.get('/best', mlopsController.getBestConfig);

export default router;
