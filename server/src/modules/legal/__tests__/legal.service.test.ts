import { searchLegal, legalStatus, DISCLAIMER } from '../legal.service';
import { env } from '../../../config/env';

jest.mock('../../../lib/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn(),
    legalCache: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    legalDocument: { count: jest.fn() },
    legalChunk: { count: jest.fn() },
    aIUsage: {
      create: jest.fn(),
      aggregate: jest.fn(),
    },
  },
}));

jest.mock('../../../modules/agent/llm', () => ({
  embed: jest.fn(),
  rerank: jest.fn(),
  chatCompletion: jest.fn(),
  routeModel: jest.fn(() => 'default'),
  modelForTier: jest.fn(() => 'default-model'),
}));

import { prisma } from '../../../lib/prisma';
import { embed, rerank, chatCompletion, routeModel, modelForTier } from '../../../modules/agent/llm';

const mockedPrisma = prisma as unknown as {
  $queryRaw: jest.Mock;
  legalCache: {
    findUnique: jest.Mock;
    upsert: jest.Mock;
  };
  legalDocument: { count: jest.Mock };
  legalChunk: { count: jest.Mock };
  aIUsage: { create: jest.Mock; aggregate: jest.Mock };
};

const mockedEmbed = embed as jest.Mock;
const mockedRerank = rerank as jest.Mock;
const mockedChat = chatCompletion as jest.Mock;
const mockedRoute = routeModel as jest.Mock;
const mockedTier = modelForTier as jest.Mock;

function chunkRow(overrides: Partial<{ id: string; articleRef: string; content: string; title: string; sourceUrl: string; documentNumber: string | null; similarity: number }> = {}) {
  return {
    id: 'c1',
    articleRef: 'Điều 5',
    content: 'Người lao động được hưởng lương tối thiểu vùng theo quy định của Chính phủ.',
    title: 'Bộ luật Lao động 2019',
    sourceUrl: 'https://vbpl.example/lao-dong-2019',
    documentNumber: '45/2019/QH14',
    similarity: 0.81,
    ...overrides,
  };
}

describe('legal.service', () => {
  const origEnabled = env.LEGAL_ENABLED;

  beforeEach(() => {
    jest.resetAllMocks();
    env.LEGAL_ENABLED = true;
  });

  afterAll(() => {
    env.LEGAL_ENABLED = origEnabled;
  });

  it('throws 503 when legal research is disabled', async () => {
    env.LEGAL_ENABLED = false;
    await expect(searchLegal('u1', 'Lương tối thiểu vùng là bao nhiêu?')).rejects.toMatchObject({
      statusCode: 503,
    });
    env.LEGAL_ENABLED = true;
  });

  it('throws 400 for an empty question', async () => {
    await expect(searchLegal('u1', 'abc')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('returns a cached answer without calling the LLM', async () => {
    mockedPrisma.legalCache.findUnique.mockResolvedValue({
      questionHash: 'h',
      question: 'q',
      answer: 'cached answer',
      citations: [{ document: 'D', article: 'Điều 1', url: 'https://x' }],
      modelUsed: 'qwen',
      createdAt: new Date(),
    });

    const result = await searchLegal('u1', 'Lương tối thiểu vùng là bao nhiêu?');

    expect(result.answer).toBe('cached answer');
    expect(result.cached).toBe(true);
    expect(result.modelUsed).toBe('qwen');
    expect(mockedEmbed).not.toHaveBeenCalled();
    expect(mockedChat).not.toHaveBeenCalled();
  });

  it('runs the full RAG flow (retrieve → rerank → generate → cache)', async () => {
    mockedEmbed.mockResolvedValue([[0.1, 0.2, 0.3]]);
    mockedPrisma.$queryRaw.mockResolvedValue([chunkRow(), chunkRow({ id: 'c2', articleRef: 'Điều 10' })]);
    mockedRerank.mockResolvedValue([
      { index: 0, relevance_score: 0.9 },
      { index: 1, relevance_score: 0.7 },
    ]);
    mockedRoute.mockReturnValue('premium');
    mockedTier.mockReturnValue('premium-model');
    mockedChat.mockResolvedValue(
      'Theo Điều 5 Bộ luật Lao động, người lao động được hưởng lương tối thiểu vùng.\n\nCITATIONS_JSON: [{"document":"Bộ luật Lao động 2019","article":"Điều 5","url":"https://vbpl.example/lao-dong-2019"}]'
    );
    mockedPrisma.aIUsage.create.mockResolvedValue({ id: 'u1' });
    mockedPrisma.legalCache.upsert.mockResolvedValue({ id: 'lc1' });

    const result = await searchLegal('u1', 'Lương tối thiểu vùng là bao nhiêu?');

    expect(result.cached).toBe(false);
    expect(result.answer).toContain('Theo Điều 5');
    expect(result.citations).toEqual([
      { document: 'Bộ luật Lao động 2019', article: 'Điều 5', url: 'https://vbpl.example/lao-dong-2019' },
    ]);
    expect(result.disclaimer).toBe(DISCLAIMER);
    expect(result.modelUsed).toBe('premium-model');
    expect(mockedEmbed).toHaveBeenCalledTimes(1);
    expect(mockedRerank).toHaveBeenCalledTimes(1);
    expect(mockedChat).toHaveBeenCalledTimes(1);
    expect(mockedTier).toHaveBeenCalledWith('premium');
    expect(mockedPrisma.aIUsage.create).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.legalCache.upsert).toHaveBeenCalledTimes(1);
  });

  it('filters citations not backed by the retrieved context', async () => {
    mockedEmbed.mockResolvedValue([[0.1]]);
    mockedPrisma.$queryRaw.mockResolvedValue([chunkRow()]);
    mockedRerank.mockResolvedValue([{ index: 0, relevance_score: 0.95 }]);
    mockedChat.mockResolvedValue(
      'Trả lời.\n\nCITATIONS_JSON: [{"document":"Văn bản bịa","article":"Điều 99","url":"https://fake.example/not-in-corpus"}]'
    );
    mockedPrisma.aIUsage.create.mockResolvedValue({ id: 'u1' });
    mockedPrisma.legalCache.upsert.mockResolvedValue({ id: 'lc1' });

    const result = await searchLegal('u1', 'Một câu hỏi pháp lý về bồi thường thiệt hại?');

    expect(result.citations).toEqual([]);
  });

  it('short-circuits without an LLM call when nothing similar is found', async () => {
    mockedEmbed.mockResolvedValue([[0.1]]);
    mockedPrisma.$queryRaw.mockResolvedValue([chunkRow({ similarity: 0.1 })]);

    const result = await searchLegal('u1', 'Câu hỏi không có trong kho dữ liệu?');

    expect(result.answer).toContain('Không tìm thấy');
    expect(mockedChat).not.toHaveBeenCalled();
    expect(mockedRerank).not.toHaveBeenCalled();
    expect(mockedPrisma.aIUsage.create).not.toHaveBeenCalled();
    expect(mockedPrisma.legalCache.upsert).toHaveBeenCalledTimes(1);
  });

  it('legalStatus reports indexed counts and daily usage', async () => {
    mockedPrisma.legalDocument.count.mockResolvedValue(42);
    mockedPrisma.legalChunk.count.mockResolvedValue(1337);
    mockedPrisma.aIUsage.aggregate.mockResolvedValue({
      _count: { id: 7 },
      _sum: { inputTokens: 1000, outputTokens: 500 },
    });

    const status = await legalStatus();

    expect(status).toMatchObject({
      enabled: true,
      indexedDocuments: 42,
      indexedChunks: 1337,
      neuronBudgetDaily: 10000,
      usageToday: { requests: 7, inputTokens: 1000, outputTokens: 500 },
    });
  });
});