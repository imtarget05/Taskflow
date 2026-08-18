import { Role } from '@prisma/client';
import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { asyncHandler, AppError, validationError } from '../../utils/errors';
import { emitToProject, SOCKET_EVENTS } from '../../lib/socket';
import { assertRole } from '../project/project.service';
import { prisma } from '../../lib/prisma';
import { createColumn, deleteColumn, renameColumn } from './column.service';

const createSchema = z.object({
  name: z.string().min(1).max(80),
});

const updateSchema = z.object({
  name: z.string().min(1).max(80),
});

const moveSchema = z.object({
  sourceColumnId: z.string().min(1),
  targetColumnId: z.string().min(1),
  sourceIndex: z.number().min(0),
  targetIndex: z.number().min(0),
});

const idParam = z.object({ projectId: z.string().min(1), columnId: z.string().min(1) });

export const create = asyncHandler(async (req: Request, res: Response) => {
  const params = idParam.omit({ columnId: true }).safeParse(req.params);
  const body = createSchema.safeParse(req.body);
  if (!params.success) throw validationError(params.error, 'Invalid ids');
  if (!body.success) throw validationError(body.error, 'Invalid column data');

  await assertRole(params.data.projectId, req.user!.id, Role.MEMBER);

  const column = await createColumn(params.data.projectId, body.data.name);

  emitToProject(column.projectId, SOCKET_EVENTS.COLUMN_CREATED, column);
  res.status(StatusCodes.CREATED).json({ success: true, data: column });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const params = idParam.safeParse(req.params);
  const body = updateSchema.safeParse(req.body);
  if (!params.success) throw validationError(params.error, 'Invalid ids');
  if (!body.success) throw validationError(body.error, 'Invalid column data');

  await assertRole(params.data.projectId, req.user!.id, Role.MEMBER);
  const updatedColumn = await renameColumn(params.data.projectId, params.data.columnId, body.data.name);
  emitToProject(params.data.projectId, SOCKET_EVENTS.COLUMN_UPDATED, updatedColumn);
  res.status(StatusCodes.OK).json({ success: true, data: updatedColumn });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const params = idParam.safeParse(req.params);
  if (!params.success) throw validationError(params.error, 'Invalid ids');

  // Owner of project is required to delete a column (destructive).
  await assertRole(params.data.projectId, req.user!.id, Role.OWNER);

  await deleteColumn(params.data.projectId, params.data.columnId);
  emitToProject(params.data.projectId, SOCKET_EVENTS.COLUMN_DELETED, {
    id: params.data.columnId,
  });
  res.status(StatusCodes.OK).json({ success: true, message: 'Column deleted' });
});

/**
 * Reorder: move task from sourceColumnId -> targetColumnId at targetIndex.
 * Used by the drag-and-drop interaction (both intra and inter column).
 * Emits a realtime update to the project room.
 */
export const moveTask = asyncHandler(async (req: Request, res: Response) => {
  const params = idParam.safeParse(req.params);
  const body = moveSchema.safeParse(req.body);
  if (!params.success) throw validationError(params.error, 'Invalid ids');
  if (!body.success) throw validationError(body.error, 'Invalid move data');

  await assertRole(params.data.projectId, req.user!.id, Role.MEMBER);

  const [sourceColumn, targetColumn] = await Promise.all([
    prisma.column.findUnique({ where: { id: body.data.sourceColumnId }, select: { projectId: true } }),
    prisma.column.findUnique({ where: { id: body.data.targetColumnId }, select: { projectId: true } }),
  ]);
  if (!sourceColumn || !targetColumn || sourceColumn.projectId !== params.data.projectId || targetColumn.projectId !== params.data.projectId) {
    throw new AppError('Columns do not belong to project', StatusCodes.BAD_REQUEST);
  }

  const task = await prisma.task.findFirst({
    where: { columnId: body.data.sourceColumnId },
    orderBy: { position: 'asc' },
    skip: body.data.sourceIndex,
  });

  if (!task) throw new AppError('Task not found at source position', StatusCodes.NOT_FOUND);

  // If moving within the same column, adjust positions.
  if (body.data.sourceColumnId === body.data.targetColumnId) {
    const nonMoved = await prisma.task.findMany({
      where: { columnId: body.data.sourceColumnId, id: { not: task.id } },
      orderBy: { position: 'asc' },
    });
    nonMoved.splice(body.data.targetIndex, 0, task);
    await prisma.$transaction(
      nonMoved.map((t, i) =>
        prisma.task.update({ where: { id: t.id }, data: { position: i } })
      )
    );
  } else {
    // Move to another column: remove from source, insert at target.
    const sourceTasks = await prisma.task.findMany({
      where: { columnId: body.data.sourceColumnId, id: { not: task.id } },
      orderBy: { position: 'asc' },
    });
    const targetTasks = await prisma.task.findMany({
      where: { columnId: body.data.targetColumnId },
      orderBy: { position: 'asc' },
    });
    targetTasks.splice(body.data.targetIndex, 0, task);

    const operations = [
      ...sourceTasks.map((t, i) =>
        prisma.task.update({ where: { id: t.id }, data: { position: i } })
      ),
      ...targetTasks.map((t, i) =>
        prisma.task.update({
          where: { id: t.id },
          data: { position: i, columnId: body.data.targetColumnId },
        })
      ),
    ];
    await prisma.$transaction(operations);
  }

  const movedTask = await prisma.task.findUnique({ where: { id: task.id } });
  emitToProject(params.data.projectId, SOCKET_EVENTS.TASK_MOVED, {
    taskId: task.id,
    sourceColumnId: body.data.sourceColumnId,
    targetColumnId: body.data.targetColumnId,
    targetIndex: body.data.targetIndex,
  });
  res.status(StatusCodes.OK).json({ success: true, data: movedTask });
});
