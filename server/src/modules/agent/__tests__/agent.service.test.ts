import { chat, agentStatus, parseUpload, sniffImage, MAX_IMAGE_BYTES } from '../agent.service';
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

    const result = await chat('u1', [{ role: 'user', content: 'k8s?' }]);
    expect(result.reply).toBe('hello');
    expect(result.conversationId).toBe('c1');
    expect(mockedPrisma.agentConversation.create).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        projectId: null,
        title: 'k8s?',
        messages: [
          { role: 'user', content: 'k8s?' },
          { role: 'assistant', content: 'hello' },
        ],
        // No language signal in "k8s?" → Vietnamese priority fallback pinned on creation.
        language: 'vi',
      },
    });
    expect(mockedChatCompletion).toHaveBeenCalledTimes(1);
  });

  it('updates an existing conversation when conversationId is provided', async () => {
    mockedIsConfigured.mockReturnValue(true);
    mockedChatCompletion.mockResolvedValue('ok');
    mockedPrisma.agentConversation.findFirst.mockResolvedValue({ id: 'c1', language: null });

    await chat('u1', [{ role: 'user', content: 'k8s?' }], { conversationId: 'c1', projectId: 'p1' });

    expect(mockedPrisma.agentConversation.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: {
        messages: [
          { role: 'user', content: 'k8s?' },
          { role: 'assistant', content: 'ok' },
        ],
        projectId: 'p1',
        // Legacy conversation (language null, no-signal input) gets pinned once to vi.
        language: 'vi',
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
    expect(messages[0].content).toMatch(/RESPONSE LANGUAGE POLICY/);
    expect(messages[0].content).toMatch(/Vietnamese/);
  });

  it('respects an explicit language preference from the client', async () => {
    mockedIsConfigured.mockReturnValue(true);
    mockedChatCompletion.mockResolvedValue('ok');
    mockedPrisma.agentConversation.create.mockResolvedValue({ id: 'c1' });

    await chat('u1', [{ role: 'user', content: 'plan a sprint' }], { language: 'zh' });

    const messages = mockedChatCompletion.mock.calls[0][0];
    expect(messages[0].content).toContain('中文');
  });

  it('returns the resolved language in the response', async () => {
    mockedIsConfigured.mockReturnValue(true);
    mockedChatCompletion.mockResolvedValue('ok');
    mockedPrisma.agentConversation.create.mockResolvedValue({ id: 'c1' });

    const vi = await chat('u1', [{ role: 'user', content: 'đang quản lý dự án của tôi' }]);
    expect(vi.language).toBe('vi');

    const en = await chat('u1', [{ role: 'user', content: 'plan a sprint' }], { language: 'en' });
    expect(en.language).toBe('en');

    const zh = await chat('u1', [{ role: 'user', content: 'plan a sprint' }], { language: 'zh' });
    expect(zh.language).toBe('zh');
  });

  it('resolves language per-turn so an early CJK message does not pin later turns', async () => {
    mockedIsConfigured.mockReturnValue(true);
    mockedChatCompletion.mockResolvedValue('ok');
    mockedPrisma.agentConversation.create.mockResolvedValue({ id: 'c1' });

    // Turn 1 was Chinese, turn 2 switches to English under "auto". Detection must
    // run on the LATEST user message only, so this resolves to Vietnamese (the
    // priority fallback) — NOT Chinese (a whole-history scan would pick up the
    // earlier Chinese message and wrongly force a Chinese reply).
    await chat('u1', [
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '...' },
      { role: 'user', content: 'plan a sprint' },
    ]);

    const messages = mockedChatCompletion.mock.calls[0][0];
    expect(messages[0].role).toBe('system');
    // Detection runs on the LATEST user message only → Vietnamese fallback,
    // NOT Chinese (a whole-history scan would wrongly force a Chinese reply).
    expect(messages[0].content).toMatch(/Vietnamese/);
  });

  it('still detects Chinese when the latest user message is Chinese', async () => {
    mockedIsConfigured.mockReturnValue(true);
    mockedChatCompletion.mockResolvedValue('ok');
    mockedPrisma.agentConversation.findFirst.mockResolvedValue({ id: 'c1', language: null });
    mockedPrisma.agentConversation.create.mockResolvedValue({ id: 'c1' });

    await chat('u1', [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: '...' },
      { role: 'user', content: '你好吗' },
    ]);

    const messages = mockedChatCompletion.mock.calls[0][0];
    expect(messages[0].content).toContain('中文');
  });

  // --- Conversation-preference lifecycle (server-authoritative invariant) ---

  it('does NOT flip an existing "en" conversation because of one Vietnamese message', async () => {
    mockedIsConfigured.mockReturnValue(true);
    mockedChatCompletion.mockResolvedValue('ok');
    mockedPrisma.agentConversation.findFirst.mockResolvedValue({ id: 'c1', language: 'en' });

    const result = await chat('u1', [{ role: 'user', content: 'xin chào bạn nhé' }], {
      conversationId: 'c1',
    });

    expect(result.language).toBe('en');
    const messages = mockedChatCompletion.mock.calls[0][0];
    expect(messages[0].content).toMatch(/English/);
    // Detection must NOT overwrite a real preference.
    const updateData = mockedPrisma.agentConversation.update.mock.calls[0][0].data;
    expect(updateData).not.toHaveProperty('language');
  });

  it('persists an explicit switch en → vi and keeps vi on the next auto turn', async () => {
    mockedIsConfigured.mockReturnValue(true);
    mockedChatCompletion.mockResolvedValue('ok');

    // Turn 1: explicit switch to Vietnamese inside an English conversation.
    mockedPrisma.agentConversation.findFirst.mockResolvedValue({ id: 'c1', language: 'en' });
    await chat('u1', [{ role: 'user', content: 'Từ giờ trả lời bằng tiếng Việt' }], {
      conversationId: 'c1',
      language: 'vi',
    });
    let updateData = mockedPrisma.agentConversation.update.mock.calls[0][0].data;
    expect(updateData.language).toBe('vi');

    // Turn 2: plain auto request — persisted preference must stay authoritative.
    mockedPrisma.agentConversation.update.mockClear();
    mockedChatCompletion.mockClear();
    mockedPrisma.agentConversation.findFirst.mockResolvedValue({ id: 'c1', language: 'vi' });
    const result = await chat('u1', [{ role: 'user', content: 'plan a sprint' }], {
      conversationId: 'c1',
      language: 'auto',
    });

    expect(result.language).toBe('vi');
    const messages = mockedChatCompletion.mock.calls[0][0];
    expect(messages[0].content).toMatch(/Vietnamese/);
    updateData = mockedPrisma.agentConversation.update.mock.calls[0][0].data;
    expect(updateData).not.toHaveProperty('language'); // unchanged → not rewritten
  });

  it('English text inside a user message does NOT override a resolved Vietnamese directive', async () => {
    mockedIsConfigured.mockReturnValue(true);
    mockedChatCompletion.mockResolvedValue('ok');
    mockedPrisma.agentConversation.findFirst.mockResolvedValue({ id: 'c1', language: 'vi' });

    await chat(
      'u1',
      [{ role: 'user', content: 'Please explain how Kubernetes works, answer me in English if you want' }],
      { conversationId: 'c1', language: 'auto' }
    );

    const messages = mockedChatCompletion.mock.calls[0][0];
    expect(messages[0].content).toMatch(/Vietnamese/);
    expect(messages[0].content).not.toMatch(/Resolved response language: English/);
  });

  describe('parseUpload', () => {
    it('rejects unsupported extensions', async () => {
      await expect(parseUpload('malware.exe', Buffer.from('x'))).rejects.toBeInstanceOf(AppError);
    });

    it('decodes plain text files and strips the BOM', async () => {
      const result = await parseUpload('notes.txt', Buffer.from('\uFEFFhello world'));
      expect(result.type).toBe('text');
      if (result.type === 'text') {
        expect(result).toMatchObject({ fileName: 'notes.txt', text: 'hello world', truncated: false });
      }
    });

    it('extracts text from PDFs via unpdf', async () => {
      mockedExtractText.mockResolvedValue({ text: 'pdf content' });
      const result = await parseUpload('doc.pdf', Buffer.from('pdf-bytes'));
      expect(result.type).toBe('text');
      if (result.type === 'text') {
        expect(result.text).toBe('pdf content');
      }
      expect(mockedExtractText).toHaveBeenCalledTimes(1);
    });

    it('rejects empty extracted content', async () => {
      mockedExtractText.mockResolvedValue({ text: '   ' });
      await expect(parseUpload('doc.pdf', Buffer.from('pdf-bytes'))).rejects.toMatchObject({ statusCode: 422 });
    });

    it('truncates very long files', async () => {
      const result = await parseUpload('big.txt', Buffer.from('a'.repeat(30_000)));
      expect(result.type).toBe('text');
      if (result.type === 'text') {
        expect(result.truncated).toBe(true);
        expect(result.text).toHaveLength(20_000);
      }
    });
  });
});


// Magic bytes for a 1x1 PNG (transparent).
const PNG_BYTES = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010806000000157d8c38000000d' +
    '000000049444154789c62000e0000000020001',
  'hex'
);
const PNG_DATA_URL = `data:image/png;base64,${PNG_BYTES.toString('base64')}`;

describe('agent.service images & vision', () => {
  it('sniffImage validates genuine PNG bytes', () => {
    expect(sniffImage('.png', PNG_BYTES)).toBe(true);
  });

  it('sniffImage rejects bytes that do not match the extension', () => {
    expect(sniffImage('.jpg', PNG_BYTES)).toBe(false);
    expect(sniffImage('.png', Buffer.from('not-an-image'))).toBe(false);
  });

  it('parseUpload decodes an image into a vision-ready data URI', async () => {
    const result = await parseUpload('screenshot.png', PNG_BYTES);
    expect(result.type).toBe('image');
    expect(result).toMatchObject({ mime: 'image/png', fileName: 'screenshot.png', size: PNG_BYTES.length });
    const dataUrl = (result as { dataUrl: string }).dataUrl;
    expect(dataUrl).toBe(PNG_DATA_URL);
    // The embedded base64 must round-trip back to the original bytes.
    const b64 = dataUrl.split(',')[1];
    expect(Buffer.from(b64, 'base64')).toEqual(PNG_BYTES);
  });

  it('parseUpload rejects images with wrong magic bytes', async () => {
    await expect(parseUpload('fake.png', Buffer.from('not-an-image'))).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  it('parseUpload rejects oversized images (>2MB)', async () => {
    const pad = Buffer.alloc(MAX_IMAGE_BYTES + 1 - PNG_BYTES.length, 0x20);
    const big = Buffer.concat([PNG_BYTES, pad]);
    await expect(parseUpload('big.png', big)).rejects.toMatchObject({ statusCode: 413 });
  });

  it('chat sends a multimodal (image) content block to the LLM', async () => {
    mockedIsConfigured.mockReturnValue(true);
    mockedChatCompletion.mockResolvedValue('ok');
    mockedPrisma.agentConversation.create.mockResolvedValue({ id: 'c1' });

    await chat('u1', [
      {
        role: 'user',
        content: 'đây là hình ảnh nền tảng nào',
        image: { mime: 'image/png', dataUrl: PNG_DATA_URL },
      },
    ]);

    const messages = mockedChatCompletion.mock.calls[0][0];
    const userMsg = messages[messages.length - 1];
    expect(userMsg.role).toBe('user');
    expect(Array.isArray(userMsg.content)).toBe(true);
    expect(userMsg.content[0]).toMatchObject({ type: 'text', text: 'đây là hình ảnh nền tảng nào' });
    expect(userMsg.content[1]).toMatchObject({
      type: 'image_url',
      image_url: { url: PNG_DATA_URL },
    });

    // The Vietnamese text must still drive language detection -> reply in Vietnamese.
    const system = messages[0];
    expect(system.role).toBe('system');
    expect(system.content).toMatch(/RESPONSE LANGUAGE POLICY/);
    expect(system.content).toMatch(/Vietnamese/);
  });
});
