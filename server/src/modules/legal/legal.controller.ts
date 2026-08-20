import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { asyncHandler, validationError } from '../../utils/errors';
import * as legalService from './legal.service';

const searchSchema = z.object({
  question: z.string().min(5).max(2000),
});

export const search = asyncHandler(async (req: Request, res: Response) => {
  const parsed = searchSchema.safeParse(req.body);
  if (!parsed.success) {
    throw validationError(parsed.error);
  }
  const result = await legalService.searchLegal(req.user!.id, parsed.data.question);
  res.status(StatusCodes.OK).json({ success: true, ...result });
});

export const status = asyncHandler(async (_req: Request, res: Response) => {
  const result = await legalService.legalStatus();
  res.status(StatusCodes.OK).json({ success: true, ...result });
});