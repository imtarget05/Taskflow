import { prisma } from '../../../lib/prisma';
import {
  runEvaluation,
  compareRuns,
  getEvaluationHistory,
  evaluateRagas,
} from '../evaluator.service';

// Mock prisma for unit tests
jest.mock('../../../lib/prisma', () => ({
  prisma: {
    evaluationRun: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

describe('evaluator.service', () => {
  const sampleItems = [
    {
      question: 'thời hạn hợp đồng lao động',
      answer: 'thời hạn tối đa 36 tháng theo Điều 15',
      context: ['Điều 15 quy định thời hạn hợp đồng lao động tối đa 36 tháng'],
      accuracy: 1,
    },
    {
      question: 'nghỉ phép năm bao nhiêu ngày',
      answer: '12 ngày làm việc theo Điều 112',
      context: ['Điều 112 quy định về nghỉ phép năm là 12 ngày làm việc'],
      accuracy: 1,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('evaluateRagas', () => {
    it('returns RagasMetrics for a single Q&A pair', () => {
      const result = evaluateRagas(sampleItems[0]);
      expect(result).toHaveProperty('faithfulness');
      expect(result).toHaveProperty('answerRelevancy');
      expect(result).toHaveProperty('contextRecall');
      expect(result).toHaveProperty('contextPrecision');
      for (const v of Object.values(result)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('runEvaluation', () => {
    it('persists an evaluation run with averaged metrics', async () => {
      ((prisma as any).evaluationRun.create as jest.Mock).mockResolvedValue({
        id: 'eval-1',
        name: 'test_run',
        datasetSize: 2,
        metrics: {},
      });

      const result = await runEvaluation('test_run', sampleItems, { chunkSize: 512 }, 'v1');

      expect(result.name).toBe('test_run');
      expect(result.datasetSize).toBe(2);
      expect(result.promptVersion).toBe('v1');
      expect(result.config).toEqual({ chunkSize: 512 });
      expect((prisma as any).evaluationRun.create).toHaveBeenCalledTimes(1);
    });

    it('handles empty items array', async () => {
      const result = await runEvaluation('empty_run', []);
      expect(result.datasetSize).toBe(0);
      expect((prisma as any).evaluationRun.create).not.toHaveBeenCalled();
    });

    it('averages accuracy when provided', async () => {
      ((prisma as any).evaluationRun.create as jest.Mock).mockResolvedValue({ id: 'x' });
      const result = await runEvaluation('acc_run', sampleItems);
      expect(result.metrics.accuracy).toBeCloseTo(1);
    });
  });

  describe('compareRuns', () => {
    it('computes deltas between two runs', async () => {
      ((prisma as any).evaluationRun.findUnique as jest.Mock)
        .mockResolvedValueOnce({
          id: 'a',
          name: 'run_a',
          metrics: { faithfulness: 0.8, answerRelevancy: 0.7, contextRecall: 0.9, contextPrecision: 0.85 },
        })
        .mockResolvedValueOnce({
          id: 'b',
          name: 'run_b',
          metrics: { faithfulness: 0.9, answerRelevancy: 0.75, contextRecall: 0.85, contextPrecision: 0.88 },
        });

      const result = await compareRuns('a', 'b');
      expect(result.runA.name).toBe('run_a');
      expect(result.runB.name).toBe('run_b');
      expect(result.delta.faithfulness).toBeCloseTo(0.1);
      expect(result.delta.answerRelevancy).toBeCloseTo(0.05);
    });

    it('throws 404 when run not found', async () => {
      ((prisma as any).evaluationRun.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(compareRuns('missing', 'x')).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('getEvaluationHistory', () => {
    it('returns past runs ordered by createdAt desc', async () => {
      const mockRuns = [
        { id: '1', name: 'run1', createdAt: new Date('2026-01-01') },
        { id: '2', name: 'run2', createdAt: new Date('2026-01-02') },
      ];
      ((prisma as any).evaluationRun.findMany as jest.Mock).mockResolvedValue(mockRuns);

      const result = await getEvaluationHistory(10);
      expect(result).toHaveLength(2);
      expect((prisma as any).evaluationRun.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
    });
  });
});
