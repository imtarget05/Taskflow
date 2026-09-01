import { env } from '../../config/env';
import { logger } from '../../lib/logger';

export interface OllamaModel {
  name: string;
  size: number;
  digest: string;
  modifiedAt: string;
}

export interface OllamaModelDetail {
  name: string;
  modelfile: string;
  parameters: string;
  template: string;
  details: {
    family: string;
    parameterSize: string;
    quantizationLevel: string;
  };
}

// Default Ollama endpoint — matches n8n setup convention
const OLLAMA_BASE_URL = env.LLM_BASE_URL ?? 'http://localhost:11434';

/**
 * List all locally available models from Ollama.
 * GET /api/tags
 */
export async function listModels(): Promise<OllamaModel[]> {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
    method: 'GET',
    headers: { accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Ollama list models failed: HTTP ${res.status}`);
  }
  const data = (await res.json()) as { models: OllamaModel[] };
  return data.models ?? [];
}

/**
 * Pull a model from the Ollama library.
 * POST /api/pull — streams progress; we await completion.
 */
export async function pullModel(name: string): Promise<void> {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/pull`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    throw new Error(`Ollama pull model failed: HTTP ${res.status}`);
  }
  // Drain the streaming response to ensure pull completes
  if (res.body) {
    const reader = res.body.getReader();
    let done = false;
    while (!done) {
      const result = await reader.read();
      done = result.done;
    }
  }
  logger.info({ model: name }, 'Ollama model pulled successfully');
}

/**
 * Delete a local model.
 * DELETE /api/delete
 */
export async function deleteModel(name: string): Promise<void> {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/delete`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    throw new Error(`Ollama delete model failed: HTTP ${res.status}`);
  }
  logger.info({ model: name }, 'Ollama model deleted');
}

/**
 * Show detailed info about a model.
 * POST /api/show
 */
export async function showModel(name: string): Promise<OllamaModelDetail> {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/show`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    throw new Error(`Ollama show model failed: HTTP ${res.status}`);
  }
  return (await res.json()) as OllamaModelDetail;
}

/**
 * Check if Ollama is reachable.
 * GET / — returns "Ollama is running" on success.
 */
export async function isOllamaRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false;
    const text = await res.text();
    return text.includes('Ollama');
  } catch {
    return false;
  }
}
