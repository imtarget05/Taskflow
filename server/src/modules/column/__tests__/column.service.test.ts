import { AppError } from '../../../utils/errors';
import { createColumn, deleteColumn, renameColumn } from '../column.service';

jest.mock('../../../lib/prisma', () => ({
  prisma: {
    column: {
      aggregate: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    task: {
      aggregate: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn({} as never)),
  },
}));

import { prisma } from '../../../lib/prisma';

const mockedPrisma = prisma as unknown as {
  column: {
    aggregate: jest.Mock;
    create: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  task: { aggregate: jest.Mock; updateMany: jest.Mock };
  $transaction: jest.Mock;
};

describe('column.service', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('createColumn', () => {
    it('places the column at the end of the project and trims the name', async () => {
      mockedPrisma.column.aggregate.mockResolvedValue({ _max: { position: 2 } });
      mockedPrisma.column.create.mockResolvedValue({ id: 'c1' });

      const result = await createColumn('p1', '  Backlog  ');

      expect(mockedPrisma.column.aggregate).toHaveBeenCalledWith({
        where: { projectId: 'p1' },
        _max: { position: true },
      });
      expect(mockedPrisma.column.create).toHaveBeenCalledWith({
        data: { projectId: 'p1', name: 'Backlog', position: 3 },
      });
      expect(result).toEqual({ id: 'c1' });
    });

    it('starts positions at 0 when the project has no columns', async () => {
      mockedPrisma.column.aggregate.mockResolvedValue({ _max: { position: null } });
      mockedPrisma.column.create.mockResolvedValue({ id: 'c2' });

      await createColumn('p1', 'To Do');

      expect(mockedPrisma.column.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ position: 0 }),
        })
      );
    });
  });

  describe('renameColumn', () => {
    it('renames the column and trims the name', async () => {
      mockedPrisma.column.findFirst.mockResolvedValue({ id: 'c1', projectId: 'p1', name: 'Backlog' });
      mockedPrisma.column.update.mockResolvedValue({ id: 'c1', name: 'Sprint' });

      const result = await renameColumn('p1', 'c1', '  Sprint  ');

      expect(mockedPrisma.column.findFirst).toHaveBeenCalledWith({
        where: { id: 'c1', projectId: 'p1' },
      });
      expect(mockedPrisma.column.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { name: 'Sprint' },
      });
      expect(result).toEqual({ id: 'c1', name: 'Sprint' });
    });

    it('throws 404 when the column does not exist in the project', async () => {
      mockedPrisma.column.findFirst.mockResolvedValue(null);

      await expect(renameColumn('p1', 'nope', 'Rename')).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe('deleteColumn', () => {
    const tx = {
      column: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        delete: jest.fn(),
      },
      task: {
        aggregate: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    it('moves tasks to the fallback column and deletes the column', async () => {
      mockedPrisma.$transaction.mockImplementationOnce((fn) => fn(tx));
      tx.column.findFirst
        .mockResolvedValueOnce({ id: 'c1', projectId: 'p1' })
        .mockResolvedValueOnce({ id: 'c2', projectId: 'p1', position: 0 });
      tx.task.findMany.mockResolvedValueOnce([{ id: 't1', position: 0 }, { id: 't2', position: 1 }]);
      tx.task.aggregate.mockResolvedValueOnce({ _max: { position: 4 } });
      tx.task.update.mockResolvedValueOnce({ id: 't1' });
      tx.column.delete.mockResolvedValueOnce({ id: 'c1' });

      const result = await deleteColumn('p1', 'c1');

      expect(tx.task.update).toHaveBeenNthCalledWith(1, {
        where: { id: 't1' },
        data: { columnId: 'c2', position: 5 },
      });
      expect(tx.task.update).toHaveBeenNthCalledWith(2, {
        where: { id: 't2' },
        data: { columnId: 'c2', position: 6 },
      });
      expect(tx.column.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
      expect(result).toEqual({ id: 'c1' });
    });

    it('throws 400 when it is the last column of the project', async () => {
      mockedPrisma.$transaction.mockImplementationOnce((fn) => fn(tx));
      tx.column.findFirst
        .mockResolvedValueOnce({ id: 'c1', projectId: 'p1' })
        .mockResolvedValueOnce(null);

      await expect(deleteColumn('p1', 'c1')).rejects.toBeInstanceOf(AppError);
    });

    it('throws 404 when the column does not belong to the project', async () => {
      mockedPrisma.$transaction.mockImplementationOnce((fn) => fn(tx));
      tx.column.findFirst.mockResolvedValueOnce(null);

      await expect(deleteColumn('p1', 'missing')).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});