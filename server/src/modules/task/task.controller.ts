import { TaskPriority } from '@prisma/client';
import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { asyncHandler, validationError } from '../../utils/errors';
import * as taskService from './task.service';
import { assertRole } from '../project/project.service';

const createSchema = z.object({
  columnId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  dueDate: z.string().optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  assigneeIds: z.array(z.string()).optional(),
});

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(4000).optional(),
  dueDate: z.string().nullable().optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  columnId: z.string().optional(),
  assigneeIds: z.array(z.string()).optional(),
  completed: z.boolean().optional(),
});

const idParam = z.object({ projectId: z.string().min(1), taskId: z.string().min(1) });
const projectParam = z.object({ projectId: z.string().min(1) });

export const listMyTasks = asyncHandler(async (req: Request, res: Response) => {
  const assigneeId = req.query.assigneeId === 'me' ? req.user!.id : undefined;
  const tasks = await taskService.listMyTasks(req.user!.id, assigneeId);
  res.status(StatusCodes.OK).json({ success: true, data: tasks });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const params = projectParam.safeParse(req.params);
  const body = createSchema.safeParse(req.body);
  if (!params.success) throw validationError(params.error, 'Invalid project id');
  if (!body.success) throw validationError(body.error, 'Invalid task data');
  const task = await taskService.createTask(req.user!.id, {
    ...body.data,
    projectId: params.data.projectId,
  });
  res.status(StatusCodes.CREATED).json({ success: true, data: task });
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const params = idParam.safeParse(req.params);
  if (!params.success) throw validationError(params.error, 'Invalid ids');
  await assertRole(params.data.projectId, req.user!.id, 'VIEWER');
  const task = await taskService.getTask(params.data.taskId);
  res.status(StatusCodes.OK).json({ success: true, data: task });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const params = projectParam.safeParse(req.params);
  if (!params.success) throw validationError(params.error, 'Invalid project id');
  await assertRole(params.data.projectId, req.user!.id, 'VIEWER');
  const tasks = await taskService.listTasks(params.data.projectId);
  res.status(StatusCodes.OK).json({ success: true, data: tasks });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const params = idParam.safeParse(req.params);
  const body = updateSchema.safeParse(req.body);
  if (!params.success) throw validationError(params.error, 'Invalid ids');
  if (!body.success) throw validationError(body.error, 'Invalid task data');
  const task = await taskService.updateTask(
    req.user!.id,
    params.data.projectId,
    params.data.taskId,
    body.data
  );
  res.status(StatusCodes.OK).json({ success: true, data: task });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const params = idParam.safeParse(req.params);
  if (!params.success) throw validationError(params.error, 'Invalid ids');
  const result = await taskService.deleteTask(
    req.user!.id,
    params.data.projectId,
    params.data.taskId
  );
  res.status(StatusCodes.OK).json({ success: true, data: result });
});
