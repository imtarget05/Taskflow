/**
 * Tests for LLM fallback behaviour: when the primary provider returns 200 but
 * with no usable content (empty / malformed envelope), the router must
 * surface that as fallback-eligible and try the secondary model instead of
 * bubbling a 502 to the user.
 */
import { StatusCodes } from 'http-status-codes';

import { chatCompletion, chatCompletionWithTools } from '../llm';
import { env } from '../../../config/env';

const callLog: Array<{ url: string; body: any }> = [];
let nextResponse: { status: number; body: any } = { status: 200, body: { choices: [{ message: { content: 'ok' } }] } };
let nextResponses: Array<{ status: number; body: any }> = [];
let nextResponseIdx = 0;

(global as any).fetch = jest.fn(async (url: string, init: any) => {
  let body: any = {};
  try { body = init?.body ? JSON.parse(init.body) : {}; } catch { body = {}; }
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

describe('chatCompletion fallback — empty 200 must trigger fallback', () => {
  it('triggers fallback when primary returns 200 with no content', async () => {
    // Primary returns 200 but no content; fallback returns 200 with content.
    nextResponses = [
      { status: 200, body: { choices: [{ message: { content: null } }] } },
      { status: 200, body: { choices: [{ message: { content: 'fallback hello' } }] } },
    ];
    const out = await chatCompletion([{ role: 'user', content: 'hi' }]);
    expect(out).toBe('fallback hello');
    expect(callLog.length).toBe(2);
    // Primary call and fallback call must hit different models.
    expect(callLog[0].body.model).not.toBe(callLog[1].body.model);
  });

  it('triggers fallback when primary envelope is malformed (no choices key)', async () => {
    nextResponses = [
      { status: 200, body: { result: { choices: [] } } },
      { status: 200, body: { choices: [{ message: { content: 'from fallback' } }] } },
    ];
    const out = await chatCompletion([{ role: 'user', content: 'hi' }]);
    expect(out).toBe('from fallback');
    expect(callLog.length).toBe(2);
  });

  it('does NOT trigger fallback for 4xx client errors (400)', async () => {
    nextResponses = [
      { status: 400, body: { error: 'bad request' } },
      { status: 200, body: { choices: [{ message: { content: 'should not be called' } }] } },
    ];
    await expect(chatCompletion([{ role: 'user', content: 'hi' }])).rejects.toMatchObject({ statusCode: StatusCodes.BAD_GATEWAY });
    // Only 1 call — fallback must be skipped for 400.
    expect(callLog.length).toBe(1);
  });

  it('throws user-friendly error when both primary and fallback return empty', async () => {
    nextResponses = [
      { status: 200, body: { choices: [{ message: { content: '' } }] } },
      { status: 200, body: { choices: [{ message: { content: '' } }] } },
    ];
    await expect(chatCompletion([{ role: 'user', content: 'hi' }])).rejects.toMatchObject({ statusCode: StatusCodes.BAD_GATEWAY });
    expect(callLog.length).toBe(2);
  });

  it('throws 503 with safe message when primary hits 429 rate limit', async () => {
    nextResponses = [
      { status: 429, body: { error: 'rate limited' } },
      { status: 200, body: { choices: [{ message: { content: 'from fallback' } }] } },
    ];
    const out = await chatCompletion([{ role: 'user', content: 'hi' }]);
    // 429 should be fallback-eligible and trigger fallback successfully.
    expect(out).toBe('from fallback');
    expect(callLog.length).toBe(2);
  });
});

describe('chatCompletionWithTools fallback — same rules apply', () => {
  it('does NOT fall back for 4xx (preserves tool-calling semantics)', async () => {
    nextResponses = [
      { status: 400, body: { error: 'bad tool definition' } },
      { status: 200, body: { choices: [{ message: { tool_calls: [] } }] } },
    ];
    await expect(
      chatCompletionWithTools(
        [{ role: 'user', content: 'do thing' }],
        [
          {
            type: 'function',
            function: { name: 'noop', description: 'noop', parameters: {} },
          },
        ]
      )
    ).rejects.toMatchObject({ statusCode: StatusCodes.BAD_GATEWAY });
    expect(callLog.length).toBe(1);
  });

  it('falls back on 503 and surfaces tool_calls from fallback', async () => {
    nextResponses = [
      { status: 503, body: { error: 'unavailable' } },
      {
        status: 200,
        body: {
          choices: [
            {
              message: {
                tool_calls: [
                  { function: { name: 'create_task', arguments: '{"id":"t1"}' } },
                ],
              },
            },
          ],
        },
      },
    ];
    const out = await chatCompletionWithTools(
      [{ role: 'user', content: 'make a task' }],
      [
        {
          type: 'function',
          function: { name: 'create_task', description: 'create', parameters: {} },
        },
      ]
    );
    expect(out.toolCalls.length).toBe(1);
    expect(out.toolCalls[0].name).toBe('create_task');
    expect(callLog.length).toBe(2);
  });
});
