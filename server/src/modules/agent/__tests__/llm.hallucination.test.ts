/**
 * Additional test cases for LLM behaviour beyond empty-content fallback.
 * Covers hallucination / unrelated content scenarios — BUT only the cases the
 * current router actually handles: null content, empty string, and sentinel 469.
 *
 * NOTE: The router does NOT perform semantic similarity checks, so it cannot
 * detect that a non-empty response is "unrelated" to the prompt. That capability
 * is out of scope for the current fallback layer and would require a separate
 * evaluation pipeline (e.g. embedding-based relevance scoring).
 */
import { StatusCodes } from 'http-status-codes';

import { chatCompletion } from '../llm';
import * as envModule from '../../../config/env';

const env: any = envModule;

const callLog = [];
let nextResponse = { status: 200, body: { choices: [{ message: { content: 'ok' } }] } };
let nextResponses: any[] = [];
let nextResponseIdx = 0;

(global as any).fetch = jest.fn(async (url, init) => {
  let body = {};
  try { body = init && init.body ? JSON.parse(init.body) : {}; } catch { body = {}; }
  callLog.push({ url, body });
  const resp = nextResponses.length > 0 ? nextResponses[nextResponseIdx++] : nextResponse;
  return {
    ok: resp.status >= 200 && resp.status < 300,
    status: resp.status,
    json: async () => resp.body,
  };
});

beforeEach(() => {
  callLog.length = 0;
  nextResponses = [];
  nextResponseIdx = 0;
  nextResponse = { status: 200, body: { choices: [{ message: { content: 'ok' } }] } };
  env.LLM_BASE_URL = 'http://fake-llm';
  env.LLM_MODEL = 'primary-model';
  env.LLM_FALLBACK_MODEL = 'fallback-model';
  env.LLM_API_KEY = 'test-key';
  env.LLM_TIMEOUT_MS = 1000;
});

describe('chatCompletion hallucination & edge cases', () => {
  it('returns content when primary returns valid text (no fallback needed)', async () => {
    nextResponses = [
      { status: 200, body: { choices: [{ message: { content: 'real hello' } }] } },
    ];
    const out = await chatCompletion([{ role: 'user', content: 'hi' }]);
    expect(out).toBe('real hello');
    expect(callLog.length).toBe(1);
  });

  // NOTE: The router cannot detect "unrelated" content — this test documents the
  // current limitation rather than asserting a behaviour that does not exist.
  it('does NOT detect unrelated content as hallucination (known limitation)', async () => {
    // Primary returns 200 with content that is semantically unrelated but non-empty.
    nextResponses = [
      { status: 200, body: { choices: [{ message: { content: 'the sunset was beautiful' } }] } },
    ];
    const out = await chatCompletion([{ role: 'user', content: 'hi' }]);
    // Code returns whatever the provider returned — no semantic check.
    expect(out).toBe('the sunset was beautiful');
    expect(callLog.length).toBe(1);
    // No fallback triggered because content is non-empty and status is 200.
  });

  it('handles primary returning null content via trim()', async () => {
    nextResponses = [
      { status: 200, body: { choices: [{ message: { content: null } }] } },
      { status: 200, body: { choices: [{ message: { content: 'from fallback' } }] } },
    ];
    const out = await chatCompletion([{ role: 'user', content: 'hi' }]);
    expect(out).toBe('from fallback');
    expect(callLog.length).toBe(2);
  });

  it('user-friendly error when both models fail gracefully', async () => {
    nextResponses = [
      { status: 200, body: { choices: [{ message: { content: '' } }] } },
      { status: 200, body: { choices: [{ message: { content: '' } }] } },
    ];
    await expect(chatCompletion([{ role: 'user', content: 'hi' }])).rejects.toMatchObject({ statusCode: StatusCodes.BAD_GATEWAY });
    expect(callLog.length).toBe(2);
  });
});
