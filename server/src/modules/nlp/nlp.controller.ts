import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { asyncHandler, validationError } from '../../utils/errors';
import * as nlpService from './nlp.service';

const analyseSchema = z.object({
  text: z.string().min(1).max(4000),
  projectId: z.string().max(60).nullable().optional(),
  taskId: z.string().max(60).nullable().optional(),
  candidates: z.array(z.string().min(1).max(4000)).max(20).optional(),
  duplicateThreshold: z.number().min(0).max(1).optional(),
});

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const feedbackSchema = z.object({
  analysisId: z.string().min(1).max(60),
  category: z.string().min(1).max(80),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
  decision: z.enum(['applied', 'ignored']),
});

export const analyse = asyncHandler(async (req: Request, res: Response) => {
  const parsed = analyseSchema.safeParse(req.body);
  if (!parsed.success) {
    throw validationError(parsed.error);
  }
  const d = parsed.data;
  const result = await nlpService.analyseText(d.text, {
    userId: req.user!.id,
    projectId: d.projectId ?? null,
    taskId: d.taskId ?? null,
    candidates: d.candidates,
    duplicateThreshold: d.duplicateThreshold,
  });
  res.status(StatusCodes.OK).json({ success: true, data: result });
});

export const feedback = asyncHandler(async (req: Request, res: Response) => {
  const parsed = feedbackSchema.safeParse(req.body);
  if (!parsed.success) {
    throw validationError(parsed.error);
  }
  await nlpService.recordFeedback({ userId: req.user!.id, ...parsed.data });
  res.status(StatusCodes.OK).json({ success: true });
});

export const stats = asyncHandler(async (req: Request, res: Response) => {
  const result = await nlpService.getNlpStats(req.user!.id);
  res.status(StatusCodes.OK).json({ success: true, data: result });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) {
    throw validationError(parsed.error);
  }
  const items = await nlpService.listAnalyses(req.user!.id, parsed.data.limit ?? 50);
  res.status(StatusCodes.OK).json({ success: true, data: items });
});

export const get = asyncHandler(async (req: Request, res: Response) => {
  const result = await nlpService.getAnalysis(req.user!.id, String(req.params.id));
  res.status(StatusCodes.OK).json({ success: true, data: result });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await nlpService.deleteAnalysis(req.user!.id, String(req.params.id));
  res.status(StatusCodes.OK).json({ success: true });
});
