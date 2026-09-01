import { env } from '../../config/env';
import { listModels, OllamaModel } from './ollama.client';

export interface ModelRecommendation {
  default: RecommendedModel[];
  premium: RecommendedModel[];
  reasoning: RecommendedModel[];
  embed: RecommendedModel[];
  rerank: RecommendedModel[];
}

export interface RecommendedModel {
  name: string;
  description: string;
}

/**
 * List all locally available Ollama models.
 */
export async function listAvailableModels(): Promise<OllamaModel[]> {
  return listModels();
}

/**
 * Get the currently active model from env configuration.
 */
export function getActiveModel(): string | undefined {
  return env.LLM_MODEL;
}

/**
 * Validate that a model exists locally.
 */
export async function validateModel(name: string): Promise<boolean> {
  const models = await listModels();
  return models.some((m) => m.name === name);
}

/**
 * Return recommended models per tier.
 * These are well-known models that work well for each use case.
 */
export function getModelRecommendations(): ModelRecommendation {
  return {
    default: [
      { name: 'qwen2.5:7b', description: 'Mô hình chính — cân bằng tốc độ và chất lượng cho tác vụ tổng quát' },
      { name: 'llama3.2:3b', description: 'Nhẹ, nhanh — phù hợp cho thiết bị yếu' },
      { name: 'mistral:7b', description: 'Tốt cho tiếng Anh và đa ngôn ngữ' },
    ],
    premium: [
      { name: 'qwen2.5:14b', description: 'Chất lượng cao hơn — phù hợp cho nội dung phức tạp' },
      { name: 'llama3.1:8b', description: 'Meta Llama 3.1 — hiểu ngữ cảnh tốt' },
      { name: 'mixtral:8x7b', description: 'MoE — chất lượng cao với chi phí hợp lý' },
    ],
    reasoning: [
      { name: 'deepseek-r1:7b', description: 'Mô hình suy luận — tốt cho logic và toán học' },
      { name: 'qwen2.5:14b', description: 'Cân bằng — suy luận tốt mà không quá nặng' },
    ],
    embed: [
      { name: 'nomic-embed-text:latest', description: 'Embedding mặc định — tốt cho RAG và tìm kiếm ngữ nghĩa' },
      { name: 'mxbai-embed-large:latest', description: 'Embedding chất lượng cao — kích thước lớn hơn' },
    ],
    rerank: [
      { name: 'bge-reranker-v2-m3:latest', description: 'Reranker nhẹ — cải thiện thứ tự kết quả tìm kiếm' },
      { name: 'jina-reranker-v1-tiny:latest', description: 'Reranker siêu nhẹ — phù hợp cho production' },
    ],
  };
}
