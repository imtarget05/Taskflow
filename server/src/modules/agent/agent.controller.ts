import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import multer from 'multer';
import { asyncHandler, validationError, AppError } from '../../utils/errors';
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
  language: z.enum(['auto', 'vi', 'en', 'zh']).optional(),
  projectId: z.string().max(60).nullable().optional(),
  conversationId: z.string().max(60).nullable().optional(),
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: agentService.MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase();
    if (agentService.UPLOAD_EXTENSIONS.has(ext)) {
      cb(null, true);
    } else {
      cb(new AppError(`Unsupported file type "${ext || '(none)'}"`, StatusCodes.BAD_REQUEST));
    }
  },
});

export { upload };

export const chat = asyncHandler(async (req: Request, res: Response) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    throw validationError(parsed.error);
  }
  const result = await agentService.chat(req.user!.id, parsed.data.messages, {
    language: parsed.data.language ?? null,
    projectId: parsed.data.projectId ?? null,
    conversationId: parsed.data.conversationId ?? null,
  });
  res.status(StatusCodes.OK).json({ success: true, ...result });
});

export const status = asyncHandler(async (_req: Request, res: Response) => {
  res.status(StatusCodes.OK).json({ success: true, ...agentService.agentStatus() });
});

export const listConversations = asyncHandler(async (req: Request, res: Response) => {
  const projectId =
    typeof req.query.projectId === 'string' && req.query.projectId ? req.query.projectId : null;
  const conversations = await agentService.listConversations(req.user!.id, projectId);
  res.status(StatusCodes.OK).json({ success: true, data: conversations });
});

export const getConversation = asyncHandler(async (req: Request, res: Response) => {
  const conversation = await agentService.getConversation(req.user!.id, String(req.params.conversationId));
  res.status(StatusCodes.OK).json({ success: true, data: conversation });
});

export const deleteConversation = asyncHandler(async (req: Request, res: Response) => {
  await agentService.deleteConversation(req.user!.id, String(req.params.conversationId));
  res.status(StatusCodes.OK).json({ success: true });
});

export const uploadFile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new AppError('No file uploaded', StatusCodes.BAD_REQUEST);
  }
  const result = await agentService.parseUpload(req.file.originalname, req.file.buffer);
  res.status(StatusCodes.OK).json({ success: true, data: result });
});