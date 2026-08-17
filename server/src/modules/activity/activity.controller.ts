import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { asyncHandler, AppError } from '../../utils/errors';
import { assertRole } from '../project/project.service';
import { prisma } from '../../lib/prisma';

const idParam = z.object({ projectId: z.string().min(1) });

export const list = asyncHandler(async (req: Request, res: Response) => {
  const params = idParam.safeParse(req.params);
  if (!params.success) throw new AppError('Invalid project id', StatusCodes.BAD_REQUEST);

  await assertRole(params.data.projectId, req.user!.id, 'VIEWER');

  const activities = await prisma.activity.findMany({
    where: { projectId: params.data.projectId },
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  res.status(StatusCodes.OK).json({ success: true, data: activities });
});