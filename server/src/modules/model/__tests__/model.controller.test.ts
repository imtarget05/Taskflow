import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Request, Response } from 'express';

jest.mock('../ollama.client', () => ({
  listModels: jest.fn(),
  pullModel: jest.fn(),
  deleteModel: jest.fn(),
  showModel: jest.fn(),
  isOllamaRunning: jest.fn(),
}));
jest.mock('../model.service', () => ({
  getActiveModel: jest.fn(() => 'qwen2.5:7b'),
  validateModel: jest.fn(),
  getModelRecommendations: jest.fn(),
}));
jest.mock('../../../config/env', () => ({
  env: { NODE_ENV: 'test' },
}));

import { listModels, getStatus } from '../model.controller';
import { listModels as listOllamaModels, isOllamaRunning } from '../ollama.client';
import { validateModel } from '../model.service';

const mockedList = listOllamaModels as jest.MockedFunction<typeof listOllamaModels>;
const mockedIsRunning = isOllamaRunning as jest.MockedFunction<typeof isOllamaRunning>;
const mockedValidate = validateModel as jest.MockedFunction<typeof validateModel>;

function mockRes(): Response {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
  return res;
}

/** Flush microtasks so asyncHandler chains complete before assertions. */
const flush = () => new Promise((r) => setImmediate(r));

describe('model.controller — graceful degradation khi provider không phải Ollama', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET /api/models trả 200 + danh sách rỗng khi Ollama không khả dụng (không 500)', async () => {
    mockedList.mockRejectedValue(new Error('fetch failed'));
    const res = mockRes();
    const next = jest.fn();
    await listModels({} as Request, res, next);
    await flush();
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ models: [], count: 0 }),
      })
    );
  });

  it('GET /api/models trả danh sách khi Ollama hoạt động', async () => {
    mockedList.mockResolvedValue([
      { name: 'qwen2.5:7b', size: 1, digest: 'abc', modifiedAt: '2026-01-01' },
    ]);
    const res = mockRes();
    await listModels({} as Request, res, jest.fn());
    await flush();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ count: 1, activeModel: 'qwen2.5:7b' }),
      })
    );
  });

  it('GET /api/models/status trả 200 khi Ollama không khả dụng', async () => {
    mockedIsRunning.mockRejectedValue(new Error('fetch failed'));
    mockedValidate.mockResolvedValue(false);
    const res = mockRes();
    await getStatus({} as Request, res, jest.fn());
    await flush();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ running: false }),
      })
    );
  });
});
