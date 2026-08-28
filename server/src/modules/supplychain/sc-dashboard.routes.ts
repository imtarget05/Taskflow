import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import * as scDashboardController from './sc-dashboard.controller';

const router = Router();

// All SC dashboard routes require authentication
router.use(authenticate);

// Metrics
router.get('/dashboard/:projectId', scDashboardController.getMetrics);
router.get('/dashboard/:projectId/export/csv', scDashboardController.exportCsv);
router.get('/dashboard/:projectId/export/txt', scDashboardController.exportTxt);

export default router;
