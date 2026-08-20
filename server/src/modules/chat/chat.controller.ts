import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { asyncHandler, validationError } from '../../utils/errors';
import { emitToProject, SOCKET_EVENTS } from '../../lib/socket';
import { getGroup, sendMessage } from './chat.service';

const idParam = z.object({ projectId: z.string().min(1) });

const sendSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

export const get = asyncHandler(async (req: Request, res: Response) => {
  const params = idParam.safeParse(req.params);
  if (!params.success) throw validationError(params.error, 'Invalid project id');

  const group = await getGroup(params.data.projectId, req.user!.id);
  res.status(StatusCodes.OK).json({ success: true, data: group });
});

export const send = asyncHandler(async (req: Request, res: Response) => {
  const params = idParam.safeParse(req.params);
  const body = sendSchema.safeParse(req.body);
  if (!params.success) throw validationError(params.error, 'Invalid project id');
  if (!body.success) throw validationError(body.error, 'Invalid message');

  const message = await sendMessage(params.data.projectId, req.user!.id, body.data.body);
  emitToProject(params.data.projectId, SOCKET_EVENTS.CHAT_MESSAGE, message);
  res.status(StatusCodes.CREATED).json({ success: true, data: message });
});