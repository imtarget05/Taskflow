import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { asyncHandler, validationError } from '../../utils/errors';
import {
  evaluateRagas,
  runEvaluation as runEvalService,
  compareRuns,
  getEvaluationHistory,
} from './evaluator.service';

const ragasSchema = z.object({
  question: z.string().min(1).max(2000),
  answer: z.string().min(0).max(10000),
  context: z.array(z.string()).min(0).max(50),
});

const runSchema = z.object({
  name: z.string().min(1).max(100),
  promptVersion: z.string().max(50).optional(),
  config: z.record(z.unknown()).optional(),
  items: z.array(
    z.object({
      question: z.string().min(1).max(2000),
      answer: z.string().min(0).max(10000),
      context: z.array(z.string()).min(0).max(50),
      accuracy: z.number().min(0).max(1).optional(),
    }),
  ).min(1).max(500),
});

export const computeRagas = asyncHandler(async (req: Request, res: Response) => {
  const parsed = ragasSchema.safeParse(req.body);
  if (!parsed.success) {
    throw validationError(parsed.error);
  }
  const metrics = evaluateRagas(parsed.data);
  res.status(StatusCodes.OK).json({ success: true, metrics });
});

export const runEvaluation = asyncHandler(async (req: Request, res: Response) => {
  const parsed = runSchema.safeParse(req.body);
  if (!parsed.success) {
    throw validationError(parsed.error);
  }
  const result = await runEvalService(
    parsed.data.name,
    parsed.data.items,
    parsed.data.config ?? null,
    parsed.data.promptVersion ?? null,
  );
  res.status(StatusCodes.CREATED).json({ success: true, ...result });
});

export const history = asyncHandler(async (req: Request, res: Response) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const runs = await getEvaluationHistory(limit);
  res.status(StatusCodes.OK).json({ success: true, runs });
});

export const compare = asyncHandler(async (req: Request, res: Response) => {
  const { a, b } = req.params as { a: string; b: string };
  const result = await compareRuns(a, b);
  res.status(StatusCodes.OK).json({ success: true, ...result });
});
