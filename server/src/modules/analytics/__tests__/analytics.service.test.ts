import { getOverview, OverviewStats } from '../analytics.service';

jest.mock('../../../lib/prisma', () => ({
  prisma: {
    project: { findMany: jest.fn() },
    task: { findMany: jest.fn() },
  },
}));

import { prisma } from '../../../lib/prisma';

const mockedPrisma = prisma as unknown as {
  project: { findMany: jest.Mock };
  task: { findMany: jest.Mock };
};

describe('analytics.service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('computes overview stats from the user project memberships', async () => {
    mockedPrisma.project.findMany.mockResolvedValue([
      { id: 'p1', name: 'Alpha', color: '#6366f1', _count: { tasks: 2, members: 1 } },
      { id: 'p2', name: 'Beta', color: null, _count: { tasks: 0, members: 2 } },
    ]);
    mockedPrisma.task.findMany.mockResolvedValue([
      { id: 't1', projectId: 'p1', completed: true, priority: 'HIGH', dueDate: new Date('2026-01-01') },
      { id: 't2', projectId: 'p1', completed: false, priority: 'HIGH', dueDate: new Date('2099-01-01') },
      { id: 't3', projectId: 'p2', completed: false, priority: 'LOW', dueDate: null },
    ]);

    const result: OverviewStats = await getOverview('u1');

    expect(result.totalProjects).toBe(2);
    expect(result.totalTasks).toBe(3);
    expect(result.completedTasks).toBe(1);
    expect(result.overdueTasks).toBe(0);
    expect(result.byPriority).toEqual({ LOW: 1, MEDIUM: 0, HIGH: 2, URGENT: 0 });
    expect(result.byProject).toEqual([
      { projectId: 'p1', name: 'Alpha', color: '#6366f1', total: 2, completed: 1 },
      { projectId: 'p2', name: 'Beta', color: null, total: 1, completed: 0 },
    ]);
  });
});