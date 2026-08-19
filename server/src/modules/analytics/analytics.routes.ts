import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import * as analyticsController from './analytics.controller';

const router = Router();

router.use(authenticate);

router.get('/overview', analyticsController.overview);

export default router;