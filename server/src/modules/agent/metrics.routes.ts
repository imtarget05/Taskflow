import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { metricsHandler } from './metrics.controller';

const router = Router();

// Auth-required — Prometheus will use a service token via Authorization header
// (reuse existing authenticate: cookie or Bearer). No extra infra, same security model.
router.get('/metrics', authenticate, metricsHandler);

export default router;