import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import * as exportController from './export.controller';

const router = Router();

router.use(authenticate);

// GET /api/projects/:projectId/export/csv
router.get('/:projectId/export/csv', exportController.csv);
// GET /api/projects/:projectId/export/sheets
router.get('/:projectId/export/sheets', exportController.sheets);

export default router;