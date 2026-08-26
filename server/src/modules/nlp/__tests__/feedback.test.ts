import { recordFeedback, getNlpStats, type NlpDecision } from '../nlp.service';

jest.mock('../../../lib/prisma', () => ({
  prisma: {
    nlpFeedback: { create: jest.fn(), findMany: jest.fn() },
    ticketAnalysis: { findMany: jest.fn() },
  },
}));

import { prisma } from '../../../lib/prisma';

const prismaAny = prisma as unknown as {
  nlpFeedback: { create: jest.Mock; findMany: jest.Mock };
  ticketAnalysis: { findMany: jest.Mock };
};

describe('nlp feedback + stats', () => {
  beforeEach(() => jest.clearAllMocks());

  it('records an applied decision row', async () => {
    await recordFeedback({
      userId: 'u1',
      analysisId: 'a1',
      category: 'kỹ thuật / lỗi hệ thống',
      priority: 'HIGH',
      decision: 'applied' as NlpDecision,
    });
    expect(prismaAny.nlpFeedback.create).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        analysisId: 'a1',
        category: 'kỹ thuật / lỗi hệ thống',
        priority: 'HIGH',
        decision: 'applied',
      },
    });
  });

  it('ignores an invalid decision value', async () => {
    await recordFeedback({
      userId: 'u1',
      analysisId: 'a1',
      category: 'khác',
      priority: 'LOW',
      decision: 'weird' as NlpDecision,
    });
    expect(prismaAny.nlpFeedback.create).not.toHaveBeenCalled();
  });

  it('aggregates per-category apply rate and confidence buckets', async () => {
    prismaAny.nlpFeedback.findMany.mockResolvedValue([
      { category: 'kỹ thuật / lỗi hệ thống', decision: 'applied' },
      { category: 'kỹ thuật / lỗi hệ thống', decision: 'applied' },
      { category: 'kỹ thuật / lỗi hệ thống', decision: 'ignored' },
      { category: 'thanh toán / hoàn tiền', decision: 'applied' },
    ]);
    prismaAny.ticketAnalysis.findMany.mockResolvedValue([
      { priorityConfidence: 0.3 },
      { priorityConfidence: 0.6 },
      { priorityConfidence: 0.9 },
      { priorityConfidence: 0.97 },
    ]);

    const stats = await getNlpStats('u1');
    expect(stats.totalFeedback).toBe(4);
    expect(stats.overallApplyRate).toBeCloseTo(0.75, 2);

    const tech = stats.byCategory.find((r) => r.category === 'kỹ thuật / lỗi hệ thống');
    expect(tech?.total).toBe(3);
    expect(tech?.applied).toBe(2);
    expect(tech?.applyRate).toBeCloseTo(0.667, 2);

    const buckets = Object.fromEntries(stats.confidenceBuckets.map((b) => [b.bucket, b.count]));
    expect(buckets['low(<0.5)']).toBe(1);
    expect(buckets['0.5-0.7']).toBe(1);
    expect(buckets['0.85-0.95']).toBe(1);
    expect(buckets['high(>=0.95)']).toBe(1);
  });

  it('returns zero rates when there is no feedback', async () => {
    prismaAny.nlpFeedback.findMany.mockResolvedValue([]);
    prismaAny.ticketAnalysis.findMany.mockResolvedValue([]);
    const stats = await getNlpStats('u1');
    expect(stats.totalFeedback).toBe(0);
    expect(stats.overallApplyRate).toBe(0);
    expect(stats.byCategory).toEqual([]);
  });
});
