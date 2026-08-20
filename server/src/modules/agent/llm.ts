import { AppError } from '../../utils/errors';
import { StatusCodes } from 'http-status-codes';
import { env } from '../../config/env';

export type LLMRole = 'system' | 'user' | 'assistant';

export interface LLMMessage {
  role: LLMRole;
  content: string;
}

export interface ChatCompletionOptions {
  temperature?: number;
  maxTokens?: number;
  /** Explicit model override. Defaults to env.LLM_MODEL (the default tier). */
  model?: string;
}

/**
 * LLM router tiers. `routeModel()` picks a tier from the question; the tier
 * maps to a concrete model id via `modelForTier()` (env-driven so the router
 * stays provider-agnostic — Cloudflare Workers AI, Ollama, vLLM, ...).
 */
export type LLMModelTier = 'default' | 'premium' | 'reasoning';

// Strong signals that the question needs deep legal reasoning.
const REASONING_RE =
  /(phân tích|so sánh|đối chiếu|áp dụng cụ thể|trường hợp|ngoại lệ|điều kiện áp dụng|hậu quả pháp lý|án lệ|tình huống|giải quyết tranh chấp)/i;

// Legal-domain vocabulary — presence of several terms marks a complex question.
const LEGAL_DEEP_RE =
  /(điều|khoản|tội|hình sự|dân sự|bồi thường|tranh chấp|hợp đồng|trách nhiệm|nghị định|thông tư|hiến pháp|luật|vi phạm|phạt)/i;

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestWithRetry(
  url: string,
  init: RequestInit,
  attempt = 1
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.LLM_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    if (attempt < MAX_ATTEMPTS) {
      await sleep(250 * 2 ** (attempt - 1));
      return requestWithRetry(url, init, attempt + 1);
    }
    throw new AppError('LLM request failed (timeout or unreachable)', StatusCodes.BAD_GATEWAY);
  }
  clearTimeout(timer);

  if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_ATTEMPTS) {
    await sleep(250 * 2 ** (attempt - 1));
    return requestWithRetry(url, init, attempt + 1);
  }
  return res;
}

function aiHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (env.LLM_API_KEY) headers.authorization = `Bearer ${env.LLM_API_KEY}`;
  return headers;
}

async function aiPost<T>(path: string, body: unknown): Promise<T> {
  if (!isLLMConfigured()) {
    throw new AppError('AI assistant is not configured', StatusCodes.SERVICE_UNAVAILABLE);
  }
  const res = await requestWithRetry(`${env.LLM_BASE_URL}${path}`, {
    method: 'POST',
    headers: aiHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new AppError(`LLM request failed (HTTP ${res.status})`, StatusCodes.BAD_GATEWAY);
  }
  return (await res.json()) as T;
}

export function isLLMConfigured(): boolean {
  return Boolean(env.LLM_BASE_URL && env.LLM_MODEL);
}

/**
 * Map a router tier to a concrete model id. Falls back down the ladder so a
 * missing premium/reasoning model never breaks the flow.
 */
export function modelForTier(tier: LLMModelTier): string {
  if (tier === 'premium') return env.LLM_MODEL_PREMIUM || env.LLM_MODEL || '';
  if (tier === 'reasoning') return env.LLM_MODEL_REASONING || env.LLM_MODEL || '';
  return env.LLM_MODEL || '';
}

/**
 * Deterministic, token-free complexity heuristic. Long or legal-vocabulary
 * heavy questions escalate; very long + reasoning-trigger questions use the
 * slow reasoning model. Default tier stays cheap (neuron budget).
 */
export function routeModel(question: string): LLMModelTier {
  const q = question.trim();
  const words = q.split(/\s+/).filter(Boolean).length;

  if (words > 120 || q.length > 600) {
    return REASONING_RE.test(q) ? 'reasoning' : 'premium';
  }
  if (words > 40 && LEGAL_DEEP_RE.test(q)) {
    return 'premium';
  }
  return 'default';
}

/**
 * OpenAI-compatible chat completions client. The model and endpoint live only
 * on the server (env) — the browser never sees LLM credentials.
 */
export async function chatCompletion(
  messages: LLMMessage[],
  opts: ChatCompletionOptions = {}
): Promise<string> {
  const data = await aiPost<{
    choices?: { message?: { content?: string } }[];
    // Cloudflare Workers AI wraps the same shape in a `result` envelope.
    result?: { choices?: { message?: { content?: string } }[] };
  }>('/chat/completions', {
    model: opts.model ?? env.LLM_MODEL,
    messages,
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 2048,
  });

  const choice = data?.choices?.[0] ?? data?.result?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content !== 'string') {
    throw new AppError('LLM returned an invalid response', StatusCodes.BAD_GATEWAY);
  }
  return content;
}

export interface EmbeddingResult {
  embedding: number[];
}

/**
 * Embed texts via an OpenAI-compatible embeddings endpoint (bge-m3 on Workers
 * AI is multilingual — Vietnamese included). Returns one vector per input.
 */
export async function embed(texts: string[]): Promise<number[][]> {
  const data = await aiPost<{
    result?: { data?: { embedding?: number[] }[] };
    data?: { embedding?: number[] }[];
  }>('/embeddings', { model: env.LLM_EMBED_MODEL ?? env.LLM_MODEL, text: texts });

  const rows = data?.result?.data ?? data?.data;
  if (!rows || rows.length === 0) {
    throw new AppError('LLM returned no embeddings', StatusCodes.BAD_GATEWAY);
  }
  return rows.map((row) => {
    if (!Array.isArray(row.embedding) || row.embedding.length === 0) {
      throw new AppError('LLM returned an invalid embedding', StatusCodes.BAD_GATEWAY);
    }
    return row.embedding as number[];
  });
}

export interface RerankResult {
  index: number;
  relevance_score: number;
}

/**
 * Rerank retrieved documents against the query (bge-reranker on Workers AI).
 * The rerank endpoint is Cloudflare-specific (`/rerank`), not OpenAI-compatible.
 */
export async function rerank(query: string, documents: string[]): Promise<RerankResult[]> {
  if (documents.length === 0) return [];
  const data = await aiPost<{
    result?: { index?: number; relevance_score?: number }[];
  }>('/rerank', {
    model: env.LLM_RERANK_MODEL ?? env.LLM_MODEL,
    query,
    documents,
  });

  const rows = data?.result;
  if (!Array.isArray(rows)) {
    throw new AppError('LLM returned an invalid rerank response', StatusCodes.BAD_GATEWAY);
  }
  return rows
    .map((row) => ({ index: row.index ?? -1, relevance_score: row.relevance_score ?? 0 }))
    .filter((row) => row.index >= 0)
    .sort((a, b) => b.relevance_score - a.relevance_score);
}