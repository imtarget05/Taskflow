import { chat } from '../../src/modules/agent/agent.service';
import { env } from '../../src/config/env';

/**
 * Integration test: top_p (nucleus sampling) được áp dụng end-to-end khi flow
 * agent thật chạy — chat() → chatCompletionWithTools() → HTTP tới provider.
 *
 * Không dùng DB (skipPersist + không conversationId) và không gọi tool thật;
 * chỉ mock `global.fetch` của provider LLM để bắt cái payload gửi đi.
 */
describe('agent top_p — end-to-end qua agent.service.chat', () => {
  const fetchMock = jest.fn();
  const stored = {
    base: env.LLM_BASE_URL,
    model: env.LLM_MODEL,
    topP: env.LLM_TOP_P,
  };

  const okResponse = {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: 'Xin chào! Tôi là trợ lý TaskFlow.' } }] }),
  };

  beforeAll(() => {
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    env.LLM_BASE_URL = stored.base;
    env.LLM_MODEL = stored.model;
    env.LLM_TOP_P = stored.topP;
  });

  beforeEach(() => {
    fetchMock.mockReset();
    env.LLM_BASE_URL = 'http://llm.test/v1';
    env.LLM_MODEL = 'test-model';
  });

  it('gửi top_p = env.LLM_TOP_P tới provider và giữ hệ thống prompt/tools', async () => {
    env.LLM_TOP_P = 0.8;
    fetchMock.mockResolvedValue(okResponse);

    const res = await chat('u1', [{ role: 'user', content: 'Chào bạn' }], { skipPersist: true });

    expect(res.reply).toContain('Xin chào');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://llm.test/v1/chat/completions');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.top_p).toBe(0.8);
    // System prompt có từ buildSystemPrompt + ACTION_GUIDE (tools đính kèm).
    expect(body.messages[0].role).toBe('system');
    expect(body.tools).toBeDefined();
    expect(body.tools.length).toBeGreaterThanOrEqual(2);

    env.LLM_TOP_P = undefined;
  });

  it('không gửi key top_p khi env.LLM_TOP_P chưa set', async () => {
    env.LLM_TOP_P = undefined;
    fetchMock.mockResolvedValue(okResponse);

    await chat('u1', [{ role: 'user', content: 'Chào bạn' }], { skipPersist: true });

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).not.toHaveProperty('top_p');
    expect(body.top_p).toBeUndefined();
  });
});