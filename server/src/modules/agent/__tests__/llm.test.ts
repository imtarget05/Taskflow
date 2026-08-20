import { chatCompletion, isLLMConfigured } from '../llm';
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