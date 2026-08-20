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
}

export function isLLMConfigured(): boolean {
  return Boolean(env.LLM_BASE_URL && env.LLM_MODEL);
}

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

/**
 * OpenAI-compatible chat completions client. The model and endpoint live only
 * on the server (env) — the browser never sees LLM credentials.
 */
export async function chatCompletion(
  messages: LLMMessage[],
  opts: ChatCompletionOptions = {}
): Promise<string> {
  if (!isLLMConfigured()) {
    throw new AppError('AI assistant is not configured', StatusCodes.SERVICE_UNAVAILABLE);
  }

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (env.LLM_API_KEY) headers.authorization = `Bearer ${env.LLM_API_KEY}`;

  const res = await requestWithRetry(`${env.LLM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: env.LLM_MODEL,
      messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 2048,
    }),
  });

  if (!res.ok) {
    throw new AppError(`LLM request failed (HTTP ${res.status})`, StatusCodes.BAD_GATEWAY);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new AppError('LLM returned an invalid response', StatusCodes.BAD_GATEWAY);
  }
  return content;
}