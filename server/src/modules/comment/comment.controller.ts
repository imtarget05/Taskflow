import { Role } from '@prisma/client';
import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { asyncHandler, AppError } from '../../utils/errors';
import { assertRole } from '../project/project.service';
import { createActivity } from '../task/task.service';
import { emitToProject, SOCKET_EVENTS } from '../../lib/socket';
import { prisma } from '../../lib/prisma';

const createSchema = z.object({ body: z.string().min(1).max(4000) });
const idParam = z.object({ projectId: z.string().min(1), taskId: z.string().min(1) });

export const create = asyncHandler(async (req: Request, res: Response) => {
  const params = idParam.safeParse(req.params);
  const body = createSchema.safeParse(req.body);
  if (!params.success) throw new AppError('Invalid ids', StatusCodes.BAD_REQUEST);
  if (!body.success) throw new AppError('Comment cannot be empty', StatusCodes.BAD_REQUEST);

  await assertRole(params.data.projectId, req.user!.id, Role.MEMBER);

  const comment = await prisma.comment.create({
    data: { taskId: params.data.taskId, authorId: req.user!.id, body: body.data.body.trim() },
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
  });

  await createActivity(params.data.projectId, req.user!.id, params.data.taskId, 'COMMENT_ADDED', {
    body: body.data.body.slice(0, 60),
  });

  emitToProject(params.data.projectId, SOCKET_EVENTS.COMMENT_ADDED, comment);
  res.status(StatusCodes.CREATED).json({ success: true, data: comment });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const params = idParam.safeParse(req.params);
  if (!params.success) throw new AppError('Invalid ids', StatusCodes.BAD_REQUEST);

    const commentId = Array.isArray(req.params.commentId)
    ? req.params.commentId[0]
    : req.params.commentId;
  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment) throw new AppError('Comment not found', StatusCodes.NOT_FOUND);

  await assertRole(params.data.projectId, req.user!.id, Role.MEMBER);

  // Only the author (or project owner) can delete their comment.
  if (comment.authorId !== req.user!.id) {
    await assertRole(params.data.projectId, req.user!.id, Role.OWNER);
  }

  await prisma.comment.delete({ where: { id: comment.id } });
  res.status(StatusCodes.OK).json({ success: true, message: 'Comment deleted' });
});