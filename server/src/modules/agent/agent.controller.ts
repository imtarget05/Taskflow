import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { asyncHandler, validationError } from '../../utils/errors';
import * as agentService from './agent.service';

const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string().min(1).max(8000),
      })
    )
    .min(1)
    .max(50),
});

export const chat = asyncHandler(async (req: Request, res: Response) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    throw validationError(parsed.error);
  }
  const result = await agentService.chat(parsed.data.messages);
  res.status(StatusCodes.OK).json({ success: true, ...result });
});

export const status = asyncHandler(async (_req: Request, res: Response) => {
  res.status(StatusCodes.OK).json({ success: true, ...agentService.agentStatus() });
});