import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { asyncHandler, validationError } from '../../utils/errors';
import * as mlopsService from './mlops.service';
import {
  createExperimentSchema,
  recordMetricsSchema,
  compareSchema,
  listExperimentsSchema,
  bestConfigSchema,
  idParamSchema,
} from './mlops.schema';

// GET /api/mlops/experiments
export const listExperiments = asyncHandler(async (req: Request, res: Response) => {
  const query = listExperimentsSchema.safeParse(req.query);
  if (!query.success) throw validationError(query.error, 'Invalid query params');

  const result = await mlopsService.listExperiments(query.data);

  res.status(StatusCodes.OK).json({
    success: true,
    data: result.data,
    total: result.total,
    page: result.page,
    limit: result.limit,
  });
});

// POST /api/mlops/experiments
export const createExperiment = asyncHandler(async (req: Request, res: Response) => {
  const body = createExperimentSchema.safeParse(req.body);
  if (!body.success) throw validationError(body.error, 'Invalid request body');

  const userId = (req.user as { id?: string } | undefined)?.id;
  const experiment = await mlopsService.createExperiment({
    ...body.data,
    createdBy: userId,
  });

  res.status(StatusCodes.CREATED).json({
    success: true,
    data: experiment,
  });
});

// GET /api/mlops/experiments/:id
export const getExperiment = asyncHandler(async (req: Request, res: Response) => {
  const params = idParamSchema.safeParse(req.params);
  if (!params.success) throw validationError(params.error, 'Invalid experiment id');

  const experiment = await mlopsService.getExperiment(params.data.id);

  res.status(StatusCodes.OK).json({
    success: true,
    data: experiment,
  });
});

// PUT /api/mlops/experiments/:id/metrics
export const recordMetrics = asyncHandler(async (req: Request, res: Response) => {
  const params = idParamSchema.safeParse(req.params);
  if (!params.success) throw validationError(params.error, 'Invalid experiment id');

  const body = recordMetricsSchema.safeParse(req.body);
  if (!body.success) throw validationError(body.error, 'Invalid metrics data');

  const experiment = await mlopsService.recordMetrics(params.data.id, body.data);

  res.status(StatusCodes.OK).json({
    success: true,
    data: experiment,
  });
});

// GET /api/mlops/compare?ids=a,b,c
export const compareExperiments = asyncHandler(async (req: Request, res: Response) => {
  const ids = typeof req.query.ids === 'string' ? req.query.ids.split(',') : [];
  const query = compareSchema.safeParse({ ids });
  if (!query.success) throw validationError(query.error, 'Invalid ids param');

  const experiments = await mlopsService.compareExperiments(query.data.ids);

  res.status(StatusCodes.OK).json({
    success: true,
    data: experiments,
    count: experiments.length,
  });
});

// GET /api/mlops/best?metric=faithfulness
export const getBestConfig = asyncHandler(async (req: Request, res: Response) => {
  const query = bestConfigSchema.safeParse(req.query);
  if (!query.success) throw validationError(query.error, 'Invalid metric param');

  const best = await mlopsService.getBestConfig(query.data.metric);

  res.status(StatusCodes.OK).json({
    success: true,
    data: best,
  });
});
