import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { asyncHandler } from '../../utils/errors';
import { listRecentActivities } from './activity.service';

const query = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** GET /api/activities?limit=20 — cross-project feed for the dashboard. */
export const recent = asyncHandler(async (req: Request, res: Response) => {
  const parsed = query.safeParse(req.query);
  const limit = parsed.success ? parsed.data.limit : 20;

  const activities = await listRecentActivities(req.user!.id, limit);

  res.status(StatusCodes.OK).json({
    success: true,
    data: activities.map((a) => ({
      id: a.id,
      action: a.action,
      metadata: a.metadata,
      createdAt: a.createdAt,
      user: a.user,
      projectId: a.project.id,
      projectName: a.project.name,
    })),
  });
});
