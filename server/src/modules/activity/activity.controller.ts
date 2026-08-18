import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { asyncHandler, validationError } from '../../utils/errors';
import { assertRole } from '../project/project.service';
import { listActivities } from './activity.service';

const idParam = z.object({ projectId: z.string().min(1) });

export const list = asyncHandler(async (req: Request, res: Response) => {
  const params = idParam.safeParse(req.params);
  if (!params.success) throw validationError(params.error, 'Invalid project id');

  await assertRole(params.data.projectId, req.user!.id, 'VIEWER');

  const activities = await listActivities(params.data.projectId);

  res.status(StatusCodes.OK).json({ success: true, data: activities });
});
