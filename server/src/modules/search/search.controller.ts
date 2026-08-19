import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { asyncHandler, validationError } from '../../utils/errors';
import * as searchService from './search.service';

const querySchema = z.object({
  q: z.string().min(1).max(100),
});

export const search = asyncHandler(async (req: Request, res: Response) => {
  const query = querySchema.safeParse(req.query);
  if (!query.success) throw validationError(query.error, 'Invalid search query');
  const tasks = await searchService.searchTasks(req.user!.id, query.data.q.trim());
  res.status(StatusCodes.OK).json({ success: true, data: tasks });
});