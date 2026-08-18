import { createActivity, listActivities } from '../activity.service';

jest.mock('../../../lib/prisma', () => ({
  prisma: {
    activity: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

import { prisma } from '../../../lib/prisma';

const mockedPrisma = prisma as unknown as {
  activity: { create: jest.Mock; findMany: jest.Mock };
};

describe('activity.service', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('createActivity', () => {
    it('creates an activity with metadata', async () => {
      mockedPrisma.activity.create.mockResolvedValue({ id: 'a1' });

      const result = await createActivity('p1', 'u1', 't1', 'TASK_UPDATED', { title: 'Fix bug' });

      expect(mockedPrisma.activity.create).toHaveBeenCalledWith({
        data: {
          projectId: 'p1',
          userId: 'u1',
          taskId: 't1',
          action: 'TASK_UPDATED',
          metadata: { title: 'Fix bug' },
        },
      });
      expect(result).toEqual({ id: 'a1' });
    });

    it('defaults metadata to an empty object', async () => {
      mockedPrisma.activity.create.mockResolvedValue({ id: 'a2' });

      await createActivity('p1', 'u1', null, 'TASK_CREATED');

      expect(mockedPrisma.activity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ metadata: {} }),
      });
    });
  });

  describe('listActivities', () => {
    it('lists up to 50 activities newest first with the user included', async () => {
      mockedPrisma.activity.findMany.mockResolvedValue([{ id: 'a1' }]);

      const result = await listActivities('p1');

      expect(mockedPrisma.activity.findMany).toHaveBeenCalledWith({
        where: { projectId: 'p1' },
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      expect(result).toEqual([{ id: 'a1' }]);
    });
  });
});