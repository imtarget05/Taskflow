import { RequestHandler } from 'express';
import { StatusCodes } from 'http-status-codes';
import { asyncHandler, AppError } from '../../utils/errors';
import {
  listModels as listOllamaModels,
  pullModel as pullOllamaModel,
  deleteModel as deleteOllamaModel,
  showModel,
  isOllamaRunning,
  OllamaModel,
} from './ollama.client';
import {
  getActiveModel,
  validateModel,
  getModelRecommendations,
} from './model.service';
import { logger } from '../../lib/logger';

/**
 * GET /api/models
 * List all locally available Ollama models.
 *
 * Production chạy LLM provider Cloudflare Workers AI (không có Ollama) —
 * provider không khả dụng phải degrade về danh sách rỗng (200), KHÔNG được
 * 500 làm sập trang AI Studio.
 */
export const listModels: RequestHandler = asyncHandler(async (_req, res) => {
  const models = await listOllamaModels().catch((err: unknown) => {
    logger.warn({ err }, 'Ollama list models unavailable — degrading to empty list');
    return [] as OllamaModel[];
  });
  const activeModel = getActiveModel();
  res.json({
    success: true,
    data: {
      models,
      activeModel,
      count: models.length,
    },
  });
});

/**
 * GET /api/models/status
 * Check Ollama connectivity.
 */
export const getStatus: RequestHandler = asyncHandler(async (_req, res) => {
  const running = await isOllamaRunning().catch(() => false);
  const activeModel = getActiveModel();
  const modelValid = activeModel ? await validateModel(activeModel).catch(() => false) : false;
  res.json({
    success: true,
    data: {
      running,
      activeModel,
      modelValid,
    },
  });
});

/**
 * GET /api/models/recommendations
 * Get recommended models per tier.
 */
export const getRecommendations: RequestHandler = asyncHandler(async (_req, res) => {
  const recommendations = getModelRecommendations();
  res.json({
    success: true,
    data: recommendations,
  });
});

/**
 * GET /api/models/:name
 * Get detailed info about a specific model.
 */
export const getModelDetail: RequestHandler = asyncHandler(async (req, res) => {
  const name = String(req.params.name);
  // showModel talks to Ollama directly — surface a clean 503 (not a raw 500)
  // when the provider is unreachable (e.g. Cloudflare Workers AI has no /api/show).
  const detail = await showModel(name).catch(() => {
    throw new AppError('Ollama không khả dụng — không thể xem chi tiết model', StatusCodes.SERVICE_UNAVAILABLE);
  });
  res.json({
    success: true,
    data: detail,
  });
});

/**
 * POST /api/models/pull
 * Pull a new model from Ollama library.
 */
export const pullModel: RequestHandler = asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string') {
    throw new AppError('Model name is required', StatusCodes.BAD_REQUEST);
  }
  await pullOllamaModel(name).catch(() => {
    throw new AppError('Ollama không khả dụng — không thể pull model', StatusCodes.SERVICE_UNAVAILABLE);
  });
  res.json({
    success: true,
    message: `Model '${name}' pulled successfully`,
  });
});

/**
 * DELETE /api/models/:name
 * Delete a local model.
 */
export const deleteModel: RequestHandler = asyncHandler(async (req, res) => {
  const name = String(req.params.name);
  await deleteOllamaModel(name).catch(() => {
    throw new AppError('Ollama không khả dụng — không thể xóa model', StatusCodes.SERVICE_UNAVAILABLE);
  });
  res.json({
    success: true,
    message: `Model '${name}' deleted successfully`,
  });
});
