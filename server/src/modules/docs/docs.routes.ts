import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { buildOpenApiDocument } from '../../lib/openapi';

const router = Router();

router.get('/openapi.json', (_req, res) => {
  res.json(buildOpenApiDocument());
});

router.use('/', swaggerUi.serve, swaggerUi.setup(buildOpenApiDocument(), { explorer: true }));

export default router;
