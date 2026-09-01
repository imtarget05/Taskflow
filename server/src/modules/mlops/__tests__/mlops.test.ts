import {
  createExperiment,
  recordMetrics,
  compareExperiments,
  getBestConfig,
  listExperiments,
  getExperiment,
} from '../mlops.service';

jest.mock('../../../lib/prisma', () => ({
  prisma: {
    retrievalExperiment: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

import { prisma } from '../../../lib/prisma';

const mockedCreate = prisma.retrievalExperiment.create as jest.Mock;
const mockedFindUnique = prisma.retrievalExperiment.findUnique as jest.Mock;
const mockedUpdate = prisma.retrievalExperiment.update as jest.Mock;
const mockedFindMany = prisma.retrievalExperiment.findMany as jest.Mock;
const mockedCount = prisma.retrievalExperiment.count as jest.Mock;

describe('mlops.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createExperiment', () => {
    it('creates experiment with default status running', async () => {
      const input = {
        name: 'chunk_size_comparison',
        description: 'Test chunk sizes',
        config: { chunkSize: 512, topKRerank: 5, rerankCandidates: 20, minSimilarity: 0.7 },
      };

      mockedCreate.mockResolvedValue({
        id: 'exp_1',
        ...input,
        datasetSize: 0,
        metrics: null,
        status: 'running',
        createdBy: null,
        createdAt: new Date('2026-01-01'),
        completedAt: null,
      });

      const result = await createExperiment(input);

      expect(mockedCreate).toHaveBeenCalledTimes(1);
      expect(result.name).toBe('chunk_size_comparison');
      expect(result.status).toBe('running');
      expect(result.id).toBe('exp_1');
    });

    it('creates experiment with custom status and createdBy', async () => {
      const input = {
        name: 'top_k_sweep',
        config: { chunkSize: 1024, topKRerank: 10 },
        status: 'completed',
        createdBy: 'user_1',
      };

      mockedCreate.mockResolvedValue({
        id: 'exp_2',
        ...input,
        description: null,
        datasetSize: 0,
        metrics: null,
        createdAt: new Date(),
        completedAt: null,
      });

      const result = await createExperiment(input);

      expect(result.status).toBe('completed');
      expect(result.createdBy).toBe('user_1');
    });
  });

  describe('recordMetrics', () => {
    it('updates experiment with metrics and sets completed status', async () => {
      const metrics = {
        faithfulness: 0.92,
        answerRelevancy: 0.88,
        contextRecall: 0.85,
        avgLatency: 320,
      };

      mockedFindUnique.mockResolvedValue({ id: 'exp_1', status: 'running' });
      mockedUpdate.mockResolvedValue({
        id: 'exp_1',
        metrics,
        status: 'completed',
        completedAt: new Date(),
      });

      const result = await recordMetrics('exp_1', metrics);

      expect(mockedUpdate).toHaveBeenCalledTimes(1);
      expect((result.metrics as Record<string, number>).faithfulness).toBe(0.92);
      expect(result.status).toBe('completed');
    });

    it('throws 404 when experiment not found', async () => {
      mockedFindUnique.mockResolvedValue(null);

      await expect(
        recordMetrics('nonexistent', { faithfulness: 0.5 })
      ).rejects.toThrow('Experiment not found');
    });

    it('throws 400 when experiment already completed', async () => {
      mockedFindUnique.mockResolvedValue({ id: 'exp_1', status: 'completed' });

      await expect(
        recordMetrics('exp_1', { faithfulness: 0.5 })
      ).rejects.toThrow('Cannot record metrics for completed experiment');
    });
  });

  describe('compareExperiments', () => {
    it('returns side-by-side comparison of multiple experiments', async () => {
      const experiments = [
        {
          id: 'exp_1',
          name: 'config_a',
          config: { chunkSize: 512 },
          metrics: { faithfulness: 0.9, avgLatency: 300 },
          status: 'completed',
        },
        {
          id: 'exp_2',
          name: 'config_b',
          config: { chunkSize: 1024 },
          metrics: { faithfulness: 0.85, avgLatency: 250 },
          status: 'completed',
        },
      ];

      mockedFindUnique
        .mockResolvedValueOnce(experiments[0])
        .mockResolvedValueOnce(experiments[1]);

      const result = await compareExperiments(['exp_1', 'exp_2']);

      expect(result).toHaveLength(2);
      expect((result[0].metrics as Record<string, number>).faithfulness).toBe(0.9);
      expect((result[1].config as Record<string, number>).chunkSize).toBe(1024);
    });

    it('throws 404 if any experiment not found', async () => {
      mockedFindUnique
        .mockResolvedValueOnce({ id: 'exp_1' })
        .mockResolvedValueOnce(null);

      await expect(
        compareExperiments(['exp_1', 'nonexistent'])
      ).rejects.toThrow('Experiment not found: nonexistent');
    });
  });

  describe('getBestConfig', () => {
    it('returns experiment with highest faithfulness', async () => {
      mockedFindMany.mockResolvedValue([
        {
          id: 'exp_1',
          name: 'config_a',
          config: { chunkSize: 512 },
          metrics: { faithfulness: 0.92 },
          status: 'completed',
        },
        {
          id: 'exp_2',
          name: 'config_b',
          config: { chunkSize: 1024 },
          metrics: { faithfulness: 0.85 },
          status: 'completed',
        },
      ]);

      const result = await getBestConfig('faithfulness');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('exp_1');
      expect((result!.metrics as Record<string, number>).faithfulness).toBe(0.92);
    });

    it('returns experiment with lowest avgLatency', async () => {
      mockedFindMany.mockResolvedValue([
        {
          id: 'exp_1',
          config: {},
          metrics: { avgLatency: 300 },
          status: 'completed',
        },
        {
          id: 'exp_2',
          config: {},
          metrics: { avgLatency: 150 },
          status: 'completed',
        },
      ]);

      const result = await getBestConfig('avgLatency');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('exp_2');
    });

    it('returns null when no completed experiments exist', async () => {
      mockedFindMany.mockResolvedValue([]);

      const result = await getBestConfig('faithfulness');

      expect(result).toBeNull();
    });
  });

  describe('listExperiments', () => {
    it('returns all experiments ordered by createdAt desc', async () => {
      const experiments = [
        { id: 'exp_1', name: 'a', status: 'completed' },
        { id: 'exp_2', name: 'b', status: 'running' },
      ];

      mockedFindMany.mockResolvedValue(experiments);
      mockedCount.mockResolvedValue(2);

      const result = await listExperiments({});

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('filters by status', async () => {
      mockedFindMany.mockResolvedValue([
        { id: 'exp_1', name: 'a', status: 'completed' },
      ]);
      mockedCount.mockResolvedValue(1);

      const result = await listExperiments({ status: 'completed' });

      expect(mockedFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'completed' }),
        })
      );
      expect(result.data).toHaveLength(1);
    });

    it('supports pagination', async () => {
      mockedFindMany.mockResolvedValue([]);
      mockedCount.mockResolvedValue(10);

      await listExperiments({ page: 2, limit: 3 });

      expect(mockedFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 3,
          take: 3,
        })
      );
    });
  });

  describe('getExperiment', () => {
    it('returns single experiment by id', async () => {
      const experiment = {
        id: 'exp_1',
        name: 'chunk_size_comparison',
        config: { chunkSize: 512 },
        metrics: { faithfulness: 0.92 },
      };

      mockedFindUnique.mockResolvedValue(experiment);

      const result = await getExperiment('exp_1');

      expect(result.id).toBe('exp_1');
      expect(result.name).toBe('chunk_size_comparison');
    });

    it('throws 404 when experiment not found', async () => {
      mockedFindUnique.mockResolvedValue(null);

      await expect(getExperiment('nonexistent')).rejects.toThrow('Experiment not found');
    });
  });
});
