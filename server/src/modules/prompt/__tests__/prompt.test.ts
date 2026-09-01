import {
  createPrompt,
  activatePrompt,
  getActivePrompt,
  listPrompts,
  renderPrompt,
  createExperiment,
  recordExperimentResult,
  analyzeExperiment,
  deactivateAll,
} from '../prompt.service';

jest.mock('../../../lib/prisma', () => ({
  prisma: {
    promptTemplate: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    promptExperiment: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { prisma } from '../../../lib/prisma';

const mockedCreate = prisma.promptTemplate.create as jest.Mock;
const mockedFindFirst = prisma.promptTemplate.findFirst as jest.Mock;
const mockedFindMany = prisma.promptTemplate.findMany as jest.Mock;
const mockedUpdate = prisma.promptTemplate.update as jest.Mock;
const mockedUpdateMany = prisma.promptTemplate.updateMany as jest.Mock;
const mockedExpCreate = prisma.promptExperiment.create as jest.Mock;
const mockedExpFindUnique = prisma.promptExperiment.findUnique as jest.Mock;
const mockedExpUpdate = prisma.promptExperiment.update as jest.Mock;

describe('prompt.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createPrompt', () => {
    it('creates a new prompt template', async () => {
      const data = {
        name: 'legal_rag',
        version: '1.0.0',
        content: 'Answer: {question} with {context}',
        variables: ['question', 'context'],
      };
      mockedCreate.mockResolvedValue({ id: '1', ...data, isActive: false, createdAt: new Date(), updatedAt: new Date() });

      const result = await createPrompt(data);

      expect(result).toMatchObject({ name: 'legal_rag', version: '1.0.0' });
      expect(mockedCreate).toHaveBeenCalledTimes(1);
    });

    it('throws if name+version already exists', async () => {
      mockedCreate.mockRejectedValue({ code: 'P2002' });

      await expect(
        createPrompt({ name: 'legal_rag', version: '1.0.0', content: 'test', variables: [] })
      ).rejects.toThrow();
    });
  });

  describe('activatePrompt', () => {
    it('deactivates all other versions and activates target', async () => {
      mockedUpdateMany.mockResolvedValue({ count: 2 });
      mockedUpdate.mockResolvedValue({
        id: '1',
        name: 'legal_rag',
        version: '2.0.0',
        isActive: true,
      });

      const result = await activatePrompt('legal_rag', '2.0.0');

      expect(mockedUpdateMany).toHaveBeenCalledWith({
        where: { name: 'legal_rag' },
        data: { isActive: false },
      });
      expect(result.isActive).toBe(true);
    });

    it('throws if prompt not found', async () => {
      mockedUpdateMany.mockResolvedValue({ count: 0 });
      mockedUpdate.mockRejectedValue({ code: 'P2025' });

      await expect(activatePrompt('nonexistent', '1.0.0')).rejects.toThrow();
    });
  });

  describe('getActivePrompt', () => {
    it('returns active prompt', async () => {
      const mockPrompt = {
        id: '1',
        name: 'legal_rag',
        version: '1.0.0',
        content: 'test',
        variables: ['q'],
        isActive: true,
      };
      mockedFindFirst.mockResolvedValue(mockPrompt);

      const result = await getActivePrompt('legal_rag');

      expect(result).toEqual(mockPrompt);
    });

    it('returns null when no active prompt', async () => {
      mockedFindFirst.mockResolvedValue(null);

      const result = await getActivePrompt('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('listPrompts', () => {
    it('returns all versions for a name', async () => {
      const mockPrompts = [
        { id: '1', name: 'legal_rag', version: '1.0.0' },
        { id: '2', name: 'legal_rag', version: '2.0.0' },
      ];
      mockedFindMany.mockResolvedValue(mockPrompts);

      const result = await listPrompts('legal_rag');

      expect(result).toHaveLength(2);
    });

    it('returns all prompts when no name filter', async () => {
      mockedFindMany.mockResolvedValue([]);

      await listPrompts();

      expect(mockedFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { version: 'desc' } })
      );
    });
  });

  describe('renderPrompt', () => {
    it('renders template with variables', async () => {
      const mockPrompt = {
        id: '1',
        name: 'legal_rag',
        version: '1.0.0',
        content: 'Question: {question}\nContext: {context}',
        variables: ['question', 'context'],
        isActive: true,
      };
      mockedFindFirst.mockResolvedValue(mockPrompt);

      const result = await renderPrompt('legal_rag', {
        question: 'What is law?',
        context: 'Article 1',
      });

      expect(result).toBe('Question: What is law?\nContext: Article 1');
    });

    it('returns null when no active prompt exists', async () => {
      mockedFindFirst.mockResolvedValue(null);

      const result = await renderPrompt('nonexistent', {});

      expect(result).toBeNull();
    });

    it('leaves unmatched variables as-is', async () => {
      const mockPrompt = {
        id: '1',
        name: 'test',
        version: '1.0.0',
        content: 'Hello {name}, welcome to {place}',
        variables: ['name', 'place'],
        isActive: true,
      };
      mockedFindFirst.mockResolvedValue(mockPrompt);

      const result = await renderPrompt('test', { name: 'Alice' });

      expect(result).toBe('Hello Alice, welcome to {place}');
    });
  });

  describe('createExperiment', () => {
    it('creates an A/B test experiment', async () => {
      const data = {
        name: 'chunk_size_test',
        promptName: 'legal_rag',
        variantA: '1.0.0',
        variantB: '2.0.0',
      };
      mockedExpCreate.mockResolvedValue({ id: 'exp1', ...data, status: 'running' });

      const result = await createExperiment(data);

      expect(result).toMatchObject({ name: 'chunk_size_test', status: 'running' });
    });

    it('throws if experiment name already exists', async () => {
      mockedExpCreate.mockRejectedValue({ code: 'P2002' });

      await expect(
        createExperiment({
          name: 'duplicate_test',
          promptName: 'legal_rag',
          variantA: '1.0.0',
          variantB: '2.0.0',
        })
      ).rejects.toThrow();
    });
  });

  describe('recordExperimentResult', () => {
    it('updates experiment results for variant A', async () => {
      mockedExpFindUnique.mockResolvedValue({
        id: 'exp1',
        variantA: '1.0.0',
        variantB: '2.0.0',
        resultsA: null,
        resultsB: null,
      });
      mockedExpUpdate.mockResolvedValue({ id: 'exp1', resultsA: { accuracy: 0.95, count: 100 } });

      await recordExperimentResult('exp1', 'A', { accuracy: 0.95, count: 100 });

      expect(mockedExpUpdate).toHaveBeenCalledWith({
        where: { id: 'exp1' },
        data: { resultsA: { accuracy: 0.95, count: 100 } },
      });
    });

    it('updates experiment results for variant B', async () => {
      mockedExpFindUnique.mockResolvedValue({
        id: 'exp1',
        variantA: '1.0.0',
        variantB: '2.0.0',
        resultsA: null,
        resultsB: null,
      });
      mockedExpUpdate.mockResolvedValue({ id: 'exp1', resultsB: { accuracy: 0.92, count: 100 } });

      await recordExperimentResult('exp1', 'B', { accuracy: 0.92, count: 100 });

      expect(mockedExpUpdate).toHaveBeenCalledWith({
        where: { id: 'exp1' },
        data: { resultsB: { accuracy: 0.92, count: 100 } },
      });
    });

    it('throws if experiment not found', async () => {
      mockedExpFindUnique.mockResolvedValue(null);

      await expect(recordExperimentResult('nonexistent', 'A', {})).rejects.toThrow();
    });
  });

  describe('analyzeExperiment', () => {
    it('determines winner A when accuracy is higher', async () => {
      mockedExpFindUnique.mockResolvedValue({
        id: 'exp1',
        name: 'test',
        promptName: 'legal_rag',
        variantA: '1.0.0',
        variantB: '2.0.0',
        status: 'running',
        resultsA: { accuracy: 0.95, count: 100 },
        resultsB: { accuracy: 0.85, count: 100 },
      });
      mockedExpUpdate.mockResolvedValue({
        id: 'exp1',
        winner: 'A',
        status: 'completed',
      });

      const result = await analyzeExperiment('exp1');

      expect(result.winner).toBe('A');
      expect(result.status).toBe('completed');
    });

    it('determines winner B when accuracy is higher', async () => {
      mockedExpFindUnique.mockResolvedValue({
        id: 'exp1',
        name: 'test',
        promptName: 'legal_rag',
        variantA: '1.0.0',
        variantB: '2.0.0',
        status: 'running',
        resultsA: { accuracy: 0.80, count: 100 },
        resultsB: { accuracy: 0.90, count: 100 },
      });
      mockedExpUpdate.mockResolvedValue({
        id: 'exp1',
        winner: 'B',
        status: 'completed',
      });

      const result = await analyzeExperiment('exp1');

      expect(result.winner).toBe('B');
    });

    it('returns null winner when no results available', async () => {
      mockedExpFindUnique.mockResolvedValue({
        id: 'exp1',
        name: 'test',
        promptName: 'legal_rag',
        variantA: '1.0.0',
        variantB: '2.0.0',
        status: 'running',
        resultsA: null,
        resultsB: null,
      });
      mockedExpUpdate.mockResolvedValue({
        id: 'exp1',
        winner: null,
        status: 'completed',
      });

      const result = await analyzeExperiment('exp1');

      expect(result.winner).toBeNull();
    });

    it('throws if experiment not found', async () => {
      mockedExpFindUnique.mockResolvedValue(null);

      await expect(analyzeExperiment('nonexistent')).rejects.toThrow();
    });
  });

  describe('deactivateAll', () => {
    it('deactivates all prompts with given name', async () => {
      mockedUpdateMany.mockResolvedValue({ count: 3 });

      await deactivateAll('legal_rag');

      expect(mockedUpdateMany).toHaveBeenCalledWith({
        where: { name: 'legal_rag' },
        data: { isActive: false },
      });
    });
  });
});
