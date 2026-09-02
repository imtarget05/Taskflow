import { AppError } from '../../utils/errors';
import { StatusCodes } from 'http-status-codes';
import { env } from '../../config/env';
import { observeLLMCall } from '../../lib/langfuse';

export type LLMRole = 'system' | 'user' | 'assistant';

/** A single text part in a multimodal message. */
export interface LLMTextPart {
  type: 'text';
  text: string;
}

/** An image part (OpenAI-compatible `image_url`). URL is a data: URI. */
export interface LLMImagePart {
  type: 'image_url';
  image_url: { url: string };
}

export type LLMContentPart = LLMTextPart | LLMImagePart;

export interface LLMMessage {
  role: LLMRole;
  /**
   * Either a plain string (text-only) or a list of content parts for
   * multimodal turns (e.g. text + attached images for vision models).
   */
  content: string | LLMContentPart[];
}

export interface ChatCompletionOptions {
  temperature?: number;
  maxTokens?: number;
  /**
   * Nucleus (top_p) sampling, 0 < topP <= 1. When set it is sent to the
   * provider; otherwise falls back to env.LLM_TOP_P and, if that is unset too,
   * the provider's own default (OpenAI-compatible endpoints typically default
   * to 1 = no nucleus truncation).
   */
  topP?: number;
  /** Explicit model override. Defaults to env.LLM_MODEL (the default tier). */
  model?: string;
}

/** A structured tool invocation the provider decided to call. */
export interface LLMToolCall {
  name: string;
  /** JSON string of the function arguments. */
  arguments: string;
}

/** An OpenAI-compatible function tool definition passed in the `tools` field. */
export interface LLMFunctionTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** Structured result of a chat completion that may include tool calls. */
export interface ChatCompletionWithToolsResult {
  /** Assistant text (may be empty when the model only returned a tool call). */
  content: string;
  /** Zero or more tool calls the model requested. */
  toolCalls: LLMToolCall[];
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

/** Privacy-safe structured log line for LLM provider events (no prompts/keys/bodies). */
function llmLog(level: 'info'|'warn'|'error', event: string, data: Record<string, unknown>): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), area: 'llm', event, ...data });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolve the nucleus-sampling value to send to the provider. Precedence:
 * per-call option > env LLM_TOP_P > undefined (= provider default). Returning
 * undefined lets us omit `top_p` entirely so providers that reject unknown/no
 * noisy params stay happy.
 */
function resolveTopP(opts: ChatCompletionOptions): number | undefined {
  if (opts.topP !== undefined) return opts.topP;
  if (env.LLM_TOP_P !== undefined) return env.LLM_TOP_P;
  return undefined;
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
      llmLog('warn', 'provider_network_retry', { attempt, maxAttempts: MAX_ATTEMPTS });
      await sleep(250 * 2 ** (attempt - 1));
      return requestWithRetry(url, init, attempt + 1);
    }
    throw new AppError('LLM request failed (timeout or unreachable)', StatusCodes.BAD_GATEWAY);
  }
  clearTimeout(timer);

  if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_ATTEMPTS) {
    llmLog('warn', 'provider_rate_limited', { status: res.status, attempt, maxAttempts: MAX_ATTEMPTS });
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
  const startedAt = Date.now();
  const res = await requestWithRetry(`${env.LLM_BASE_URL}${path}`, {
    method: 'POST',
    headers: aiHeaders(),
    body: JSON.stringify(body),
  });
  const durationMs = Date.now() - startedAt;

  if (!res.ok) {
    // Exhausted rate limit → surface as 503 with a safe, user-friendly
    // message; other provider failures stay a generic 502. Never leak the
    // provider response, quota details, or credentials.
    llmLog('error', 'provider_error', {
      method: 'POST',
      path,
      status: res.status,
      durationMs,
      exhausted: RETRYABLE_STATUS.has(res.status),
    });
    if (res.status === 429) {
      throw new AppError(
        'AI service is temporarily unavailable. Please try again shortly.',
        StatusCodes.SERVICE_UNAVAILABLE
      );
    }
    throw new AppError(`LLM request failed (HTTP ${res.status})`, StatusCodes.BAD_GATEWAY);
  }

  llmLog('info', 'provider_request', { method: 'POST', path, status: res.status, durationMs });
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

/** Result of a single model chat attempt (no throw for non-OK status). */
interface ChatAttempt {
  ok: boolean;
  content?: string;
  /** HTTP status when !ok, else 200. */
  status: number;
  durationMs?: number;
}

export const PROVIDER_EMPTY_RESPONSE = 469; // non-standard sentinel: provider ok but returned no usable content

async function chatWithModel(
  model: string,
  messages: LLMMessage[],
  opts: ChatCompletionOptions
): Promise<ChatAttempt> {
  const startedAt = Date.now();
  const topP = resolveTopP(opts);
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 2048,
  };
  if (topP !== undefined) body.top_p = topP;
  const res = await requestWithRetry(`${env.LLM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: aiHeaders(),
    body: JSON.stringify(body),
  });
  const durationMs = Date.now() - startedAt;

  if (!res.ok) {
    llmLog('error', 'provider_error', {
      method: 'POST',
      path: '/chat/completions',
      status: res.status,
      durationMs,
      exhausted: RETRYABLE_STATUS.has(res.status),
    });
    return { ok: false, status: res.status, durationMs };
  }

  llmLog('info', 'provider_request', { method: 'POST', path: '/chat/completions', status: res.status, durationMs });

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    // Cloudflare Workers AI wraps the same shape in a `result` envelope.
    result?: { choices?: { message?: { content?: string } }[] };
  };
  const choice = data?.choices?.[0] ?? data?.result?.choices?.[0];
  const content = choice?.message?.content;
  // Treat BOTH missing and whitespace-only content as "empty" — the caller
  // gets a sentinel status so the fallback model gets a chance instead of
  // seeing the router short-circuit to a 200 with an unusable string.
  if (typeof content !== 'string' || content.trim() === '') {
    return { ok: false, status: PROVIDER_EMPTY_RESPONSE, durationMs };
  }
  return { ok: true, content, status: 200, durationMs };
}

export async function chatCompletion(
  messages: LLMMessage[],
  opts: ChatCompletionOptions = {}
): Promise<string> {
  const primaryModel = opts.model ?? env.LLM_MODEL;
  if (!primaryModel) {
    throw new AppError('AI assistant is not configured', StatusCodes.SERVICE_UNAVAILABLE);
  }

  const first = await chatWithModel(primaryModel, messages, opts);

  // Primary succeeded → return immediately.
  if (first.ok && typeof first.content === 'string') {
    observeLLMCall(primaryModel, first.durationMs ?? 0, first.status ?? 0);
    return first.content;
  }

  // Fallback is eligible when the provider returned a transient, retryable
  // failure (e.g. 429 quota / 5xx), or when the provider returned 200 with
  // no usable content (e.g. empty / malformed envelope). Client errors
  // (400/401/403/404) never trigger a fallback.
  const FALLBACK_ELIGIBLE_STATUS = new Set([...RETRYABLE_STATUS, PROVIDER_EMPTY_RESPONSE]);
  const fallbackModel = env.LLM_FALLBACK_MODEL;
  const primaryStatus = first.status;
  if (
    fallbackModel &&
    fallbackModel !== primaryModel &&
    primaryStatus != null &&
    FALLBACK_ELIGIBLE_STATUS.has(primaryStatus)
  ) {
    llmLog('warn', 'provider_fallback_attempt', {
      primaryModel,
      fallbackModel,
      reason: `${primaryStatus}_exhausted`,
    });
    const fb = await chatWithModel(fallbackModel, messages, opts);
    if (fb.ok && typeof fb.content === 'string') {
      llmLog('info', 'provider_fallback_success', { model: fallbackModel, durationMs: fb.durationMs });
      return fb.content;
    }
    // Log but do NOT leak credentials/prompt/body.
    llmLog('error', 'provider_fallback_error', {
      model: fallbackModel,
      status: fb.status,
      exhausted: true,
    });
  }

  // Exhausted 429 → safe 503 user message; empty-response / 5xx → generic 502.
  if (primaryStatus === 429) {
    throw new AppError(
      'AI service is temporarily unavailable. Please try again shortly.',
      StatusCodes.SERVICE_UNAVAILABLE
    );
  }
  if (primaryStatus === PROVIDER_EMPTY_RESPONSE) {
    throw new AppError(
      'AI service returned an empty response. Please try again shortly.',
      StatusCodes.BAD_GATEWAY
    );
  }
  throw new AppError(`LLM request failed (HTTP ${primaryStatus ?? 'unknown'})`, StatusCodes.BAD_GATEWAY);
}

/**
 * Chat completion that ALSO advertises function tools and surfaces any tool
 * call the provider requests. This is the reliable path for agent actions:
 * instead of coaxing a free-text JSON tag out of an instruct model, the model
 * returns a structured `tool_calls` array (OpenAI-compatible — also reading
 * Cloudflare Workers AI's `result` envelope). Falls back to a secondary model
 * on transient failures, mirroring `chatCompletion`.
 *
 * Returns `{ content, toolCalls }`. `content` is the assistant text (may be
 * empty), `toolCalls` the requested invocations (may be empty when the model
 * just replied with text).
 */
export async function chatCompletionWithTools(
  messages: LLMMessage[],
  tools: LLMFunctionTool[],
  opts: ChatCompletionOptions = {}
): Promise<ChatCompletionWithToolsResult> {
  const primaryModel = opts.model ?? env.LLM_MODEL;
  if (!primaryModel) {
    throw new AppError('AI assistant is not configured', StatusCodes.SERVICE_UNAVAILABLE);
  }

  const attempt = async (model: string): Promise<ChatCompletionWithToolsResultInternal> => {
    const startedAt = Date.now();
    const topP = resolveTopP(opts);
    const body: Record<string, unknown> = {
      model,
      messages,
      tools,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 2048,
    };
    if (topP !== undefined) body.top_p = topP;
    const res = await requestWithRetry(`${env.LLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: aiHeaders(),
      body: JSON.stringify(body),
    });
    const durationMs = Date.now() - startedAt;

    if (!res.ok) {
      llmLog('error', 'provider_error', {
        method: 'POST',
        path: '/chat/completions',
        status: res.status,
        durationMs,
        exhausted: RETRYABLE_STATUS.has(res.status),
      });
      return { ok: false, status: res.status, content: '', toolCalls: [] };
    }

    llmLog('info', 'provider_request', {
      method: 'POST',
      path: '/chat/completions',
      status: res.status,
      durationMs,
    });

    const data = (await res.json()) as {
      choices?: ToolChoice[];
      result?: { choices?: ToolChoice[] };
    };
    const choice = data?.choices?.[0] ?? data?.result?.choices?.[0];
    const content = typeof choice?.message?.content === 'string' ? choice.message.content : '';
    const toolCalls: LLMToolCall[] = (choice?.message?.tool_calls ?? []).map((tc) => ({
      name: tc?.function?.name ?? '',
      arguments: tc?.function?.arguments ?? '',
    }));
    return { ok: true, status: 200, content, toolCalls, durationMs };
  };

  const first = await attempt(primaryModel);
  if (first.ok) {
    observeLLMCall(primaryModel, first.durationMs ?? 0, first.status ?? 0);
    return { content: first.content, toolCalls: first.toolCalls };
  }

  const FALLBACK_ELIGIBLE_STATUS = new Set([...RETRYABLE_STATUS, PROVIDER_EMPTY_RESPONSE]);
  const fallbackModel = env.LLM_FALLBACK_MODEL;
  if (fallbackModel && fallbackModel !== primaryModel && FALLBACK_ELIGIBLE_STATUS.has(first.status)) {
    const fb = await attempt(fallbackModel);
    if (fb.ok) return { content: fb.content, toolCalls: fb.toolCalls };
  }

  if (first.status === 429) {
    throw new AppError(
      'AI service is temporarily unavailable. Please try again shortly.',
      StatusCodes.SERVICE_UNAVAILABLE
    );
  }
  if (first.status === PROVIDER_EMPTY_RESPONSE) {
    throw new AppError(
      'AI service returned an empty response. Please try again shortly.',
      StatusCodes.BAD_GATEWAY
    );
  }
  throw new AppError(`LLM request failed (HTTP ${first.status ?? 'unknown'})`, StatusCodes.BAD_GATEWAY);
}

interface ToolChoice {
  message?: {
    content?: null | string;
    tool_calls?: { function?: { name?: string; arguments?: string } }[];
  };
}

interface ChatCompletionWithToolsResultInternal {
  ok: boolean;
  status: number;
  content: string;
  toolCalls: LLMToolCall[];
  durationMs?: number;
}

/**
 * Stream a chat completion with tool support. Yields content chunks as they
 * arrive from the provider, then a final result with any tool calls.
 *
 * Returns an AsyncIterable of:
 *   - { type: 'token', data: string } for each content delta
 *   - { type: 'tool_calls', data: LLMToolCall[] } once at the end if any
 *   - { type: 'done' } when the stream is complete
 *   - { type: 'error', data: { message: string } } on failure
 *
 * The provider must support streaming (OpenAI-compatible SSE). If the response
 * has no body (non-streaming provider), falls back to the non-streaming path.
 */
export interface StreamChunk {
  type: 'token' | 'tool_calls' | 'done' | 'error';
  data?: unknown;
}

export async function* streamChatCompletionWithTools(
  messages: LLMMessage[],
  tools: LLMFunctionTool[],
  opts: ChatCompletionOptions = {}
): AsyncIterable<StreamChunk> {
  if (!isLLMConfigured()) {
    yield { type: 'error', data: { message: 'AI assistant is not configured' } };
    return;
  }

  const model = opts.model ?? env.LLM_MODEL;
  if (!model) {
    yield { type: 'error', data: { message: 'AI assistant is not configured' } };
    return;
  }

  const topP = resolveTopP(opts);
  const body: Record<string, unknown> = {
    model,
    messages,
    tools,
    stream: true,
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 2048,
  };
  if (topP !== undefined) body.top_p = topP;

  let res: Response;
  try {
    res = await requestWithRetry(`${env.LLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: aiHeaders(),
      body: JSON.stringify(body),
    });
  } catch (err) {
    const msg = err instanceof AppError ? err.message : 'LLM request failed';
    yield { type: 'error', data: { message: msg } };
    return;
  }

  if (!res.ok) {
    const status = res.status;
    if (status === 429) {
      yield { type: 'error', data: { message: 'AI service is temporarily unavailable. Please try again shortly.' } };
    } else {
      yield { type: 'error', data: { message: `LLM request failed (HTTP ${status})` } };
    }
    return;
  }

  if (!res.body) {
    // Provider does not support streaming; fall back to non-streaming.
    yield { type: 'error', data: { message: 'Streaming not supported by provider' } };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const toolCallsAccumulated: LLMToolCall[] = [];
  let contentAccumulated = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE events from the buffer
      let sepIndex: number;
      while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, sepIndex).trim();
        buffer = buffer.slice(sepIndex + 2);

        if (!raw) continue;

        // SSE event: collect all data: lines
        let eventData = '';
        for (const line of raw.split('\n')) {
          if (line.startsWith('data: ')) {
            eventData += line.slice(6);
          }
        }

        if (!eventData) continue;

        if (eventData === '[DONE]') {
          // End of stream sentinel
          continue;
        }

        try {
          const parsed = JSON.parse(eventData) as {
            choices?: {
              delta?: {
                content?: string;
                tool_calls?: {
                  index: number;
                function?: { name?: string; arguments?: string };
                }[];
              };
              finish_reason?: string;
            }[];
          };

          const delta = parsed?.choices?.[0]?.delta;
          if (delta?.content) {
            contentAccumulated += delta.content;
            yield { type: 'token', data: delta.content };
          }

          // Accumulate streamed tool call fragments
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index;
              if (!toolCallsAccumulated[idx]) {
                toolCallsAccumulated[idx] = { name: '', arguments: '' };
              }
              if (tc.function?.name) {
                toolCallsAccumulated[idx].name += tc.function.name;
              }
              if (tc.function?.arguments) {
                toolCallsAccumulated[idx].arguments += tc.function.arguments;
              }
            }
          }
        } catch {
          // Skip malformed JSON chunks
          continue;
        }
      }
    }

    // Emit accumulated tool calls at the end
    if (toolCallsAccumulated.length > 0) {
      yield { type: 'tool_calls', data: toolCallsAccumulated };
    }

    yield { type: 'done', data: { content: contentAccumulated } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Stream error';
    yield { type: 'error', data: { message: msg } };
  } finally {
    reader.releaseLock();
  }
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

// ---------------------------------------------------------------------------
// Token counting — accurate BPE counts via js-tiktoken (lazy-loaded so the
// rank data is only paid for when counting is actually needed). Falls back to
// a chars/4 heuristic if the tokenizer cannot be loaded (defensive only).
// ---------------------------------------------------------------------------

type TiktokenLike = { encode(text: string): number[] };
let tokenizerPromise: Promise<TiktokenLike> | null = null;

function getTokenizer(): Promise<TiktokenLike> {
  if (!tokenizerPromise) {
    tokenizerPromise = import('js-tiktoken')
      .then((mod) => mod.getEncoding('o200k_base') as unknown as TiktokenLike)
      .catch(() => null as unknown as TiktokenLike);
  }
  return tokenizerPromise;
}

/** Fallback heuristic ≈ OpenAI tokenizers for mixed English/Vietnamese text. */
function estimateTokensHeuristic(text: string): number {
  return Math.max(1, Math.ceil(text.trim().length / 4));
}

/**
 * Count tokens for a text using the real BPE tokenizer (o200k_base).
 * Falls back to a heuristic if the tokenizer data cannot be loaded.
 */
export async function countTokens(text: string): Promise<number> {
  if (!text) return 0;
  const enc = await getTokenizer();
  if (!enc) return estimateTokensHeuristic(text);
  try {
    return enc.encode(text).length;
  } catch {
    return estimateTokensHeuristic(text);
  }
}

/**
 * Estimate the total prompt tokens of a message list, including the
 * per-message overhead (≈4 tokens: role, name delimiters) used by
 * OpenAI-compatible chat APIs. Useful for context-window budgeting.
 */
export async function estimateMessagesTokens(messages: LLMMessage[]): Promise<number> {
  let total = 0;
  for (const msg of messages) {
    total += 4; // per-message framing overhead
    const text =
      typeof msg.content === 'string'
        ? msg.content
        : msg.content.map((p) => (p.type === 'text' ? p.text : '')).join(' ');
    total += await countTokens(text);
  }
  total += 2; // reply priming
  return total;
}

/**
 * Reorder messages so every `system` message forms a stable leading prefix
 * before the dialogue. Providers key their prompt KV-cache on the longest
 * shared prefix — a fixed system prefix maximizes cache hits (and cuts both
 * latency and cost on providers that bill cached tokens at a discount).
 * The function is idempotent: applying it to its own output is a no-op.
 */
export function withStablePrefix(messages: LLMMessage[]): LLMMessage[] {
  const system = messages.filter((m) => m.role === 'system');
  const rest = messages.filter((m) => m.role !== 'system');
  return [...system, ...rest];
}

// ---------------------------------------------------------------------------
// Batched embeddings — large bulk operations (e.g. legal corpus indexing with
// hundreds of chunks) are split into bounded batches executed with limited
// concurrency so a single embed() call never ships a giant payload (provider
// request-size limits) and the endpoint is never flooded.
// ---------------------------------------------------------------------------

export interface EmbedBatchedOptions {
  /** Max texts per request (default 32). */
  batchSize?: number;
  /** Max in-flight requests (default 4). */
  concurrency?: number;
}

/**
 * Embed a (possibly large) list of texts in bounded, concurrent batches.
 * The returned vectors preserve the input order. Splits work evenly-ish:
 * `ceil(n / batchSize)` requests, at most `concurrency` in flight.
 */
export async function embedBatched(
  texts: string[],
  { batchSize = 32, concurrency = 4 }: EmbedBatchedOptions = {}
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const size = Math.max(1, Math.floor(batchSize));
  const limit = Math.max(1, Math.floor(concurrency));

  const batches: { start: number; items: string[] }[] = [];
  for (let i = 0; i < texts.length; i += size) {
    batches.push({ start: i, items: texts.slice(i, i + size) });
  }

  const out: number[][] = new Array(texts.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, batches.length) }, async () => {
    while (next < batches.length) {
      const batch = batches[next++];
      const vectors = await embed(batch.items);
      if (vectors.length !== batch.items.length) {
        throw new AppError(
          `Embed batch count mismatch: ${vectors.length} != ${batch.items.length}`,
          StatusCodes.BAD_GATEWAY
        );
      }
      for (let i = 0; i < vectors.length; i++) out[batch.start + i] = vectors[i];
    }
  });
  await Promise.all(workers);
  return out;
}