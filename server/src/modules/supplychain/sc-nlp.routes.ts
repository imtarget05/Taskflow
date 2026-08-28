import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import * as scNlpController from './sc-nlp.controller';

const router = Router();

// All SC NLP routes require authentication
router.use(authenticate);

// SC NLP analysis
router.post('/analyse-order', scNlpController.analyseOrder);

export default router;
