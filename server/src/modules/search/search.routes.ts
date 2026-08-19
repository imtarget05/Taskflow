import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import * as searchController from './search.controller';

const router = Router();

router.use(authenticate);

// GET /api/search?q=… — tasks across all projects the user belongs to.
router.get('/', searchController.search);

export default router;