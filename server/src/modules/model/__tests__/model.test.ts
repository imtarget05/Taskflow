import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock env before importing modules that use it
jest.mock('../../../config/env', () => ({
  env: {
    NODE_ENV: 'test',
    LLM_BASE_URL: undefined,
    LLM_MODEL: 'qwen2.5:7b',
    LLM_MODEL_PREMIUM: undefined,
    LLM_MODEL_REASONING: undefined,
    LLM_EMBED_MODEL: undefined,
    LLM_RERANK_MODEL: undefined,
  },
}));

// Mock logger to keep test output clean
jest.mock('../../../lib/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
  listModels,
  pullModel,
  deleteModel,
  showModel,
  isOllamaRunning,
  OllamaModel,
  OllamaModelDetail,
} from '../ollama.client';
import {
  listAvailableModels,
  getActiveModel,
  validateModel,
  getModelRecommendations,
  ModelRecommendation,
} from '../model.service';
import { env } from '../../../config/env';

describe('Ollama client', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('listModels', () => {
    it('returns list of models from /api/tags', async () => {
      const mockModels: OllamaModel[] = [
        { name: 'qwen2.5:7b', size: 4_700_000_000, digest: 'abc123', modifiedAt: '2024-01-01T00:00:00Z' },
        { name: 'llama3.2:latest', size: 2_000_000_000, digest: 'def456', modifiedAt: '2024-01-02T00:00:00Z' },
      ];
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ models: mockModels }),
      } as unknown as Response);

      const result = await listModels();
      expect(result).toEqual(mockModels);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/tags'),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('returns empty list when no models available', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ models: [] }),
      } as unknown as Response);

      const result = await listModels();
      expect(result).toEqual([]);
    });

    it('throws on non-200 response', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
      } as unknown as Response);

      await expect(listModels()).rejects.toThrow();
    });
  });

  describe('pullModel', () => {
    it('sends POST to /api/pull with model name', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        body: { getReader: () => ({ read: async () => ({ done: true }) }) },
      } as unknown as Response);

      await pullModel('qwen2.5:7b');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/pull'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'qwen2.5:7b' }),
        })
      );
    });

    it('throws on pull failure', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 404,
      } as unknown as Response);

      await expect(pullModel('nonexistent:model')).rejects.toThrow();
    });
  });

  describe('deleteModel', () => {
    it('sends DELETE to /api/delete with model name', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
      } as unknown as Response);

      await deleteModel('old-model:7b');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/delete'),
        expect.objectContaining({
          method: 'DELETE',
          body: JSON.stringify({ name: 'old-model:7b' }),
        })
      );
    });

    it('throws on delete failure', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 404,
      } as unknown as Response);

      await expect(deleteModel('nonexistent:model')).rejects.toThrow();
    });
  });

  describe('showModel', () => {
    it('returns model details from /api/show', async () => {
      const mockDetail: OllamaModelDetail = {
        name: 'qwen2.5:7b',
        modelfile: '# Modelfile',
        parameters: 'num_ctx 4096',
        template: '{{ .Prompt }}',
        details: {
          family: 'qwen',
          parameterSize: '7B',
          quantizationLevel: 'Q4_K_M',
        },
      };
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockDetail,
      } as unknown as Response);

      const result = await showModel('qwen2.5:7b');
      expect(result).toEqual(mockDetail);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/show'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'qwen2.5:7b' }),
        })
      );
    });
  });

  describe('isOllamaRunning', () => {
    it('returns true when Ollama responds', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => 'Ollama is running',
      } as unknown as Response);

      const result = await isOllamaRunning();
      expect(result).toBe(true);
    });

    it('returns false when Ollama is unreachable', async () => {
      jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await isOllamaRunning();
      expect(result).toBe(false);
    });

    it('returns false on non-200 response', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 503,
      } as unknown as Response);

      const result = await isOllamaRunning();
      expect(result).toBe(false);
    });
  });
});

describe('Model service', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('listAvailableModels', () => {
    it('returns models from Ollama client', async () => {
      const mockModels: OllamaModel[] = [
        { name: 'qwen2.5:7b', size: 4_700_000_000, digest: 'abc123', modifiedAt: '2024-01-01T00:00:00Z' },
      ];
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ models: mockModels }),
      } as unknown as Response);

      const result = await listAvailableModels();
      expect(result).toEqual(mockModels);
    });
  });

  describe('getActiveModel', () => {
    it('returns the configured LLM_MODEL', () => {
      const result = getActiveModel();
      expect(result).toBe('qwen2.5:7b');
    });

    it('returns undefined when no model configured', () => {
      const original = env.LLM_MODEL;
      (env as { LLM_MODEL?: string }).LLM_MODEL = undefined;
      const result = getActiveModel();
      expect(result).toBeUndefined();
      (env as { LLM_MODEL?: string }).LLM_MODEL = original;
    });
  });

  describe('validateModel', () => {
    it('returns true when model exists locally', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          models: [{ name: 'qwen2.5:7b' }],
        }),
      } as unknown as Response);

      const result = await validateModel('qwen2.5:7b');
      expect(result).toBe(true);
    });

    it('returns false when model does not exist', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          models: [{ name: 'qwen2.5:7b' }],
        }),
      } as unknown as Response);

      const result = await validateModel('nonexistent:model');
      expect(result).toBe(false);
    });
  });

  describe('getModelRecommendations', () => {
    it('returns recommendations for all tiers', () => {
      const result = getModelRecommendations();
      expect(result).toHaveProperty('default');
      expect(result).toHaveProperty('premium');
      expect(result).toHaveProperty('reasoning');
      expect(result).toHaveProperty('embed');
      expect(result).toHaveProperty('rerank');
    });

    it('each tier has at least one model recommendation', () => {
      const result = getModelRecommendations();
      const tiers: (keyof ModelRecommendation)[] = ['default', 'premium', 'reasoning', 'embed', 'rerank'];
      for (const tier of tiers) {
        expect(result[tier].length).toBeGreaterThan(0);
      }
    });

    it('recommendations include model name and description', () => {
      const result = getModelRecommendations();
      const allModels = [
        ...result.default,
        ...result.premium,
        ...result.reasoning,
        ...result.embed,
        ...result.rerank,
      ];
      for (const model of allModels) {
        expect(model).toHaveProperty('name');
        expect(model).toHaveProperty('description');
        expect(typeof model.name).toBe('string');
        expect(typeof model.description).toBe('string');
      }
    });
  });
});
