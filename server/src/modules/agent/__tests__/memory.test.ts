import {
  extractMemories,
  storeMemory,
  storeMemories,
  retrieveRelevantMemories,
  buildMemoryContext,
  crossSessionSummary,
  createRelation,
  listMemories,
  deleteMemory,

} from '../memory.service';
import { AppError } from '../../../utils/errors';

jest.mock('../llm', () => ({
  isLLMConfigured: jest.fn(),
  chatCompletion: jest.fn(),
  embed: jest.fn(),
}));

jest.mock('../../../lib/prisma', () => ({
  prisma: {
    memoryNode: {
      create: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    memoryRelation: {
      create: jest.fn(),
    },
    $queryRaw: jest.fn(),
  },
}));

import { isLLMConfigured, chatCompletion, embed } from '../llm';
import { prisma } from '../../../lib/prisma';

const mockedIsConfigured = isLLMConfigured as jest.Mock;
const mockedChatCompletion = chatCompletion as jest.Mock;
const mockedEmbed = embed as jest.Mock;
const mockedPrisma = prisma as unknown as {
  memoryNode: {
    create: jest.Mock;
    findMany: jest.Mock;
    deleteMany: jest.Mock;
  };
  memoryRelation: {
    create: jest.Mock;
  };
  $queryRaw: jest.Mock;
};

describe('memory.service', () => {
  const userId = 'user-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('extractMemories', () => {
    it('returns empty array when LLM is not configured', async () => {
      mockedIsConfigured.mockReturnValue(false);
      const result = await extractMemories(userId, 'I prefer dark mode');
      expect(result).toEqual([]);
    });

    it('extracts memories from conversation text', async () => {
      mockedIsConfigured.mockReturnValue(true);
      mockedChatCompletion.mockResolvedValue(
        '[{"content": "User prefers dark mode", "category": "preference"}]'
      );

      const result = await extractMemories(userId, 'I prefer dark mode for coding');

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('User prefers dark mode');
      expect(result[0].category).toBe('preference');
    });

    it('returns empty array when LLM returns invalid JSON', async () => {
      mockedIsConfigured.mockReturnValue(true);
      mockedChatCompletion.mockResolvedValue('not json');

      const result = await extractMemories(userId, 'some text');

      expect(result).toEqual([]);
    });

    it('filters out memories with invalid categories', async () => {
      mockedIsConfigured.mockReturnValue(true);
      mockedChatCompletion.mockResolvedValue(
        '[{"content": "test", "category": "invalid"}, {"content": "valid one", "category": "fact"}]'
      );

      const result = await extractMemories(userId, 'some text');

      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('fact');
    });

    it('returns empty array when LLM throws', async () => {
      mockedIsConfigured.mockReturnValue(true);
      mockedChatCompletion.mockRejectedValue(new Error('LLM error'));

      const result = await extractMemories(userId, 'some text');

      expect(result).toEqual([]);
    });
  });

  describe('storeMemory', () => {
    it('stores a memory with embedding when LLM is configured', async () => {
      mockedIsConfigured.mockReturnValue(true);
      mockedEmbed.mockResolvedValue([[0.1, 0.2, 0.3]]);
      mockedPrisma.memoryNode.create.mockResolvedValue({
        id: 'mem-1',
        userId,
        content: 'User likes TypeScript',
        category: 'preference',
        source: 'conversation',
        confidence: 1.0,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await storeMemory(userId, 'User likes TypeScript', 'preference');

      expect(mockedEmbed).toHaveBeenCalledWith(['User likes TypeScript']);
      expect(mockedPrisma.memoryNode.create).toHaveBeenCalled();
      expect(result?.content).toBe('User likes TypeScript');
    });

    it('stores a memory without embedding when LLM is not configured', async () => {
      mockedIsConfigured.mockReturnValue(false);
      mockedPrisma.memoryNode.create.mockResolvedValue({
        id: 'mem-2',
        userId,
        content: 'Simple fact',
        category: 'fact',
        source: 'manual',
        confidence: 1.0,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await storeMemory(userId, 'Simple fact', 'fact', 'manual');

      expect(mockedEmbed).not.toHaveBeenCalled();
      expect(result?.content).toBe('Simple fact');
    });

    it('stores memory even when embedding fails', async () => {
      mockedIsConfigured.mockReturnValue(true);
      mockedEmbed.mockRejectedValue(new Error('embed failed'));
      mockedPrisma.memoryNode.create.mockResolvedValue({
        id: 'mem-3',
        userId,
        content: 'Some content',
        category: 'context',
        source: 'conversation',
        confidence: 0.8,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await storeMemory(userId, 'Some content', 'context');

      expect(result).not.toBeNull();
    });
  });

  describe('storeMemories', () => {
    it('stores multiple memories in batch', async () => {
      mockedIsConfigured.mockReturnValue(false);
      mockedPrisma.memoryNode.create
        .mockResolvedValueOnce({ id: 'm1', content: 'fact 1' })
        .mockResolvedValueOnce({ id: 'm2', content: 'fact 2' });

      const result = await storeMemories(userId, [
        { content: 'fact 1', category: 'fact' },
        { content: 'fact 2', category: 'preference' },
      ]);

      expect(result).toHaveLength(2);
      expect(mockedPrisma.memoryNode.create).toHaveBeenCalledTimes(2);
    });

    it('skips failed stores and returns only successful ones', async () => {
      mockedIsConfigured.mockReturnValue(false);
      mockedPrisma.memoryNode.create
        .mockResolvedValueOnce({ id: 'm1', content: 'fact 1' })
        .mockRejectedValueOnce(new Error('DB error'));

      const result = await storeMemories(userId, [
        { content: 'fact 1', category: 'fact' },
        { content: 'fact 2', category: 'fact' },
      ]);

      expect(result).toHaveLength(1);
    });
  });

  describe('retrieveRelevantMemories', () => {
    it('uses pgvector semantic search when LLM is configured', async () => {
      mockedIsConfigured.mockReturnValue(true);
      mockedEmbed.mockResolvedValue([[0.1, 0.2, 0.3]]);
      mockedPrisma.$queryRaw.mockResolvedValue([
        { id: 'm1', content: 'memory 1', category: 'fact' },
        { id: 'm2', content: 'memory 2', category: 'preference' },
      ]);

      const result = await retrieveRelevantMemories(userId, 'user preferences', 5);

      expect(mockedEmbed).toHaveBeenCalledWith(['user preferences']);
      expect(mockedPrisma.$queryRaw).toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });

    it('falls back to recent-first when embedding fails', async () => {
      mockedIsConfigured.mockReturnValue(true);
      mockedEmbed.mockRejectedValue(new Error('embed error'));
      mockedPrisma.memoryNode.findMany.mockResolvedValue([
        { id: 'm1', content: 'recent memory', category: 'fact' },
      ]);

      const result = await retrieveRelevantMemories(userId, 'query');

      expect(mockedPrisma.memoryNode.findMany).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });

    it('falls back to recent-first when LLM is not configured', async () => {
      mockedIsConfigured.mockReturnValue(false);
      mockedPrisma.memoryNode.findMany.mockResolvedValue([
        { id: 'm1', content: 'recent', category: 'context' },
      ]);

      const result = await retrieveRelevantMemories(userId, 'query');

      expect(mockedEmbed).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe('buildMemoryContext', () => {
    it('returns empty string when no memories exist', async () => {
      mockedIsConfigured.mockReturnValue(false);
      mockedPrisma.memoryNode.findMany.mockResolvedValue([]);

      const result = await buildMemoryContext(userId, 'hello');

      expect(result).toBe('');
    });

    it('returns formatted context string when memories exist', async () => {
      mockedIsConfigured.mockReturnValue(false);
      mockedPrisma.memoryNode.findMany.mockResolvedValue([
        { id: 'm1', content: 'User prefers TypeScript', category: 'preference' },
        { id: 'm2', content: 'User works on Project X', category: 'context' },
      ]);

      const result = await buildMemoryContext(userId, 'tell me about the user');

      expect(result).toContain('RELEVANT USER MEMORIES');
      expect(result).toContain('[preference] User prefers TypeScript');
      expect(result).toContain('[context] User works on Project X');
    });
  });

  describe('crossSessionSummary', () => {
    it('returns empty string when no memories exist', async () => {
      mockedPrisma.memoryNode.findMany.mockResolvedValue([]);

      const result = await crossSessionSummary(userId);

      expect(result).toBe('');
    });

    it('returns LLM-generated summary when LLM is configured', async () => {
      mockedIsConfigured.mockReturnValue(true);
      mockedPrisma.memoryNode.findMany.mockResolvedValue([
        { id: 'm1', content: 'prefers TypeScript', category: 'preference' },
        { id: 'm2', content: 'works on Project X', category: 'context' },
      ]);
      mockedChatCompletion.mockResolvedValue('User prefers TypeScript and works on Project X.');

      const result = await crossSessionSummary(userId);

      expect(mockedChatCompletion).toHaveBeenCalled();
      expect(result).toBe('User prefers TypeScript and works on Project X.');
    });

    it('falls back to bullet list when LLM is not configured', async () => {
      mockedIsConfigured.mockReturnValue(false);
      mockedPrisma.memoryNode.findMany.mockResolvedValue([
        { id: 'm1', content: 'fact 1', category: 'fact' },
        { id: 'm2', content: 'fact 2', category: 'fact' },
      ]);

      const result = await crossSessionSummary(userId);

      expect(result).toContain('[fact] fact 1');
      expect(result).toContain('[fact] fact 2');
    });
  });

  describe('createRelation', () => {
    it('creates a relation between two memory nodes', async () => {
      mockedPrisma.memoryRelation.create.mockResolvedValue({ id: 'rel-1' });

      await createRelation('source-id', 'target-id', 'related_to', 0.9);

      expect(mockedPrisma.memoryRelation.create).toHaveBeenCalledWith({
        data: {
          sourceId: 'source-id',
          targetId: 'target-id',
          relationType: 'related_to',
          strength: 0.9,
        },
      });
    });
  });

  describe('listMemories', () => {
    it('lists all memories for a user', async () => {
      mockedPrisma.memoryNode.findMany.mockResolvedValue([
        { id: 'm1', content: 'fact 1' },
        { id: 'm2', content: 'fact 2' },
      ]);

      const result = await listMemories(userId);

      expect(mockedPrisma.memoryNode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId } })
      );
      expect(result).toHaveLength(2);
    });

    it('filters by category when provided', async () => {
      mockedPrisma.memoryNode.findMany.mockResolvedValue([
        { id: 'm1', content: 'pref 1', category: 'preference' },
      ]);

      const result = await listMemories(userId, 'preference');

      expect(mockedPrisma.memoryNode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId, category: 'preference' } })
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('deleteMemory', () => {
    it('deletes a memory node successfully', async () => {
      mockedPrisma.memoryNode.deleteMany.mockResolvedValue({ count: 1 });

      await deleteMemory(userId, 'mem-1');

      expect(mockedPrisma.memoryNode.deleteMany).toHaveBeenCalledWith({
        where: { id: 'mem-1', userId },
      });
    });

    it('throws AppError when memory not found', async () => {
      mockedPrisma.memoryNode.deleteMany.mockResolvedValue({ count: 0 });

      await expect(deleteMemory(userId, 'nonexistent')).rejects.toBeInstanceOf(AppError);
      await expect(deleteMemory(userId, 'nonexistent')).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });
});
