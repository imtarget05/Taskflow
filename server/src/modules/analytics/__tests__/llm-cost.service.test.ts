import { getLlmCost, LlmCostStats } from '../analytics.service';

jest.mock('../../../lib/prisma', () => ({
  prisma: {
    project: { findMany: jest.fn() },
    task: { findMany: jest.fn() },
    aIUsage: { groupBy: jest.fn() },
  },
}));

jest.mock('../../project/project.service', () => ({
  assertRole: jest.fn().mockResolvedValue({ role: 'MEMBER' }),
}));

import { prisma } from '../../../lib/prisma';
import { assertRole } from '../../project/project.service';

const mockedPrisma = prisma as unknown as {
  aIUsage: { groupBy: jest.Mock };
};
const mockedAssertRole = assertRole as jest.Mock;

function groupRow(model: string, over: Partial<Record<string, number>> = {}) {
  return {
    model,
    _sum: {
      inputTokens: 1000,
      outputTokens: 500,
      inputCostUsd: 0.0015,
      outputCostUsd: 0.0015,
      totalCostUsd: 0.003,
      ...over,
    },
    _count: { _all: 2 },
  };
}

describe('analytics.service — getLlmCost', () => {
  beforeEach(() => jest.clearAllMocks());

  it('aggregates per-user cost when no projectId is given', async () => {
    mockedPrisma.aIUsage.groupBy.mockResolvedValue([
      groupRow('gpt-4o'),
      groupRow('gpt-4o-mini', {
        inputTokens: 2000,
        outputTokens: 100,
        inputCostUsd: 0.0003,
        outputCostUsd: 0.00006,
        totalCostUsd: 0.00036,
      }),
    ]);

    const result: LlmCostStats = await getLlmCost('u1', { days: 7 });

    expect(result.scope).toBe('user');
    expect(result.currency).toBe('USD');
    expect(result.days).toBe(7);
    expect(result.totalCalls).toBe(4);
    expect(result.totalInputTokens).toBe(3000);
    expect(result.totalOutputTokens).toBe(600);
    expect(result.totalCostUsd).toBeCloseTo(0.00336, 6);
    expect(result.byModel).toHaveLength(2);
    // rows sorted by cost desc — groupBy contract preserved
    expect(result.byModel[0].model).toBe('gpt-4o');
    // user scope must filter by userId, NOT projectId
    expect(mockedPrisma.aIUsage.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['model'],
        where: expect.objectContaining({ userId: 'u1' }),
      })
    );
    expect(mockedAssertRole).not.toHaveBeenCalled();
  });

  it('team view asserts project membership and scopes by projectId', async () => {
    mockedPrisma.aIUsage.groupBy.mockResolvedValue([groupRow('gpt-4o')]);

    const result = await getLlmCost('u1', { projectId: 'p1' });

    expect(result.scope).toBe('project');
    expect(mockedAssertRole).toHaveBeenCalledWith('p1', 'u1', 'VIEWER');
    expect(mockedPrisma.aIUsage.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ projectId: 'p1' }),
      })
    );
  });

  it('clamps days into [1, 365]', async () => {
    mockedPrisma.aIUsage.groupBy.mockResolvedValue([]);

    const tooBig = await getLlmCost('u1', { days: 9999 });
    const tooSmall = await getLlmCost('u1', { days: 0 });

    expect(tooBig.days).toBe(365);
    expect(tooSmall.days).toBe(1);
  });

  it('returns zeroed stats when there is no usage in the window', async () => {
    mockedPrisma.aIUsage.groupBy.mockResolvedValue([]);

    const result = await getLlmCost('u1');

    expect(result.totalCostUsd).toBe(0);
    expect(result.totalCalls).toBe(0);
    expect(result.byModel).toEqual([]);
  });

  it('propagates 403 from assertRole for non-members (fail-closed)', async () => {
    mockedAssertRole.mockRejectedValueOnce(new Error('Not a member of this project'));
    mockedPrisma.aIUsage.groupBy.mockResolvedValue([]);

    await expect(getLlmCost('u1', { projectId: 'pX' })).rejects.toThrow(
      'Not a member of this project'
    );
    expect(mockedPrisma.aIUsage.groupBy).not.toHaveBeenCalled();
  });
});
