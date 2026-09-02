import { Prisma, TaskPriority } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { assertRole } from '../project/project.service';
import { emitToProject, SOCKET_EVENTS } from '../../lib/socket';
import { AppError } from '../../utils/errors';
import { escapeHtml } from '../../utils/sanitize';
import { createActivity } from '../activity/activity.service';

export interface CreateTaskData {
  projectId: string;
  columnId: string;
  title: string;
  description?: string;
  dueDate?: string;
  priority?: TaskPriority;
  assigneeIds?: string[];
}

export interface UpdateTaskData {
  title?: string;
  description?: string;
  dueDate?: string | null;
  priority?: TaskPriority;
  columnId?: string;
  assigneeIds?: string[];
  completed?: boolean;
}

export async function createTask(actorId: string, data: CreateTaskData) {
  await assertRole(data.projectId, actorId, 'MEMBER');

  // Verify column belongs to project
  const column = await prisma.column.findUnique({
    where: { id: data.columnId },
  });
  if (!column || column.projectId !== data.projectId) {
    throw new AppError('Column does not belong to project', 400);
  }

  const before = await createActivity(data.projectId, actorId, null, 'TASK_CREATED', {
    title: data.title,
  });

  const maxPos = await prisma.task.aggregate({
    where: { columnId: data.columnId },
    _max: { position: true },
  });
  const nextPos = (maxPos._max.position ?? -1) + 1;

  const task = await prisma.task.create({
    data: {
      projectId: data.projectId,
      columnId: data.columnId,
      title: escapeHtml(data.title.trim()),
      description: data.description ? escapeHtml(data.description) : data.description,
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      priority: data.priority ?? TaskPriority.MEDIUM,
      position: nextPos,
      createdById: actorId,
      assignments: data.assigneeIds?.length
        ? { create: data.assigneeIds.map((userId) => ({ userId })) }
        : undefined,
    },
    include: {
      assignments: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
      comments: true,
    },
  });

  // Link the activity record to the created task.
  await prisma.activity.update({ where: { id: before.id }, data: { taskId: task.id } });

  emitToProject(data.projectId, SOCKET_EVENTS.TASK_CREATED, task);
  return task;
}

export async function updateTask(
  actorId: string,
  projectId: string,
  taskId: string,
  data: UpdateTaskData
) {
  await assertRole(projectId, actorId, 'MEMBER');

  const existing = await prisma.task.findUnique({ where: { id: taskId } });
  if (!existing) throw new AppError('Task not found', 404);
  if (existing.projectId !== projectId) throw new AppError('Task not found', 404);

  const updates: Prisma.TaskUpdateInput = {};
  if (data.title !== undefined) updates.title = escapeHtml(data.title.trim());
  if (data.description !== undefined) updates.description = data.description ? escapeHtml(data.description) : data.description;
  if (data.priority !== undefined) updates.priority = data.priority;
  if (data.completed !== undefined) updates.completed = data.completed;
  if (data.dueDate !== undefined) updates.dueDate = data.dueDate ? new Date(data.dueDate) : null;

  if (data.assigneeIds !== undefined) {
    updates.assignments = { deleteMany: {}, create: data.assigneeIds.map((userId) => ({ userId })) };
  }

  if (data.columnId && data.columnId !== existing.columnId) {
    const column = await prisma.column.findUnique({ where: { id: data.columnId } });
    if (!column || column.projectId !== projectId) throw new AppError('Column does not belong to project', 400);
    const maxPos = await prisma.task.aggregate({
      where: { columnId: data.columnId },
      _max: { position: true },
    });
    updates.position = (maxPos._max.position ?? -1) + 1;
    updates.column = { connect: { id: data.columnId } };
  }

  const task = await prisma.task.update({
    where: { id: taskId },
    data: updates,
    include: {
      assignments: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
    },
  });

  await createActivity(projectId, actorId, taskId, 'TASK_UPDATED', { title: task.title });

  emitToProject(projectId, SOCKET_EVENTS.TASK_UPDATED, task);
  return task;
}

export async function deleteTask(actorId: string, projectId: string, taskId: string) {
  await assertRole(projectId, actorId, 'MEMBER');
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new AppError('Task not found', 404);
  if (task.projectId !== projectId) throw new AppError('Task not found', 404);

  // Log the deletion while the task still exists (activity taskId is FK-linked).
  await createActivity(projectId, actorId, taskId, 'TASK_DELETED', { title: task.title });
  await prisma.task.delete({ where: { id: taskId } });

  emitToProject(projectId, SOCKET_EVENTS.TASK_DELETED, { id: taskId });
  return { id: taskId };
}

export async function getTask(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      assignments: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
      comments: {
        include: { author: { select: { id: true, name: true, avatarUrl: true } } },
        orderBy: { createdAt: 'asc' },
      },
      createdBy: { select: { id: true, name: true, avatarUrl: true } },
    },
  });
  if (!task) throw new AppError('Task not found', 404);
  return task;
}

export async function updateTaskMetadata(taskId: string, metadata: Record<string, unknown>) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new AppError('Task not found', 404);
  return prisma.task.update({
    where: { id: taskId },
    data: { metadata: metadata as Prisma.InputJsonValue },
    include: {
      assignments: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
    },
  });
}

export async function listTasks(projectId: string) {
  return prisma.task.findMany({
    where: { projectId },
    include: {
      assignments: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
    },
    orderBy: { position: 'asc' },
  });
}
