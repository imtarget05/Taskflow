import { chatCompletion, embed, isLLMConfigured, modelForTier, rerank, routeModel } from '../llm';
import { env } from '../../../config/env';
import { AppError } from '../../../utils/errors';

describe('llm chatCompletion (OpenAI-compatible)', () => {
  const original = {
    base: env.LLM_BASE_URL,
    model: env.LLM_MODEL,
    key: env.LLM_API_KEY,
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
  });

  beforeEach(() => {
    fetchMock.mockReset();
    env.LLM_BASE_URL = 'http://llm.test/v1';
    env.LLM_MODEL = 'test-model';
    env.LLM_API_KEY = 'secret';
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
    expect(routeModel('Lương tối thiểu vùng hiện tại là bao nhiêu?')).toBe('default');
  });

  it('escalates long legal questions to premium', () => {
    const q =
      'Khi doanh nghiệp chậm trả lương, người lao động có quyền yêu cầu bồi thường theo điều khoản nào ' +
      'của Bộ luật Lao động và hợp đồng lao động bị chấm dứt thì trách nhiệm của công ty gồm những gì?';
    expect(routeModel(q)).toBe('premium');
  });

  it('escalates very long analytical questions to the reasoning tier', () => {
    const q =
      `Hãy phân tích so sánh và đối chiếu các quy định về bồi thường thiệt hại trong hợp đồng dân sự, ` +
      `trường hợp ngoại lệ khi bất khả kháng xảy ra, hậu quả pháp lý khi một bên vi phạm nghĩa vụ, ` +
      `điều kiện áp dụng các biện pháp khẩn cấp tạm thời trong giải quyết tranh chấp tại tòa án. `;
    expect(routeModel(q.repeat(3))).toBe('reasoning');
  });
});