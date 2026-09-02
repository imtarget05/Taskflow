import { chatCompletion, chatCompletionWithTools, embed, isLLMConfigured, modelForTier, rerank, routeModel } from '../llm';
import { env } from '../../../config/env';
import { AppError } from '../../../utils/errors';

describe('llm chatCompletion (OpenAI-compatible)', () => {
  const original = {
    base: env.LLM_BASE_URL,
    model: env.LLM_MODEL,
    key: env.LLM_API_KEY,
    fallback: env.LLM_FALLBACK_MODEL,
    topP: env.LLM_TOP_P,
  };
  const fetchMock = jest.fn();

  beforeAll(() => {
    env.LLM_BASE_URL = 'http://llm.test/v1';
    env.LLM_MODEL = 'test-model';
    env.LLM_API_KEY = 'secret';
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    env.LLM_BASE_URL = original.base;
    env.LLM_MODEL = original.model;
    env.LLM_API_KEY = original.key;
    env.LLM_FALLBACK_MODEL = original.fallback;
    env.LLM_TOP_P = original.topP;
  });

  beforeEach(() => {
    fetchMock.mockReset();
    env.LLM_BASE_URL = 'http://llm.test/v1';
    env.LLM_MODEL = 'test-model';
    env.LLM_API_KEY = 'secret';
    env.LLM_FALLBACK_MODEL = undefined;
    env.LLM_TOP_P = undefined;
  });

  it('reports configured state', () => {
    expect(isLLMConfigured()).toBe(true);
    env.LLM_MODEL = undefined;
    expect(isLLMConfigured()).toBe(false);
    env.LLM_MODEL = 'test-model';
  });

  it('returns content from a successful completion and sends the right payload', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'hello' } }] }),
    });

    const reply = await chatCompletion([{ role: 'user', content: 'hi' }], { temperature: 0.2 });

    expect(reply).toBe('hello');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://llm.test/v1/chat/completions');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe('test-model');
    expect(body.temperature).toBe(0.2);
    expect((init as RequestInit).headers).toMatchObject({ authorization: 'Bearer secret' });
  });

  it('honors an explicit model override', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    });

    await chatCompletion([{ role: 'user', content: 'x' }], { model: 'premium-model' });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe('premium-model');
  });

  it('sends top_p when provided and omits it when unset', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'with top_p' } }] }),
    });

    await chatCompletion([{ role: 'user', content: 'x' }], { topP: 0.9 });
    const bodyWith = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(bodyWith.top_p).toBe(0.9);

    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'without top_p' } }] }),
    });
    await chatCompletion([{ role: 'user', content: 'x' }]);
    const bodyWithout = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(bodyWithout).not.toHaveProperty('top_p');
  });

  it('falls back to env LLM_TOP_P when no per-call topP is given', async () => {
    env.LLM_TOP_P = 0.8;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'env top_p' } }] }),
    });

    await chatCompletion([{ role: 'user', content: 'x' }]);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.top_p).toBe(0.8);

    env.LLM_TOP_P = undefined;
  });

  it('retries on retryable status codes then succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
      });

    const reply = await chatCompletion([{ role: 'user', content: 'x' }]);
    expect(reply).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('retries 429 twice then succeeds on the third attempt', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
      });

    const reply = await chatCompletion([{ role: 'user', content: 'x' }]);
    expect(reply).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('maps exhausted 429 to a 503 AppError with a safe message and no secret leakage', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429 });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(chatCompletion([{ role: 'user', content: 'x' }])).rejects.toMatchObject({
      statusCode: 503,
      message: 'AI service is temporarily unavailable. Please try again shortly.',
    });
    expect(fetchMock).toHaveBeenCalledTimes(3); // bounded: initial + 2 retries

    // No credentials / request bodies in logs.
    for (const call of warnSpy.mock.calls) {
      expect(String(call.join(' '))).not.toContain('secret');
    }
    warnSpy.mockRestore();
  });



  it('handles the Cloudflare Workers AI response envelope (result.choices)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ result: { choices: [{ message: { content: 'from cloudflare' } }] } }),
    });

    const reply = await chatCompletion([{ role: 'user', content: 'hi' }]);
    expect(reply).toBe('from cloudflare');
  });

  it('throws for a non-retryable status', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400 });
    await expect(chatCompletion([{ role: 'user', content: 'x' }])).rejects.toBeInstanceOf(AppError);
  });

  describe('fallback model', () => {
    it('does NOT call fallback when primary succeeds', async () => {
      env.LLM_FALLBACK_MODEL = 'fallback-8b';
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'primary-ok' } }] }),
      });

      const reply = await chatCompletion([{ role: 'user', content: 'x' }]);
      expect(reply).toBe('primary-ok');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, init] = fetchMock.mock.calls[0];
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.model).toBe('test-model');
    });

    it('calls fallback once when primary 429 is exhausted and returns success', async () => {
      env.LLM_FALLBACK_MODEL = 'fallback-8b';
      fetchMock
        // primary: 429 x3 (bounded retries exhausted)
        .mockResolvedValueOnce({ ok: false, status: 429 })
        .mockResolvedValueOnce({ ok: false, status: 429 })
        .mockResolvedValueOnce({ ok: false, status: 429 })
        // fallback: success on first call
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: 'fallback-ok' } }] }),
        });

      const reply = await chatCompletion([{ role: 'user', content: 'x' }]);
      expect(reply).toBe('fallback-ok');
      // 3 primary retries + 1 fallback attempt
      expect(fetchMock).toHaveBeenCalledTimes(4);
      const last = fetchMock.mock.calls[3];
      const body = JSON.parse((last[1] as RequestInit).body as string);
      expect(body.model).toBe('fallback-8b');
    });

    it('does NOT fallback when no fallback model configured (keeps 503 behavior)', async () => {
      env.LLM_FALLBACK_MODEL = undefined;
      fetchMock.mockResolvedValue({ ok: false, status: 429 });

      await expect(chatCompletion([{ role: 'user', content: 'x' }])).rejects.toMatchObject({
        statusCode: 503,
      });
      expect(fetchMock).toHaveBeenCalledTimes(3); // bounded, no extra fallback call
    });

    it('does NOT fallback on client errors (400)', async () => {
      env.LLM_FALLBACK_MODEL = 'fallback-8b';
      fetchMock.mockResolvedValue({ ok: false, status: 400 });

      await expect(chatCompletion([{ role: 'user', content: 'x' }])).rejects.toBeInstanceOf(AppError);
      expect(fetchMock).toHaveBeenCalledTimes(1); // no retry, no fallback
    });

    it.each([401, 403])('does NOT fallback on auth failure (HTTP %i)', async (status) => {
      env.LLM_FALLBACK_MODEL = 'fallback-8b';
      fetchMock.mockResolvedValue({ ok: false, status });

      await expect(chatCompletion([{ role: 'user', content: 'x' }])).rejects.toMatchObject({
        statusCode: 502,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1); // no retry, no fallback
    });

    it('throws safe 503 when fallback also fails with 429', async () => {
      env.LLM_FALLBACK_MODEL = 'fallback-8b';
      fetchMock.mockResolvedValue({ ok: false, status: 429 });

      await expect(chatCompletion([{ role: 'user', content: 'x' }])).rejects.toMatchObject({
        statusCode: 503,
        message: 'AI service is temporarily unavailable. Please try again shortly.',
      });
      expect(fetchMock).toHaveBeenCalledTimes(6); // 3 primary + 3 fallback retries
    });

    it('does not leak credentials in fallback logs', async () => {
      env.LLM_FALLBACK_MODEL = 'fallback-8b';
      fetchMock.mockResolvedValue({ ok: false, status: 429 });
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await chatCompletion([{ role: 'user', content: 'x' }]).catch(() => {});

      for (const spy of [warnSpy, errSpy]) {
        for (const call of spy.mock.calls) {
          expect(String(call.join(' '))).not.toContain('secret');
        }
      }
      warnSpy.mockRestore();
      errSpy.mockRestore();
    });

    it('fallback receives the same messages (language directive preserved)', async () => {
      env.LLM_FALLBACK_MODEL = 'fallback-8b';
      fetchMock
        .mockResolvedValueOnce({ ok: false, status: 429 })
        .mockResolvedValueOnce({ ok: false, status: 429 })
        .mockResolvedValueOnce({ ok: false, status: 429 })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: 'fb' } }] }),
        });

      await chatCompletion([
        { role: 'system', content: 'Reply in Vietnamese.' },
        { role: 'user', content: 'Xin chào' },
      ]);

      expect(fetchMock).toHaveBeenCalledTimes(4);
      const fbBody = JSON.parse((fetchMock.mock.calls[3][1] as RequestInit).body as string);
      expect(fbBody.messages).toEqual([
        { role: 'system', content: 'Reply in Vietnamese.' },
        { role: 'user', content: 'Xin chào' },
      ]);
    });
  });

  it('throws when the response has no content', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ choices: [] }) });
    await expect(chatCompletion([{ role: 'user', content: 'x' }])).rejects.toBeInstanceOf(AppError);
  });

  it('throws when not configured', async () => {
    env.LLM_BASE_URL = undefined;
    env.LLM_MODEL = undefined;
    await expect(chatCompletion([{ role: 'user', content: 'x' }])).rejects.toThrow(/not configured/);
  });
});

describe('llm chatCompletionWithTools (function calling)', () => {
  const original = {
    base: env.LLM_BASE_URL,
    model: env.LLM_MODEL,
    key: env.LLM_API_KEY,
    fallback: env.LLM_FALLBACK_MODEL,
    topP: env.LLM_TOP_P,
  };
  const fetchMock = jest.fn();

  beforeAll(() => {
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    env.LLM_BASE_URL = original.base;
    env.LLM_MODEL = original.model;
    env.LLM_API_KEY = original.key;
    env.LLM_FALLBACK_MODEL = original.fallback;
    env.LLM_TOP_P = original.topP;
  });

  beforeEach(() => {
    fetchMock.mockReset();
    env.LLM_BASE_URL = 'http://llm.test/v1';
    env.LLM_MODEL = 'tool-model';
    env.LLM_API_KEY = 'secret';
    env.LLM_FALLBACK_MODEL = undefined;
    env.LLM_TOP_P = undefined;
  });

  const TOOLS = [
    {
      type: 'function' as const,
      function: {
        name: 'create_project',
        description: 'Create a project',
        parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
      },
    },
  ];

  it('sends the tools array and parses tool_calls from the choices envelope', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: { content: null, tool_calls: [{ function: { name: 'create_project', arguments: '{"name":"Marketing"}' } }] },
            finish_reason: 'tool_calls',
          },
        ],
      }),
    });

    const out = await chatCompletionWithTools([{ role: 'user', content: 'tao board Marketing' }], TOOLS);

    expect(out.toolCalls).toEqual([{ name: 'create_project', arguments: '{"name":"Marketing"}' }]);
    expect(out.content).toBe('');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://llm.test/v1/chat/completions');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe('tool-model');
    expect(body.tools).toEqual(TOOLS);
    expect(body.messages).toEqual([{ role: 'user', content: 'tao board Marketing' }]);
  });

  it('sends top_p alongside the tools when provided', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: '', tool_calls: [] } }] }),
    });

    const out = await chatCompletionWithTools([{ role: 'user', content: 'x' }], TOOLS, { topP: 0.85 });
    expect(out.toolCalls).toEqual([]);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.top_p).toBe(0.85);
    expect(body.tools).toEqual(TOOLS);
  });

  it('parses tool_calls from the Cloudflare result.choices envelope', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        result: {
          choices: [
            { message: { content: '', tool_calls: [{ function: { name: 'create_task', arguments: '{"projectName":"QA","title":"Fix"}' } }] } },
          ],
        },
      }),
    });

    const out = await chatCompletionWithTools([{ role: 'user', content: 'x' }], TOOLS);
    expect(out.toolCalls).toEqual([{ name: 'create_task', arguments: '{"projectName":"QA","title":"Fix"}' }]);
  });

  it('returns empty toolCalls and text content when the model replies without tools', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'Bạn muốn tạo board gì?' } }] }),
    });

    const out = await chatCompletionWithTools([{ role: 'user', content: 'chào' }], TOOLS);
    expect(out.content).toBe('Bạn muốn tạo board gì?');
    expect(out.toolCalls).toEqual([]);
  });

  it('falls back to the fallback model on exhausted 429 and keeps its tool_calls', async () => {
    env.LLM_FALLBACK_MODEL = 'fallback-tool-model';
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: null, tool_calls: [{ function: { name: 'create_project', arguments: '{"name":"FB"}' } }] } }],
        }),
      });

    const out = await chatCompletionWithTools([{ role: 'user', content: 'x' }], TOOLS);

    expect(fetchMock).toHaveBeenCalledTimes(4); // 3 primary retries + 1 fallback
    const fbBody = JSON.parse((fetchMock.mock.calls[3][1] as RequestInit).body as string);
    expect(fbBody.model).toBe('fallback-tool-model');
    // Fallback receives the same tools + messages.
    expect(fbBody.tools).toEqual(TOOLS);
    expect(out.toolCalls).toEqual([{ name: 'create_project', arguments: '{"name":"FB"}' }]);
  });

  it('throws safe 503 when both models exhaust 429', async () => {
    env.LLM_FALLBACK_MODEL = 'fallback-tool-model';
    fetchMock.mockResolvedValue({ ok: false, status: 429 });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(chatCompletionWithTools([{ role: 'user', content: 'x' }], TOOLS)).rejects.toMatchObject({
      statusCode: 503,
    });
    expect(fetchMock).toHaveBeenCalledTimes(6); // 3 primary + 3 fallback

    for (const spy of [warnSpy, errSpy]) {
      for (const call of spy.mock.calls) {
        expect(String(call.join(' '))).not.toContain('secret');
      }
    }
    warnSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('does NOT fall back on client errors (400)', async () => {
    env.LLM_FALLBACK_MODEL = 'fallback-tool-model';
    fetchMock.mockResolvedValue({ ok: false, status: 400 });

    await expect(chatCompletionWithTools([{ role: 'user', content: 'x' }], TOOLS)).rejects.toMatchObject({
      statusCode: 502,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('llm embed', () => {
  const fetchMock = jest.fn();

  beforeAll(() => {
    env.LLM_BASE_URL = 'http://llm.test/v1';
    env.LLM_MODEL = 'test-model';
    env.LLM_EMBED_MODEL = 'embed-model';
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    env.LLM_EMBED_MODEL = undefined;
  });

  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('returns vectors for each input and sends the right payload', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        result: { data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3, 0.4] }] },
      }),
    });

    const vectors = await embed(['a', 'b']);

    expect(vectors).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://llm.test/v1/embeddings');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe('embed-model');
    expect(body.text).toEqual(['a', 'b']);
  });

  it('throws when no embeddings are returned', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ result: { data: [] } }) });
    await expect(embed(['a'])).rejects.toBeInstanceOf(AppError);
  });
});

describe('llm rerank', () => {
  const fetchMock = jest.fn();

  beforeAll(() => {
    env.LLM_BASE_URL = 'http://llm.test/v1';
    env.LLM_MODEL = 'test-model';
    env.LLM_RERANK_MODEL = 'rerank-model';
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    env.LLM_RERANK_MODEL = undefined;
  });

  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('returns documents sorted by relevance score', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        result: [
          { index: 0, relevance_score: 0.2 },
          { index: 1, relevance_score: 0.9 },
          { index: 2, relevance_score: 0.5 },
        ],
      }),
    });

    const scores = await rerank('q', ['a', 'b', 'c']);

    expect(scores.map((s) => s.index)).toEqual([1, 2, 0]);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe('rerank-model');
  });

  it('returns an empty list for no documents without calling the API', async () => {
    const scores = await rerank('q', []);
    expect(scores).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('llm router', () => {
  const original = {
    model: env.LLM_MODEL,
    premium: env.LLM_MODEL_PREMIUM,
    reasoning: env.LLM_MODEL_REASONING,
  };

  beforeEach(() => {
    env.LLM_MODEL = 'default-model';
    env.LLM_MODEL_PREMIUM = 'premium-model';
    env.LLM_MODEL_REASONING = 'reasoning-model';
  });

  afterAll(() => {
    env.LLM_MODEL = original.model;
    env.LLM_MODEL_PREMIUM = original.premium;
    env.LLM_MODEL_REASONING = original.reasoning;
  });

  it('maps tiers to configured models with fallback', () => {
    expect(modelForTier('default')).toBe('default-model');
    expect(modelForTier('premium')).toBe('premium-model');
    expect(modelForTier('reasoning')).toBe('reasoning-model');

    env.LLM_MODEL_PREMIUM = undefined;
    expect(modelForTier('premium')).toBe('default-model');
    env.LLM_MODEL_PREMIUM = 'premium-model';
  });

  it('routes short questions to the cheap default tier', () => {
    expect(routeModel('Deadline của task này là khi nào?')).toBe('default');
  });

  it('escalates long multi-constraint planning questions to premium', () => {
    const q =
      'Team đang quá tải sprint này, cần phân bổ lại workload giữa các thành viên ' +
      'xét theo skill kỹ năng và dependency phụ thuộc giữa các task, milestone nào đang gấp cần ưu tiên hoàn thành trước ' +
      'để tránh trễ deadline và đảm bảo nguồn lực không bị chồng chéo giữa hai dự án đang chạy song song?';
    expect(routeModel(q)).toBe('premium');
  });

  it('escalates very long analytical questions to the reasoning tier', () => {
    const q =
      `Hãy phân tích so sánh và đối chiếu các phương án phân bổ nguồn lực khi dự án bị trễ deadline, ` +
      `trường hợp ngoại lệ khi thành viên chủ chốt nghỉ đột xuất xảy ra, rủi ro khi một bên thay đổi scope, ` +
      `điều kiện áp dụng các biện pháp khẩn cấp trong xung đột ưu tiên giữa các sprint. `;
    expect(routeModel(q.repeat(3))).toBe('reasoning');
  });
});