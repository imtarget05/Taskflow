import { chat, agentStatus, parseUpload, sniffImage, MAX_IMAGE_BYTES, parseAction } from '../agent.service';
import { env } from '../../../config/env';
import { AppError } from '../../../utils/errors';

jest.mock('../llm', () => ({
  isLLMConfigured: jest.fn(),
  chatCompletion: jest.fn(),
  chatCompletionWithTools: jest.fn(),
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
    projectMember: {
      findFirst: jest.fn(),
    },
    column: {
      findFirst: jest.fn(),
    },
  },
}));

jest.mock('../../project/project.service', () => ({
  createProject: jest.fn(),
}));

jest.mock('../../task/task.service', () => ({
  createTask: jest.fn(),
}));

jest.mock('unpdf', () => ({
  extractText: jest.fn(),
}));

import { isLLMConfigured, chatCompletion, chatCompletionWithTools } from '../llm';
import { prisma } from '../../../lib/prisma';
import { extractText } from 'unpdf';
import { createProject } from '../../project/project.service';
import { createTask } from '../../task/task.service';

const mockedIsConfigured = isLLMConfigured as jest.Mock;
const mockedChatCompletion = chatCompletion as jest.Mock;
const mockedChatCompletionWithTools = chatCompletionWithTools as jest.Mock;
const mockedCreateProject = createProject as jest.Mock;
const mockedCreateTask = createTask as jest.Mock;
const mockedPrisma = prisma as unknown as {
  agentConversation: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    deleteMany: jest.Mock;
  };
  projectMember: { findFirst: jest.Mock };
  column: { findFirst: jest.Mock };
};
const mockedExtractText = extractText as jest.Mock;

describe('agent.service', () => {
  const origProvider = env.LLM_PROVIDER;
  const origModel = env.LLM_MODEL;

  beforeEach(() => {
    jest.clearAllMocks();
    env.LLM_PROVIDER = 'ollama';
    env.LLM_MODEL = 'qwen';
    // Default: the main turn just replies with text and requests no action.
    mockedChatCompletionWithTools.mockResolvedValue({ content: 'ok', toolCalls: [] });
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
    mockedChatCompletionWithTools.mockResolvedValue({ content: 'hello', toolCalls: [] });
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
    expect(mockedChatCompletionWithTools).toHaveBeenCalledTimes(1);
  });

  it('updates an existing conversation when conversationId is provided', async () => {
    mockedIsConfigured.mockReturnValue(true);
    mockedChatCompletionWithTools.mockResolvedValue({ content: 'ok', toolCalls: [] });
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

  it('prefixes the system prompt and trims history to the last 20 messages, summarizing the overflow', async () => {
    mockedIsConfigured.mockReturnValue(true);
    mockedChatCompletion.mockResolvedValue('summary of m0..m4'); // rolling-summary side call
    mockedChatCompletionWithTools.mockResolvedValue({ content: 'ok', toolCalls: [] }); // chat reply
    mockedPrisma.agentConversation.create.mockResolvedValue({ id: 'c1' });

    const many = Array.from({ length: 25 }, (_, i) => ({ role: 'user', content: `m${i}` }));
    await chat('u1', many);

    // Summary side call goes through chatCompletion…
    expect(mockedChatCompletion).toHaveBeenCalledTimes(1);
    expect(mockedChatCompletion.mock.calls[0][0][0].content).toMatch(/compress chat history/i);
    // …and the main turn through chatCompletionWithTools with system + 20 history.
    expect(mockedChatCompletionWithTools).toHaveBeenCalledTimes(1);
    const messages = mockedChatCompletionWithTools.mock.calls[0][0];
    expect(messages).toHaveLength(21); // system + 20 history
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toMatch(/EARLIER CONVERSATION SUMMARY/);
    expect(messages[0].content).toMatch(/summary of m0\.\.m4/);
    expect(messages[20]).toEqual({ role: 'user', content: 'm24' });
    // The regenerated summary is persisted on the conversation row.
    expect(mockedPrisma.agentConversation.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ summary: 'summary of m0..m4' }) })
    );
  });

  it('trims by character budget but always keeps the last two messages verbatim', async () => {
    mockedIsConfigured.mockReturnValue(true);
    mockedChatCompletion.mockResolvedValue('short summary');
    mockedChatCompletionWithTools.mockResolvedValue({ content: 'ok', toolCalls: [] });
    mockedPrisma.agentConversation.create.mockResolvedValue({ id: 'c1' });

    // Each message is under MAX_MESSAGE_LENGTH (4000) but 10 × 3000 chars
    // exceeds the 24k context budget → older ones must be summarized away.
    const many = Array.from({ length: 10 }, () => ({ role: 'user', content: 'a'.repeat(3_000) }));
    await chat('u1', [...many, { role: 'user', content: 'final question' }]);

    expect(mockedChatCompletion).toHaveBeenCalledTimes(1); // summary
    const replyMessages = mockedChatCompletionWithTools.mock.calls[0][0].slice(1);
    expect(replyMessages.length).toBeGreaterThanOrEqual(2);
    expect(replyMessages[replyMessages.length - 1]).toEqual({ role: 'user', content: 'final question' });
    // The verbatim window fits the character budget.
    const windowChars = replyMessages.reduce(
      (n: number, m: { content: string }) => n + m.content.length,
      0
    );
    expect(windowChars).toBeLessThanOrEqual(24_000);
    expect(mockedChatCompletionWithTools.mock.calls[0][0][0].content).toMatch(/EARLIER CONVERSATION SUMMARY/);
  });

  it('folds an existing stored summary into the next rolling summary', async () => {
    mockedIsConfigured.mockReturnValue(true);
    mockedChatCompletion.mockResolvedValue('merged summary');
    mockedChatCompletionWithTools.mockResolvedValue({ content: 'ok', toolCalls: [] });
    mockedPrisma.agentConversation.findFirst.mockResolvedValue({
      id: 'c1',
      language: null,
      summary: 'old summary',
    });
    mockedPrisma.agentConversation.update.mockResolvedValue({});

    const many = Array.from({ length: 25 }, (_, i) => ({ role: 'user', content: `m${i}` }));
    await chat('u1', many, { conversationId: 'c1' });

    // The summarizer receives both the previous summary and the overflow.
    const summaryCall = mockedChatCompletion.mock.calls[0][0];
    expect(summaryCall[1].content).toContain('Previous summary:\nold summary');

    // The merged result replaces the stored summary.
    expect(mockedPrisma.agentConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1' },
        data: expect.objectContaining({ summary: 'merged summary' }),
      })
    );
  });

  it('keeps working when the summarizer fails (fallback truncation)', async () => {
    mockedIsConfigured.mockReturnValue(true);
    mockedChatCompletion.mockRejectedValueOnce(new Error('LLM down'));
    mockedChatCompletionWithTools.mockResolvedValue({ content: 'ok', toolCalls: [] });
    mockedPrisma.agentConversation.findFirst.mockResolvedValue({ id: 'c1', language: null, summary: null });
    mockedPrisma.agentConversation.update.mockResolvedValue({});

    const many = Array.from({ length: 25 }, (_, i) => ({ role: 'user', content: `m${i}` }));
    const result = await chat('u1', many, { conversationId: 'c1' });
    expect(result.reply).toBe('ok');
    // Fallback summary = truncated concatenation of dropped messages.
    expect(mockedPrisma.agentConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ summary: expect.stringMatching(/^user: m0/) }),
      })
    );
  });


  it('drops empty or oversized message content', async () => {
    mockedIsConfigured.mockReturnValue(true);
    mockedPrisma.agentConversation.create.mockResolvedValue({ id: 'c1' });

    await chat('u1', [
      { role: 'user', content: '   ' },
      { role: 'assistant', content: 'a'.repeat(5000) },
      { role: 'user', content: 'valid' },
    ]);

    const messages = mockedChatCompletionWithTools.mock.calls[0][0];
    const history = messages.slice(1);
    expect(history).toEqual([{ role: 'assistant', content: 'a'.repeat(4000) }, { role: 'user', content: 'valid' }]);
  });

  it('persists image attachments as placeholders, never data URIs', async () => {
    mockedIsConfigured.mockReturnValue(true);
    mockedChatCompletion.mockResolvedValue('ok');
    mockedPrisma.agentConversation.create.mockResolvedValue({ id: 'c1' });

    await chat('u1', [
      { role: 'user', content: 'what is this?', image: { mime: 'image/png', dataUrl: PNG_DATA_URL } },
    ]);

    const stored = mockedPrisma.agentConversation.create.mock.calls[0][0].data.messages;
    const serialized = JSON.stringify(stored);
    expect(serialized).not.toContain('data:image');
    expect(serialized).toContain('[image attachment]');
    expect(serialized).toContain('what is this?');
  });

  describe('create actions', () => {
    it('parseAction extracts a validated action from a full reply', () => {
      const reply = `Đã tạo xong!\n[[TASKFLOW_ACTION]]{"action":"create_task","params":{"projectName":"TaskFlow","title":"Onboarding"}}[[/TASKFLOW_ACTION]]`;
      expect(parseAction(reply)).toEqual({
        name: 'create_task',
        params: { projectName: 'TaskFlow', title: 'Onboarding' },
      });
      expect(parseAction('just text, no action')).toBeNull();
      expect(
        parseAction(`[[TASKFLOW_ACTION]]{"action":"delete_everything","params":{}}[[/TASKFLOW_ACTION]]`)
      ).toBeNull();
      expect(parseAction(`[[TASKFLOW_ACTION]]not json[[/TASKFLOW_ACTION]]`)).toBeNull();
    });

    it('chat executes a create_project from a structured tool call', async () => {
      mockedIsConfigured.mockReturnValue(true);
      mockedChatCompletionWithTools.mockResolvedValue({
        content: 'Đã tạo board cho bạn.',
        toolCalls: [
          {
            name: 'create_project',
            arguments: JSON.stringify({ name: 'Dự án phát triển' }),
          },
        ],
      });
      mockedCreateProject.mockResolvedValue({ id: 'prj_1' });
      mockedPrisma.agentConversation.create.mockResolvedValue({ id: 'c1' });

      const result = await chat('u1', [{ role: 'user', content: 'có' }]);

      expect(mockedCreateProject).toHaveBeenCalledWith('u1', { name: 'Dự án phát triển' });
      expect(result.reply).toContain('Đã tạo board "Dự án phát triển"');
      expect(result.reply).toContain('Đã tạo board cho bạn.');
      expect(result.action).toEqual({
        name: 'create_project',
        ok: true,
        summary: '✅ Đã tạo board "Dự án phát triển" (id prj_1).',
      });
    });

    it('falls back to the text-tag protocol when the provider ignores tools', async () => {
      mockedIsConfigured.mockReturnValue(true);
      mockedChatCompletionWithTools.mockResolvedValue({
        content:
          'Đã tạo board cho bạn.\n[[TASKFLOW_ACTION]]{"action":"create_project","params":{"name":"Tag Board"}}[[/TASKFLOW_ACTION]]',
        toolCalls: [],
      });
      mockedCreateProject.mockResolvedValue({ id: 'prj_2' });
      mockedPrisma.agentConversation.create.mockResolvedValue({ id: 'c1' });

      const result = await chat('u1', [{ role: 'user', content: 'có' }]);

      expect(mockedCreateProject).toHaveBeenCalledWith('u1', { name: 'Tag Board' });
      expect(result.reply).toContain('Đã tạo board "Tag Board"');
      expect(result.reply).not.toContain('TASKFLOW_ACTION');
      // The stripped reply is what gets persisted.
      const persisted = mockedPrisma.agentConversation.create.mock.calls[0][0].data.messages;
      expect(JSON.stringify(persisted)).not.toContain('TASKFLOW_ACTION');
    });

    it('returns a not-ok summary when create_project params are invalid', async () => {
      mockedIsConfigured.mockReturnValue(true);
      mockedChatCompletionWithTools.mockResolvedValue({
        content: '',
        toolCalls: [{ name: 'create_project', arguments: JSON.stringify({ name: '  ' }) }],
      });
      mockedPrisma.agentConversation.create.mockResolvedValue({ id: 'c1' });

      const result = await chat('u1', [{ role: 'user', content: 'có' }]);
      expect(result.action?.name).toBe('create_project');
      expect(result.reply).toContain('Không thể tạo');
      expect(mockedCreateProject).not.toHaveBeenCalled();
    });

    it('chat executes create_task in the user project and column', async () => {
      mockedIsConfigured.mockReturnValue(true);
      mockedChatCompletionWithTools.mockResolvedValue({
        content: '',
        toolCalls: [
          {
            name: 'create_task',
            arguments: JSON.stringify({
              projectName: 'TaskFlow',
              title: 'Onboarding',
              priority: 'HIGH',
            }),
          },
        ],
      });
      mockedPrisma.projectMember.findFirst.mockResolvedValue({ project: { id: 'prj_1' } });
      mockedPrisma.column.findFirst.mockResolvedValueOnce({ id: 'col_1', name: 'To Do' });
      mockedCreateTask.mockResolvedValue({ id: 't1' });
      mockedPrisma.agentConversation.create.mockResolvedValue({ id: 'c1' });

      const result = await chat('u1', [{ role: 'user', content: 'có' }]);

      expect(mockedPrisma.column.findFirst).toHaveBeenCalledWith({
        where: { projectId: 'prj_1' },
        orderBy: { position: 'asc' },
      });
      expect(mockedCreateTask).toHaveBeenCalledWith('u1', {
        projectId: 'prj_1',
        columnId: 'col_1',
        title: 'Onboarding',
        priority: 'HIGH',
      });
      expect(result.reply).toContain('Đã tạo task "Onboarding"');
    });

    it('returns not-ok when the project for create_task does not exist', async () => {
      mockedIsConfigured.mockReturnValue(true);
      mockedChatCompletionWithTools.mockResolvedValue({
        content: '',
        toolCalls: [
          { name: 'create_task', arguments: JSON.stringify({ projectName: 'Ghost', title: 'X' }) },
        ],
      });
      mockedPrisma.projectMember.findFirst.mockResolvedValue(null);
      mockedPrisma.agentConversation.create.mockResolvedValue({ id: 'c1' });

      const result = await chat('u1', [{ role: 'user', content: 'có' }]);
      expect(result.reply).toContain('Không tìm thấy board "Ghost"');
      expect(mockedCreateTask).not.toHaveBeenCalled();
    });
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
    mockedPrisma.agentConversation.create.mockResolvedValue({ id: 'c1' });

    await chat('u1', [{ role: 'user', content: 'đang quản lý dự án của tôi' }]);

    const messages = mockedChatCompletionWithTools.mock.calls[0][0];
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toMatch(/RESPONSE LANGUAGE POLICY/);
    expect(messages[0].content).toMatch(/Vietnamese/);
  });

  it('respects an explicit language preference from the client', async () => {
    mockedIsConfigured.mockReturnValue(true);
    mockedPrisma.agentConversation.create.mockResolvedValue({ id: 'c1' });

    await chat('u1', [{ role: 'user', content: 'plan a sprint' }], { language: 'zh' });

    const messages = mockedChatCompletionWithTools.mock.calls[0][0];
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

    const messages = mockedChatCompletionWithTools.mock.calls[0][0];
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

    const messages = mockedChatCompletionWithTools.mock.calls[0][0];
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
    const messages = mockedChatCompletionWithTools.mock.calls[0][0];
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
    const messages = mockedChatCompletionWithTools.mock.calls[0][0];
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

    const messages = mockedChatCompletionWithTools.mock.calls[0][0];
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

    const messages = mockedChatCompletionWithTools.mock.calls[0][0];
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
