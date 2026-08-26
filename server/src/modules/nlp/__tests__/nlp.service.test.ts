import { analyseText, findDuplicateIndex, keywordFallback } from '../nlp.service';
import { env } from '../../../config/env';

jest.mock('../../../lib/prisma', () => ({
  prisma: {
    ticketAnalysis: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

jest.mock('../../agent/llm', () => ({
  isLLMConfigured: jest.fn(),
  chatCompletion: jest.fn(),
  embed: jest.fn(),
}));

jest.mock('../../agent/language', () => ({
  resolveLanguage: jest.fn(() => 'vi'),
}));

import { prisma } from '../../../lib/prisma';
import { isLLMConfigured, chatCompletion, embed } from '../../agent/llm';

const mockedConfigured = isLLMConfigured as jest.Mock;
const mockedChat = chatCompletion as jest.Mock;
const mockedEmbed = embed as jest.Mock;
const mockedCreate = prisma.ticketAnalysis.create as jest.Mock;
const mockedFindFirst = prisma.ticketAnalysis.findFirst as jest.Mock;

const validClassification = {
  category: 'đăng nhập / tài khoản',
  categoryConfidence: 0.91,
  priority: 'URGENT',
  priorityConfidence: 0.87,
  sentiment: 'negative',
  urgency: true,
  keywords: ['mật khẩu', 'đăng nhập'],
};

describe('nlp.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    env.LLM_BASE_URL = 'http://llm.test/v1';
    env.LLM_MODEL = 'qwen';
    mockedConfigured.mockReturnValue(true);
    mockedChat.mockResolvedValue(JSON.stringify(validClassification));
    mockedCreate.mockResolvedValue({
      id: 'a1',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
  });

  it('classifies text and persists the result', async () => {
    const result = await analyseText('Tôi không đăng nhập được, xử lý gấp', {
      userId: 'u1',
    });

    expect(result.category).toBe('đăng nhập / tài khoản');
    expect(result.priority).toBe('URGENT');
    expect(result.sentiment).toBe('negative');
    expect(result.urgency).toBe(true);
    expect(result.language).toBe('vi');
    expect(mockedCreate).toHaveBeenCalledTimes(1);
    const data = mockedCreate.mock.calls[0][0].data;
    expect(data.userId).toBe('u1');
    expect(data.category).toBe('đăng nhập / tài khoản');
    expect(data.keywords).toEqual(['mật khẩu', 'đăng nhập']);
  });

  it('falls back to a keyword heuristic when LLM parsing fails', async () => {
    mockedChat.mockResolvedValue('sorry, could not parse');

    const result = await analyseText('Tôi bị trừ tiền nhưng đơn hàng chưa tạo, xử lý gấp', {
      userId: 'u1',
    });

    expect(result.category).toBe('thanh toán / hoàn tiền');
    expect(result.urgency).toBe(true);
    expect(result.priority).toBe('URGENT');
  });

  it('throws 503 when the LLM is not configured', async () => {
    mockedConfigured.mockReturnValue(false);
    await expect(
      analyseText('test', { userId: 'u1' })
    ).rejects.toMatchObject({ statusCode: 503 });
  });

  it('throws 400 for empty text', async () => {
    await expect(analyseText('   ', { userId: 'u1' })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('detects a semantic duplicate when embeddings are similar', async () => {
    mockedEmbed.mockResolvedValue([[1, 0, 0], [0.99, 0.01, 0], [0, 0, 1]]);
    mockedFindFirst.mockResolvedValue({ id: 'prior1' });

    const result = await analyseText('Tôi không đăng nhập được', {
      userId: 'u1',
      candidates: ['Tôi không thể đăng nhập tài khoản', 'Cảm ơn bạn'],
      duplicateThreshold: 0.85,
    });

    expect(result.duplicateOf).toBe('prior1');
    expect(result.duplicateScore).not.toBeNull();
  });

  it('findDuplicateIndex returns null below threshold', async () => {
    mockedEmbed.mockResolvedValue([[1, 0], [0, 1]]);
    const dup = await findDuplicateIndex('a', ['b'], 0.9);
    expect(dup).toBeNull();
  });

  it('keywordFallback maps auth + urgency', () => {
    const c = keywordFallback('Tôi không đăng nhập được vào tài khoản, gấp lắm');
    expect(c.category).toBe('đăng nhập / tài khoản');
    expect(c.priority).toBe('URGENT');
    expect(c.urgency).toBe(true);
  });
});
