import { chat, agentStatus, parseUpload } from '../agent.service';
import { env } from '../../../config/env';
import { AppError } from '../../../utils/errors';

jest.mock('../llm', () => ({
  isLLMConfigured: jest.fn(),
  chatCompletion: jest.fn(),
}));

jest.mock('../../../lib/prisma', () => ({
  prisma: {
    agentConversation: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

jest.mock('unpdf', () => ({
  extractText: jest.fn(),
}));

import { isLLMConfigured, chatCompletion } from '../llm';
import { prisma } from '../../../lib/prisma';
import { extractText } from 'unpdf';

const mockedIsConfigured = isLLMConfigured as jest.Mock;
const mockedChatCompletion = chatCompletion as jest.Mock;
const mockedPrisma = prisma as unknown as {
  agentConversation: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    deleteMany: jest.Mock;
  };
};
const mockedExtractText = extractText as jest.Mock;

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
    env.LLM_MODEL_PREMIUM = 'premium-model';
    env.LLM_MODEL_REASONING = 'reasoning-model';
    env.LLM_EMBED_MODEL = 'embed-model';
    env.LLM_RERANK_MODEL = 'rerank-model';
    mockedIsConfigured.mockReturnValue(true);
    expect(agentStatus()).toEqual({
      enabled: true,
      provider: 'ollama',
      model: 'qwen',
      models: {
        default: 'qwen',
        premium: 'premium-model',
        reasoning: 'reasoning-model',
        embed: 'embed-model',
        rerank: 'rerank-model',
      },
    });

    mockedIsConfigured.mockReturnValue(false);
    env.LLM_MODEL = undefined;
    expect(agentStatus()).toEqual({
      enabled: false,
      provider: 'ollama',
      model: null,
      models: {
        default: null,
        premium: 'premium-model',
        reasoning: 'reasoning-model',
        embed: 'embed-model',
        rerank: 'rerank-model',
      },
    });
    env.LLM_MODEL = 'qwen';
    env.LLM_MODEL_PREMIUM = undefined;
    env.LLM_MODEL_REASONING = undefined;
    env.LLM_EMBED_MODEL = undefined;
    env.LLM_RERANK_MODEL = undefined;
  });

  it('chat returns the LLM reply and creates a conversation', async () => {
    mockedIsConfigured.mockReturnValue(true);
    mockedChatCompletion.mockResolvedValue('hello');
    mockedPrisma.agentConversation.create.mockResolvedValue({ id: 'c1' });

    const result = await chat('u1', [{ role: 'user', content: 'hi' }]);
    expect(result.reply).toBe('hello');
    expect(result.conversationId).toBe('c1');
    expect(mockedPrisma.agentConversation.create).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        projectId: null,
        title: 'hi',
messages: [
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'hello' },
        ],
      },
    });
    expect(mockedChatCompletion).toHaveBeenCalledTimes(1);
  });

  it('updates an existing conversation when conversationId is provided', async () => {
    mockedIsConfigured.mockReturnValue(true);
    mockedChatCompletion.mockResolvedValue('ok');
    mockedPrisma.agentConversation.findFirst.mockResolvedValue({ id: 'c1' });

    await chat('u1', [{ role: 'user', content: 'hi' }], { conversationId: 'c1', projectId: 'p1' });

    expect(mockedPrisma.agentConversation.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: {
        messages: [
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'ok' },
        ],
        projectId: 'p1',
      },
    });
    expect(mockedPrisma.agentConversation.create).not.toHaveBeenCalled();
  });

  it('prefixes the system prompt and trims history to the last 20 messages', async () => {
    mockedIsConfigured.mockReturnValue(true);
    mockedChatCompletion.mockResolvedValue('ok');
    mockedPrisma.agentConversation.create.mockResolvedValue({ id: 'c1' });

    const many = Array.from({ length: 25 }, (_, i) => ({ role: 'user', content: `m${i}` }));
    await chat('u1', many);

    const messages = mockedChatCompletion.mock.calls[0][0];
    expect(messages).toHaveLength(21); // system + 20 history
    expect(messages[0].role).toBe('system');
    expect(messages[20]).toEqual({ role: 'user', content: 'm24' });
  });

  it('drops empty or oversized message content', async () => {
    mockedIsConfigured.mockReturnValue(true);
    mockedChatCompletion.mockResolvedValue('ok');
    mockedPrisma.agentConversation.create.mockResolvedValue({ id: 'c1' });

    await chat('u1', [
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
    await expect(chat('u1', [{ role: 'user', content: 'hi' }])).rejects.toMatchObject({ statusCode: 503 });
  });

  it('throws 400 for empty history after trimming', async () => {
    mockedIsConfigured.mockReturnValue(true);
    await expect(chat('u1', [{ role: 'user', content: '' }])).rejects.toMatchObject({ statusCode: 400 });
  });

  it('injects the detected language into the system prompt (default priority: Vietnamese)', async () => {
    mockedIsConfigured.mockReturnValue(true);
    mockedChatCompletion.mockResolvedValue('ok');
    mockedPrisma.agentConversation.create.mockResolvedValue({ id: 'c1' });

    await chat('u1', [{ role: 'user', content: 'đang quản lý dự án của tôi' }]);

    const messages = mockedChatCompletion.mock.calls[0][0];
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toMatch(/Reply in Vietnamese/i);
  });

  it('respects an explicit language preference from the client', async () => {
    mockedIsConfigured.mockReturnValue(true);
    mockedChatCompletion.mockResolvedValue('ok');
    mockedPrisma.agentConversation.create.mockResolvedValue({ id: 'c1' });

    await chat('u1', [{ role: 'user', content: 'plan a sprint' }], { language: 'zh' });

    const messages = mockedChatCompletion.mock.calls[0][0];
    expect(messages[0].content).toContain('中文');
  });

  describe('parseUpload', () => {
    it('rejects unsupported extensions', async () => {
      await expect(parseUpload('malware.exe', Buffer.from('x'))).rejects.toBeInstanceOf(AppError);
    });

    it('decodes plain text files and strips the BOM', async () => {
      const result = await parseUpload('notes.txt', Buffer.from('\uFEFFhello world'));
      expect(result).toMatchObject({ fileName: 'notes.txt', text: 'hello world', truncated: false });
    });

    it('extracts text from PDFs via unpdf', async () => {
      mockedExtractText.mockResolvedValue({ text: 'pdf content' });
      const result = await parseUpload('doc.pdf', Buffer.from('pdf-bytes'));
      expect(result.text).toBe('pdf content');
      expect(mockedExtractText).toHaveBeenCalledTimes(1);
    });

    it('rejects empty extracted content', async () => {
      mockedExtractText.mockResolvedValue({ text: '   ' });
      await expect(parseUpload('doc.pdf', Buffer.from('pdf-bytes'))).rejects.toMatchObject({ statusCode: 422 });
    });

    it('truncates very long files', async () => {
      const result = await parseUpload('big.txt', Buffer.from('a'.repeat(30_000)));
      expect(result.truncated).toBe(true);
      expect(result.text).toHaveLength(20_000);
    });
  });
});