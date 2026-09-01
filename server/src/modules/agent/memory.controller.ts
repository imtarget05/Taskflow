import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { asyncHandler, validationError } from '../../utils/errors';
import * as memoryService from './memory.service';

const searchSchema = z.object({
  query: z.string().min(1).max(1000),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

const createSchema = z.object({
  content: z.string().min(1).max(2000),
  category: z.enum(['preference', 'fact', 'decision', 'context']),
  source: z.enum(['conversation', 'task', 'manual']).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const listMemories = asyncHandler(async (req: Request, res: Response) => {
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  const memories = await memoryService.listMemories(
    req.user!.id,
    category as memoryService.MemoryCategory | undefined
  );
  res.status(StatusCodes.OK).json({ success: true, data: memories });
});

export const searchMemories = asyncHandler(async (req: Request, res: Response) => {
  const parsed = searchSchema.safeParse(req.body);
  if (!parsed.success) {
    throw validationError(parsed.error);
  }
  const memories = await memoryService.retrieveRelevantMemories(
    req.user!.id,
    parsed.data.query,
    parsed.data.limit ?? 5
  );
  res.status(StatusCodes.OK).json({ success: true, data: memories });
});

export const createMemory = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    throw validationError(parsed.error);
  }
  const memory = await memoryService.storeMemory(
    req.user!.id,
    parsed.data.content,
    parsed.data.category,
    parsed.data.source ?? 'manual',
    parsed.data.confidence ?? 1.0
  );
  res.status(StatusCodes.CREATED).json({ success: true, data: memory });
});

export const deleteMemory = asyncHandler(async (req: Request, res: Response) => {
  await memoryService.deleteMemory(req.user!.id, String(req.params.id));
  res.status(StatusCodes.OK).json({ success: true });
});

export const crossSessionSummary = asyncHandler(async (req: Request, res: Response) => {
  const summary = await memoryService.crossSessionSummary(req.user!.id);
  res.status(StatusCodes.OK).json({ success: true, data: { summary } });
});
