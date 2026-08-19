import { searchTasks } from '../search.service';

jest.mock('../../../lib/prisma', () => ({
  prisma: {
    task: { findMany: jest.fn() },
  },
}));

import { prisma } from '../../../lib/prisma';

const mockedPrisma = prisma as unknown as {
  task: { findMany: jest.Mock };
};

describe('search.service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('searches tasks across projects the user belongs to, ignoring case', async () => {
    mockedPrisma.task.findMany.mockResolvedValue([{ id: 't1', title: 'Fix nav', projectId: 'p1' }]);

    const result = await searchTasks('u1', 'NAV', 10);

    expect(mockedPrisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          title: { contains: 'NAV', mode: 'insensitive' },
          project: { members: { some: { userId: 'u1' } } },
        },
        take: 10,
      })
    );
    expect(result).toEqual([{ id: 't1', title: 'Fix nav', projectId: 'p1' }]);
  });
});