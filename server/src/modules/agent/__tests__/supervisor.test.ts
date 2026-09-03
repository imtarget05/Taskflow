import { route, execute, ExecutePayload, ExecutedResult } from '../supervisor';

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

jest.mock('../memory.service', () => ({
  buildMemoryContext: jest.fn().mockResolvedValue(''),
  extractMemories: jest.fn().mockResolvedValue([]),
  storeMemories: jest.fn().mockResolvedValue([]),
}));

jest.mock('@/modules/rag/rag.service', () => ({
  retrieve: jest.fn().mockResolvedValue([]),
}));

import { isLLMConfigured, chatCompletionWithTools } from '../llm';
import { prisma } from '../../../lib/prisma';

const mockedIsConfigured = isLLMConfigured as jest.Mock;
const mockedChatCompletionWithTools = chatCompletionWithTools as jest.Mock;
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

describe('supervisor route', () => {
  it('routes supply chain keywords to sc_agentic', () => {
    const result = route('đơn hàng cần phê duyệt');
    expect(result.agent).toBe('sc_agentic');
    expect(result.reason).toContain('SC');
  });

  it('routes ML keywords to ml_agent', () => {
    const result = route('tồn kho dự báo');
    expect(result.agent).toBe('ml_agent');
    expect(result.reason).toContain('ML');
  });

  it('defaults to chat for general questions', () => {
    const result = route('how to manage my project tasks');
    expect(result.agent).toBe('chat');
    expect(result.reason).toContain('Mặc định');
  });

  it('detects Vietnamese SC keywords', () => {
    const result = route('xếp hàng và giao hàng');
    expect(result.agent).toBe('sc_agentic');
  });

  it('detects Vietnamese ML keywords', () => {
    const result = route('tồn kho dự báo');
    expect(result.agent).toBe('ml_agent');
  });

  it('is case-insensitive', () => {
    const result = route('ĐƠN HÀNG phê duyệt');
    expect(result.agent).toBe('sc_agentic');
  });

  it('trims whitespace before matching', () => {
    const result = route('  order number 123  ');
    expect(result.agent).toBe('sc_agentic');
  });

  it('returns chat for empty string', () => {
    const result = route('');
    expect(result.agent).toBe('chat');
  });
});

describe('supervisor execute', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedIsConfigured.mockReturnValue(true);
    mockedChatCompletionWithTools.mockResolvedValue({ content: 'ok', toolCalls: [] });
    mockedPrisma.agentConversation.create.mockResolvedValue({ id: 'c1' });
    mockedPrisma.agentConversation.findFirst.mockResolvedValue({ id: 'c1', language: null, summary: null });
    mockedPrisma.agentConversation.update.mockResolvedValue({});
    mockedPrisma.projectMember.findFirst.mockResolvedValue({ project: { id: 'prj_1' } });
    mockedPrisma.column.findFirst.mockResolvedValue({ id: 'col_1', name: 'To Do' });
  });

  it('returns the routed agent and reason', async () => {
    const result: ExecutedResult = await execute('sc_agentic', 'u1', { text: 'đơn hàng', projectId: 'p1' });
    expect(result.agent).toBe('sc_agentic');
    expect(result.reason).toBe('SC agentic processed');
  });

  it('returns chat agent correctly', async () => {
    const result = await execute('chat', 'u2', { text: 'hello' });
    expect(result.agent).toBe('chat');
  });

  it('returns ml_agent correctly', async () => {
    const result = await execute('ml_agent', 'u3', { text: 'eoq' });
    expect(result.agent).toBe('ml_agent');
  });

  it('accepts payload with text and projectId', async () => {
    const payload: ExecutePayload = { text: 'test', projectId: 'p1' };
    const result = await execute('chat', 'u1', payload);
    expect(result.agent).toBe('chat');
  });
});