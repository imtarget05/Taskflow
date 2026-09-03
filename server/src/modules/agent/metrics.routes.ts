import { Router } from 'express';
import { metricsHandler } from './metrics.controller';

const router = Router();

router.get('/metrics', metricsHandler);

export default router;