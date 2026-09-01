import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../lib/prisma';
import { asyncHandler, validationError } from '../../utils/errors';
import * as promptService from './prompt.service';
import {
  createPromptSchema,
  activatePromptSchema,
  renderPromptSchema,
  createExperimentSchema,
  recordResultSchema,
  idParamSchema,
} from './prompt.schema';

// GET /api/prompts
export const listPrompts = asyncHandler(async (req: Request, res: Response) => {
  const name = req.query.name as string | undefined;
  const prompts = await promptService.listPrompts(name);

  res.status(StatusCodes.OK).json({
    success: true,
    data: prompts,
    count: prompts.length,
  });
});

// POST /api/prompts
export const createPrompt = asyncHandler(async (req: Request, res: Response) => {
  const body = createPromptSchema.safeParse(req.body);
  if (!body.success) throw validationError(body.error, 'Invalid prompt data');

  const userId = (req.user as { id?: string } | undefined)?.id;
  const prompt = await promptService.createPrompt({
    ...body.data,
    createdBy: userId,
  });

  res.status(StatusCodes.CREATED).json({
    success: true,
    data: prompt,
  });
});

// PUT /api/prompts/:id/activate
export const activatePrompt = asyncHandler(async (req: Request, res: Response) => {
  const params = idParamSchema.safeParse(req.params);
  if (!params.success) throw validationError(params.error, 'Invalid prompt id');

  const body = activatePromptSchema.safeParse(req.body);
  if (!body.success) throw validationError(body.error, 'Invalid activation data');

  const result = await promptService.activatePrompt(body.data.name, body.data.version);

  res.status(StatusCodes.OK).json({
    success: true,
    data: result,
  });
});

// GET /api/prompts/:name/active
export const getActivePrompt = asyncHandler(async (req: Request, res: Response) => {
  const name = req.params.name as string;
  const prompt = await promptService.getActivePrompt(name);

  res.status(StatusCodes.OK).json({
    success: true,
    data: prompt,
  });
});

// POST /api/prompts/render
export const renderPrompt = asyncHandler(async (req: Request, res: Response) => {
  const body = renderPromptSchema.safeParse(req.body);
  if (!body.success) throw validationError(body.error, 'Invalid render data');

  const rendered = await promptService.renderPrompt(body.data.name, body.data.variables);

  res.status(StatusCodes.OK).json({
    success: true,
    data: { rendered },
  });
});

// POST /api/prompts/experiments
export const createExperiment = asyncHandler(async (req: Request, res: Response) => {
  const body = createExperimentSchema.safeParse(req.body);
  if (!body.success) throw validationError(body.error, 'Invalid experiment data');

  const experiment = await promptService.createExperiment(body.data);

  res.status(StatusCodes.CREATED).json({
    success: true,
    data: experiment,
  });
});

// GET /api/prompts/experiments
export const listExperiments = asyncHandler(async (req: Request, res: Response) => {
  const promptName = req.query.promptName as string | undefined;
  const experiments = await prisma.promptExperiment.findMany({
    where: promptName ? { promptName } : undefined,
    orderBy: { startedAt: 'desc' },
  });

  res.status(StatusCodes.OK).json({
    success: true,
    data: experiments,
    count: experiments.length,
  });
});

// POST /api/prompts/experiments/:id/record
export const recordResult = asyncHandler(async (req: Request, res: Response) => {
  const params = idParamSchema.safeParse(req.params);
  if (!params.success) throw validationError(params.error, 'Invalid experiment id');

  const body = recordResultSchema.safeParse(req.body);
  if (!body.success) throw validationError(body.error, 'Invalid result data');

  const result = await promptService.recordExperimentResult(
    params.data.id,
    body.data.variant,
    body.data.metrics
  );

  res.status(StatusCodes.OK).json({
    success: true,
    data: result,
  });
});

// GET /api/prompts/experiments/:id/analyze
export const analyzeExperiment = asyncHandler(async (req: Request, res: Response) => {
  const params = idParamSchema.safeParse(req.params);
  if (!params.success) throw validationError(params.error, 'Invalid experiment id');

  const result = await promptService.analyzeExperiment(params.data.id);

  res.status(StatusCodes.OK).json({
    success: true,
    data: result,
  });
});

