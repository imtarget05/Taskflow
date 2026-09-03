import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { asyncHandler, validationError } from '../../utils/errors';
import * as analyticsService from './analytics.service';

export const overview = asyncHandler(async (req: Request, res: Response) => {
  const data = await analyticsService.getOverview(req.user!.id);
  res.status(StatusCodes.OK).json({ success: true, data });
});

const llmCostQuerySchema = z.object({
  projectId: z.string().max(60).optional(),
  model: z.string().max(120).optional(),
  days: z.coerce.number().int().min(1).max(365).optional(),
});

/**
 * GET /api/analytics/llm-cost?days=30&projectId=&model=
 * Cost dashboard — per-user by default; `projectId` switches to the team view
 * (requires project membership). Rows come from the persistent AIUsage ledger
 * written by the agent chat path (survives restarts, unlike /api/metrics).
 */
export const llmCost = asyncHandler(async (req: Request, res: Response) => {
  const parsed = llmCostQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw validationError(parsed.error);
  }
  const data = await analyticsService.getLlmCost(req.user!.id, parsed.data);
  res.status(StatusCodes.OK).json({ success: true, data });
});