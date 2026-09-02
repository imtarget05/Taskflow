import { SemanticCache } from '../semantic-cache.service';

jest.mock('../../../lib/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  },
}));

jest.mock('../../../modules/agent/llm', () => ({
  embed: jest.fn(),
}));

import { prisma } from '../../../lib/prisma';
import { embed } from '../../../modules/agent/llm';

const mockedPrisma = prisma as unknown as {
  $queryRaw: jest.Mock;
  $executeRaw: jest.Mock;
};
const mockedEmbed = embed as jest.Mock;

describe('SemanticCache', () => {
  let cache: SemanticCache;

  beforeEach(() => {
    jest.resetAllMocks();
    cache = new SemanticCache(0.92);
  });

  describe('get', () => {
    it('returns null when no similar entry exists', async () => {
      mockedEmbed.mockResolvedValue([[0.1, 0.2, 0.3]]);
      mockedPrisma.$queryRaw.mockResolvedValue([]);

      const result = await cache.get('What is the minimum wage?');

      expect(result).toBeNull();
      expect(mockedEmbed).toHaveBeenCalledWith(['What is the minimum wage?']);
    });

    it('returns cached response when similar query exists', async () => {
      const cachedResponse = 'The minimum wage is regulated by the government.';
      mockedEmbed.mockResolvedValue([[0.1, 0.2, 0.3]]);
      mockedPrisma.$queryRaw.mockResolvedValue([
        { id: 'abc123', response: cachedResponse, similarity: 0.95 },
      ]);

      const result = await cache.get('What is the minimum wage?');

      expect(result).toBe(cachedResponse);
    });

    it('returns null when similarity is below threshold', async () => {
      mockedEmbed.mockResolvedValue([[0.1, 0.2, 0.3]]);
      mockedPrisma.$queryRaw.mockResolvedValue([
        { id: 'abc123', response: 'Some response', similarity: 0.85 },
      ]);

      const result = await cache.get('What is the minimum wage?');

      expect(result).toBeNull();
    });

    it('uses custom threshold when provided', async () => {
      const lowThresholdCache = new SemanticCache(0.8);
      mockedEmbed.mockResolvedValue([[0.1, 0.2, 0.3]]);
      mockedPrisma.$queryRaw.mockResolvedValue([
        { id: 'abc123', response: 'Some response', similarity: 0.85 },
      ]);

      const result = await lowThresholdCache.get('What is the minimum wage?');

      expect(result).toBe('Some response');
    });
  });

  describe('set', () => {
    it('stores response with embedding', async () => {
      mockedEmbed.mockResolvedValue([[0.1, 0.2, 0.3]]);

      await cache.set('What is the minimum wage?', 'The minimum wage is regulated.');

      expect(mockedPrisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(mockedEmbed).toHaveBeenCalledWith(['What is the minimum wage?']);
    });

    it('stores response with metadata', async () => {
      mockedEmbed.mockResolvedValue([[0.1, 0.2, 0.3]]);

      await cache.set('What is the minimum wage?', 'The minimum wage is regulated.', {
        model: 'test-model',
        citations: 3,
      });

      expect(mockedPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('upserts on conflict (same query hash)', async () => {
      mockedEmbed.mockResolvedValue([[0.1, 0.2, 0.3]]);

      await cache.set('What is the minimum wage?', 'First response');
      await cache.set('What is the minimum wage?', 'Updated response');

      expect(mockedPrisma.$executeRaw).toHaveBeenCalledTimes(2);
    });
  });

  describe('cleanup', () => {
    it('removes entries older than maxAgeDays', async () => {
      mockedPrisma.$executeRaw.mockResolvedValue(5);

      await cache.cleanup(30);

      expect(mockedPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    });
  });
});
