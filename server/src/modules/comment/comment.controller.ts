import { Role } from '@prisma/client';
import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { asyncHandler, AppError, validationError } from '../../utils/errors';
import { assertRole } from '../project/project.service';
import { createActivity } from '../activity/activity.service';
import { emitToProject, SOCKET_EVENTS } from '../../lib/socket';
import { prisma } from '../../lib/prisma';
import { createComment, deleteComment } from './comment.service';

const createSchema = z.object({ body: z.string().min(1).max(4000) });
const idParam = z.object({ projectId: z.string().min(1), taskId: z.string().min(1) });

export const create = asyncHandler(async (req: Request, res: Response) => {
  const params = idParam.safeParse(req.params);
  const body = createSchema.safeParse(req.body);
  if (!params.success) throw validationError(params.error, 'Invalid ids');
  if (!body.success) throw validationError(body.error, 'Comment cannot be empty');

  await assertRole(params.data.projectId, req.user!.id, Role.MEMBER);
  const task = await prisma.task.findUnique({ where: { id: params.data.taskId }, select: { projectId: true } });
  if (!task || task.projectId !== params.data.projectId) throw new AppError('Task not found', StatusCodes.NOT_FOUND);

  const comment = await createComment(params.data.taskId, req.user!.id, body.data.body);

  await createActivity(params.data.projectId, req.user!.id, params.data.taskId, 'COMMENT_ADDED', {
    body: body.data.body.slice(0, 60),
  });

  emitToProject(params.data.projectId, SOCKET_EVENTS.COMMENT_ADDED, comment);
  res.status(StatusCodes.CREATED).json({ success: true, data: comment });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const params = idParam.safeParse(req.params);
  if (!params.success) throw validationError(params.error, 'Invalid ids');

  const commentId = req.params.commentId as string;
  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment) throw new AppError('Comment not found', StatusCodes.NOT_FOUND);
  const task = await prisma.task.findUnique({ where: { id: comment.taskId }, select: { projectId: true } });
  if (!task || task.projectId !== params.data.projectId || comment.taskId !== params.data.taskId) {
    throw new AppError('Comment not found', StatusCodes.NOT_FOUND);
  }

  await assertRole(params.data.projectId, req.user!.id, Role.MEMBER);

  // Only the author (or project owner) can delete their comment.
  if (comment.authorId !== req.user!.id) {
    await assertRole(params.data.projectId, req.user!.id, Role.OWNER);
  }

  await deleteComment(comment.id);
  res.status(StatusCodes.OK).json({ success: true, message: 'Comment deleted' });
});
