import { Role } from '@prisma/client';
import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { asyncHandler, AppError } from '../../utils/errors';
import { emitToProject, SOCKET_EVENTS } from '../../lib/socket';
import { assertRole } from '../project/project.service';
import { prisma } from '../../lib/prisma';

const createSchema = z.object({
  projectId: z.string().min(1),
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
  const body = createSchema.safeParse(req.body);
  if (!body.success) throw new AppError('Invalid column data', StatusCodes.BAD_REQUEST);

  await assertRole(body.data.projectId, req.user!.id, Role.MEMBER);

  const maxPos = await prisma.column.aggregate({
    where: { projectId: body.data.projectId },
    _max: { position: true },
  });
  const nextPos = (maxPos._max.position ?? -1) + 1;

  const column = await prisma.column.create({
    data: {
      projectId: body.data.projectId,
      name: body.data.name.trim(),
      position: nextPos,
    },
  });

  emitToProject(column.projectId, SOCKET_EVENTS.COLUMN_CREATED, column);
  res.status(StatusCodes.CREATED).json({ success: true, data: column });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const params = idParam.safeParse(req.params);
  const body = updateSchema.safeParse(req.body);
  if (!params.success) throw new AppError('Invalid ids', StatusCodes.BAD_REQUEST);
  if (!body.success) throw new AppError('Invalid column data', StatusCodes.BAD_REQUEST);

  await assertRole(params.data.projectId, req.user!.id, Role.MEMBER);

  const column = await prisma.column.update({
    where: { id: params.data.columnId },
    data: { name: body.data.name.trim() },
  });
  emitToProject(params.data.projectId, SOCKET_EVENTS.COLUMN_UPDATED, column);
  res.status(StatusCodes.OK).json({ success: true, data: column });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const params = idParam.safeParse(req.params);
  if (!params.success) throw new AppError('Invalid ids', StatusCodes.BAD_REQUEST);

  // Owner of project is required to delete a column (destructive).
  await assertRole(params.data.projectId, req.user!.id, Role.OWNER);

  // Move orphaned tasks to the first remaining column before deleting.
  const column = await prisma.column.findUnique({
    where: { id: params.data.columnId },
    include: { tasks: true },
  });
  if (!column) throw new AppError('Column not found', StatusCodes.NOT_FOUND);

  const fallback = await prisma.column.findFirst({
    where: { projectId: params.data.projectId, id: { not: params.data.columnId } },
    orderBy: { position: 'asc' },
  });

  if (fallback && column.tasks.length > 0) {
    const maxPos = await prisma.task.aggregate({
      where: { columnId: fallback.id },
      _max: { position: true },
    });
    let pos = (maxPos._max.position ?? -1) + 1;
    for (const task of column.tasks) {
      await prisma.task.update({
        where: { id: task.id },
        data: { columnId: fallback.id, position: pos++ },
      });
    }
  }

  await prisma.column.delete({ where: { id: params.data.columnId } });
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
  if (!params.success) throw new AppError('Invalid ids', StatusCodes.BAD_REQUEST);
  if (!body.success) throw new AppError('Invalid move data', StatusCodes.BAD_REQUEST);

  await assertRole(params.data.projectId, req.user!.id, Role.MEMBER);

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

