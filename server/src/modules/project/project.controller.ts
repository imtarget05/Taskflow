import { Role } from '@prisma/client';
import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { asyncHandler, AppError, validationError } from '../../utils/errors';
import * as projectService from './project.service';

const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  color: z.string().max(20).optional(),
  // Optional custom default columns (project creation wizard). When omitted,
  // the service falls back to the standard To Do / In Progress / Done trio.
  columnNames: z
    .array(z.string().trim().min(1).max(60))
    .min(1)
    .max(8)
    .optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(1000).optional(),
  color: z.string().max(20).optional(),
});

const addMemberSchema = z.object({
  email: z.string().email(),
  role: z.nativeEnum(Role).default(Role.MEMBER),
});

const idParam = z.object({ projectId: z.string().min(1) });
const userIdParam = z.object({ userId: z.string().min(1) });

export const create = asyncHandler(async (req: Request, res: Response) => {
  const body = createSchema.safeParse(req.body);
  if (!body.success) throw validationError(body.error, 'Invalid project data');
  const project = await projectService.createProject(req.user!.id, body.data);
  res.status(StatusCodes.CREATED).json({ success: true, data: project });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const projects = await projectService.listProjects(req.user!.id);
  res.status(StatusCodes.OK).json({ success: true, data: projects });
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const params = idParam.safeParse(req.params);
  if (!params.success) throw validationError(params.error, 'Invalid project id');
  const result = await projectService.getProject(params.data.projectId, req.user!.id);
  res.status(StatusCodes.OK).json({ success: true, data: result });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const params = idParam.safeParse(req.params);
  const body = updateSchema.safeParse(req.body);
  if (!params.success) throw validationError(params.error, 'Invalid project id');
  if (!body.success) throw validationError(body.error, 'Invalid project data');
  const result = await projectService.updateProject(
    params.data.projectId,
    req.user!.id,
    body.data
  );
  res.status(StatusCodes.OK).json({ success: true, data: result });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const params = idParam.safeParse(req.params);
  if (!params.success) throw validationError(params.error, 'Invalid project id');
  await projectService.deleteProject(params.data.projectId, req.user!.id);
  res.status(StatusCodes.OK).json({ success: true, message: 'Project deleted' });
});

export const addMember = asyncHandler(async (req: Request, res: Response) => {
  const params = idParam.safeParse(req.params);
  const body = addMemberSchema.safeParse(req.body);
  if (!params.success) throw new AppError('Invalid project id', StatusCodes.BAD_REQUEST);
  if (!body.success) throw new AppError('Invalid member data', StatusCodes.BAD_REQUEST);
  await projectService.addMember(params.data.projectId, req.user!.id, body.data);
  res.status(StatusCodes.CREATED).json({ success: true, message: 'Member added' });
});

export const removeMember = asyncHandler(async (req: Request, res: Response) => {
  const params = idParam.safeParse(req.params);
  const member = userIdParam.safeParse(req.params);
  if (!params.success || !member.success)
    throw new AppError('Invalid ids', StatusCodes.BAD_REQUEST);
  await projectService.removeMember(params.data.projectId, req.user!.id, member.data.userId);
  res.status(StatusCodes.OK).json({ success: true, message: 'Member removed' });
});

export const members = asyncHandler(async (req: Request, res: Response) => {
  const params = idParam.safeParse(req.params);
  if (!params.success) throw new AppError('Invalid project id', StatusCodes.BAD_REQUEST);
  const result = await projectService.listMembers(params.data.projectId, req.user!.id);
  res.status(StatusCodes.OK).json({ success: true, data: result });
});
