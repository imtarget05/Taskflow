import { chat, agentStatus } from '../agent.service';
import { env } from '../../../config/env';

jest.mock('../llm', () => ({
  isLLMConfigured: jest.fn(),
  chatCompletion: jest.fn(),
}));

import { isLLMConfigured, chatCompletion } from '../llm';

const mockedIsConfigured = isLLMConfigured as jest.Mock;
const mockedChatCompletion = chatCompletion as jest.Mock;

describe('agent.service', () => {
  const origProvider = env.LLM_PROVIDER;
  const origModel = env.LLM_MODEL;

  beforeEach(() => {
    jest.clearAllMocks();
    env.LLM_PROVIDER = 'ollama';
    env.LLM_MODEL = 'qwen';
  });

  afterEach(() => {
    env.LLM_PROVIDER = origProvider;
    env.LLM_MODEL = origModel;
  });

  it('agentStatus reflects the configured provider/model', () => {
    mockedIsConfigured.mockReturnValue(true);
    expect(agentStatus()).toEqual({ enabled: true, provider: 'ollama', model: 'qwen' });

    mockedIsConfigured.mockReturnValue(false);
    env.LLM_MODEL = undefined;
    expect(agentStatus()).toEqual({ enabled: false, provider: 'ollama', model: null });
    env.LLM_MODEL = 'qwen';
  });

  it('chat returns the LLM reply', async () => {
    mockedIsConfigured.mockReturnValue(true);
    mockedChatCompletion.mockResolvedValue('hello');

    const result = await chat([{ role: 'user', content: 'hi' }]);
    expect(result.reply).toBe('hello');
    expect(mockedChatCompletion).toHaveBeenCalledTimes(1);
  });

  it('prefixes the system prompt and trims history to the last 20 messages', async () => {
    mockedIsConfigured.mockReturnValue(true);
    mockedChatCompletion.mockResolvedValue('ok');

    const many = Array.from({ length: 25 }, (_, i) => ({ role: 'user', content: `m${i}` }));
    await chat(many);

    const messages = mockedChatCompletion.mock.calls[0][0];
    expect(messages).toHaveLength(21); // system + 20 history
    expect(messages[0].role).toBe('system');
    expect(messages[20]).toEqual({ role: 'user', content: 'm24' });
  });

  it('drops empty or oversized message content', async () => {
    mockedIsConfigured.mockReturnValue(true);
    mockedChatCompletion.mockResolvedValue('ok');

    await chat([
      { role: 'user', content: '   ' },
      { role: 'assistant', content: 'a'.repeat(5000) },
      { role: 'user', content: 'valid' },
    ]);

    const messages = mockedChatCompletion.mock.calls[0][0];
    const history = messages.slice(1);
    expect(history).toEqual([{ role: 'assistant', content: 'a'.repeat(4000) }, { role: 'user', content: 'valid' }]);
  });

  it('throws 503 when the LLM is not configured', async () => {
    mockedIsConfigured.mockReturnValue(false);
    await expect(chat([{ role: 'user', content: 'hi' }])).rejects.toMatchObject({ statusCode: 503 });
  });

  it('throws 400 for empty history after trimming', async () => {
    mockedIsConfigured.mockReturnValue(true);
    await expect(chat([{ role: 'user', content: '' }])).rejects.toMatchObject({ statusCode: 400 });
  });
});