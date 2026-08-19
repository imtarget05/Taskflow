import { TaskPriority } from '@prisma/client';
import { AppError } from '../../../utils/errors';
import { createTask, deleteTask, getTask, listTasks, updateTask } from '../task.service';

jest.mock('../../../lib/prisma', () => ({
  prisma: {
    column: { findUnique: jest.fn() },
    task: {
      aggregate: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    activity: { update: jest.fn() },
  },
}));

jest.mock('../../../lib/socket', () => ({
  emitToProject: jest.fn(),
  SOCKET_EVENTS: {
    TASK_CREATED: 'task:created',
    TASK_UPDATED: 'task:updated',
    TASK_DELETED: 'task:deleted',
  },
}));

jest.mock('../../activity/activity.service', () => ({
  createActivity: jest.fn(),
}));

jest.mock('../../project/project.service', () => ({
  assertRole: jest.fn().mockResolvedValue({ role: 'MEMBER' }),
}));

import { prisma } from '../../../lib/prisma';
import { emitToProject } from '../../../lib/socket';
import { createActivity } from '../../activity/activity.service';
import { assertRole } from '../../project/project.service';

const mockedPrisma = prisma as unknown as {
  column: { findUnique: jest.Mock };
  task: {
    aggregate: jest.Mock;
    create: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  activity: { update: jest.Mock };
};

const mockedCreateActivity = createActivity as jest.Mock;
const mockedAssertRole = assertRole as jest.Mock;

describe('task.service', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('createTask', () => {
    it('creates a task at the end of the column and links the activity', async () => {
      mockedPrisma.column.findUnique.mockResolvedValue({ id: 'c1', projectId: 'p1' });
      mockedCreateActivity.mockResolvedValue({ id: 'a1' });
      mockedPrisma.task.aggregate.mockResolvedValue({ _max: { position: 1 } });
      mockedPrisma.task.create.mockResolvedValue({ id: 't1', projectId: 'p1' });
      mockedPrisma.activity.update.mockResolvedValue({ id: 'a1', taskId: 't1' });

      const result = await createTask('u1', {
        projectId: 'p1',
        columnId: 'c1',
        title: '  Sprint planning  ',
        priority: TaskPriority.HIGH,
      });

      expect(mockedAssertRole).toHaveBeenCalledWith('p1', 'u1', 'MEMBER');
      expect(mockedPrisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Sprint planning',
            priority: TaskPriority.HIGH,
            position: 2,
            createdById: 'u1',
          }),
        })
      );
      expect(mockedPrisma.activity.update).toHaveBeenCalledWith({
        where: { id: 'a1' },
        data: { taskId: 't1' },
      });
      expect(emitToProject).toHaveBeenCalledWith('p1', 'task:created', { id: 't1', projectId: 'p1' });
      expect(result).toEqual({ id: 't1', projectId: 'p1' });
    });

    it('throws 400 when the column does not belong to the project', async () => {
      mockedPrisma.column.findUnique.mockResolvedValue({ id: 'c1', projectId: 'other-p' });

      await expect(
        createTask('u1', { projectId: 'p1', columnId: 'c1', title: 'X' })
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(mockedPrisma.task.create).not.toHaveBeenCalled();
    });
  });

  describe('updateTask', () => {
    it('throws 404 when the task does not exist', async () => {
      mockedPrisma.task.findUnique.mockResolvedValue(null);

      await expect(updateTask('u1', 'p1', 't1', { title: 'New' })).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('throws 404 when the task belongs to another project', async () => {
      mockedPrisma.task.findUnique.mockResolvedValue({ id: 't1', projectId: 'other-p' });

      await expect(updateTask('u1', 'p1', 't1', { title: 'New' })).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('updates fields, moves columns, logs activity and emits', async () => {
      mockedPrisma.task.findUnique.mockResolvedValueOnce({ id: 't1', projectId: 'p1', columnId: 'c1' });
      mockedPrisma.column.findUnique.mockResolvedValue({ id: 'c2', projectId: 'p1' });
      mockedPrisma.task.aggregate.mockResolvedValue({ _max: { position: 0 } });
      mockedPrisma.task.update.mockResolvedValue({ id: 't1', title: 'Renamed' });
      mockedCreateActivity.mockResolvedValue({ id: 'a2' });

      const result = await updateTask('u1', 'p1', 't1', {
        title: '  Renamed  ',
        columnId: 'c2',
        assigneeIds: ['u2'],
        completed: true,
      });

      expect(mockedPrisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Renamed',
            position: 1,
            completed: true,
            column: { connect: { id: 'c2' } },
            assignments: { deleteMany: {}, create: [{ userId: 'u2' }] },
          }),
        })
      );
      expect(mockedCreateActivity).toHaveBeenCalledWith('p1', 'u1', 't1', 'TASK_UPDATED', {
        title: 'Renamed',
      });
      expect(emitToProject).toHaveBeenCalledWith('p1', 'task:updated', { id: 't1', title: 'Renamed' });
      expect(result).toEqual({ id: 't1', title: 'Renamed' });
    });
  });

  describe('deleteTask', () => {
    it('throws 404 when not found', async () => {
      mockedPrisma.task.findUnique.mockResolvedValue(null);

      await expect(deleteTask('u1', 'p1', 't1')).rejects.toMatchObject({ statusCode: 404 });
    });

    it('deletes the task, logs activity and emits', async () => {
      mockedPrisma.task.findUnique.mockResolvedValue({ id: 't1', projectId: 'p1', title: 'Old' });
      mockedPrisma.task.delete.mockResolvedValue({ id: 't1' });
      mockedCreateActivity.mockResolvedValue({ id: 'a3' });

      const result = await deleteTask('u1', 'p1', 't1');

      expect(mockedPrisma.task.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
      expect(mockedCreateActivity).toHaveBeenCalledWith('p1', 'u1', 't1', 'TASK_DELETED', {
        title: 'Old',
      });
      expect(emitToProject).toHaveBeenCalledWith('p1', 'task:deleted', { id: 't1' });
      expect(result).toEqual({ id: 't1' });
    });
  });

  describe('getTask', () => {
    it('returns the task with relations', async () => {
      mockedPrisma.task.findUnique.mockResolvedValue({ id: 't1', title: 'Task' });

      const result = await getTask('t1');

      expect(mockedPrisma.task.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 't1' } })
      );
      expect(result).toEqual({ id: 't1', title: 'Task' });
    });

    it('throws 404 when the task does not exist', async () => {
      mockedPrisma.task.findUnique.mockResolvedValue(null);

      await expect(getTask('missing')).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('listTasks', () => {
    it('returns tasks ordered by position', async () => {
      mockedPrisma.task.findMany.mockResolvedValue([{ id: 't1' }]);

      const result = await listTasks('p1');

      expect(mockedPrisma.task.findMany).toHaveBeenCalledWith({
        where: { projectId: 'p1' },
        include: expect.anything(),
        orderBy: { position: 'asc' },
      });
      expect(result).toEqual([{ id: 't1' }]);
    });
  });
});