import { prisma } from '../../../lib/prisma';
import { embed, embedBatched, isLLMConfigured } from '../../agent/llm';
import {
  chunkProjectTasks,
  retrieve,
  fuseRRF,
  RagRetrievalResult,
} from '../rag.service';

jest.mock('../../../lib/prisma', () => ({
  prisma: {
    task: { findMany: jest.fn() },
    projectMember: { findFirst: jest.fn() },
    project: { findUnique: jest.fn() },
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn(),
    ragChunk: { count: jest.fn(), deleteMany: jest.fn() },
  },
}));

jest.mock('../../agent/llm', () => ({
  embed: jest.fn(),
  embedBatched: jest.fn(),
  isLLMConfigured: jest.fn(),
}));

const mockedPrisma = prisma as unknown as {
  task: { findMany: jest.Mock };
  projectMember: { findFirst: jest.Mock };
  project: { findUnique: jest.Mock };
  $executeRaw: jest.Mock;
  $queryRaw: jest.Mock;
  ragChunk: { count: jest.Mock; deleteMany: jest.Mock };
};
const mockedEmbed = embed as jest.Mock;
const mockedEmbedBatched = embedBatched as jest.Mock;
const mockedIsConfigured = isLLMConfigured as jest.Mock;

const TASKS = [
  {
    id: 't1',
    projectId: 'p1',
    title: 'Thiết kế API thanh toán',
    description: 'Xây dựng REST API cho cổng thanh toán VNPay, ưu tiên HIGH',
    priority: 'HIGH',
    dueDate: new Date('2026-09-15'),
    completed: false,
    metadata: null,
    assignments: [{ userId: 'u1' }, { userId: 'u2' }],
  },
  {
    id: 't2',
    projectId: 'p1',
    title: 'Viết unit test',
    description: 'Bổ sung unit test cho module thanh toán',
    priority: 'MEDIUM',
    dueDate: null,
    completed: true,
    metadata: null,
    assignments: [],
  },
];

describe('rag.service — Recommendation RAG', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedIsConfigured.mockReturnValue(true);
    mockedEmbed.mockResolvedValue([[0.1, 0.2, 0.3]]);
    mockedEmbedBatched.mockResolvedValue([[0.1, 0.2, 0.3]]);
  });

  describe('chunkProjectTasks', () => {
    it('tạo 1 chunk mỗi task với title + description + priority + dueDate', () => {
      const chunks = chunkProjectTasks(TASKS as never);
      expect(chunks).toHaveLength(2);
      expect(chunks[0].sourceId).toBe('t1');
      expect(chunks[0].title).toBe('Thiết kế API thanh toán');
      expect(chunks[0].content).toContain('Thiết kế API thanh toán');
      expect(chunks[0].content).toContain('VNPay');
      expect(chunks[0].content).toContain('HIGH');
      expect(chunks[0].content).toContain('2026-09-15');
    });

    it('chunk task không description vẫn có nội dung hợp lệ', () => {
      const chunks = chunkProjectTasks([
        { ...TASKS[0], description: null },
      ] as never);
      expect(chunks[0].content).toContain('Thiết kế API thanh toán');
      expect(chunks[0].content.length).toBeGreaterThan(10);
    });
  });

  describe('indexProject', () => {
    it('embed + upsert từng chunk vào rag_chunks', async () => {
      mockedPrisma.task.findMany.mockResolvedValue(TASKS);
      (mockedPrisma.$executeRaw as jest.Mock).mockResolvedValue(1);
      mockedEmbedBatched.mockResolvedValue([
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ]);

      const svc = (await import('../rag.service')) as typeof import('../rag.service');
      const indexed = await svc.indexProject('p1');

      expect(indexed).toBe(2);
      expect(mockedEmbedBatched).toHaveBeenCalled();
      expect(mockedPrisma.$executeRaw).toHaveBeenCalledTimes(2);
    });

    it('trả 0 khi project không có task', async () => {
      mockedPrisma.task.findMany.mockResolvedValue([]);
      const svc = (await import('../rag.service')) as typeof import('../rag.service');
      expect(await svc.indexProject('p1')).toBe(0);
      expect(mockedEmbedBatched).not.toHaveBeenCalled();
    });
  });

  describe('retrieve', () => {
    it('từ chối khi user không phải thành viên project (403)', async () => {
      mockedPrisma.projectMember.findFirst.mockResolvedValue(null);
      mockedPrisma.project.findUnique.mockResolvedValue({ id: 'p1', createdById: 'other' });

      await expect(retrieve('u1', 'thanh toán', { projectId: 'p1' })).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it('fallback keyword-only khi LLM chưa cấu hình', async () => {
      mockedIsConfigured.mockReturnValue(false);
      mockedPrisma.projectMember.findFirst.mockResolvedValue({ role: 'MEMBER' });
      (mockedPrisma.$queryRaw as jest.Mock).mockResolvedValue([
        { id: 'c1', sourceType: 'task', sourceId: 't1', title: 'Thiết kế API thanh toán', content: '...', metadata: null },
      ]);

      const results = await retrieve('u1', 'thanh toán', { projectId: 'p1' });
      expect(results).toHaveLength(1);
      expect(mockedEmbed).not.toHaveBeenCalled();
    });

    it('hybrid: trả kết quả fused khi LLM configured', async () => {
      mockedPrisma.projectMember.findFirst.mockResolvedValue({ role: 'MEMBER' });
      (mockedPrisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([
          { id: 'c1', sourceType: 'task', sourceId: 't1', title: 'API', content: 'a', metadata: null },
        ])
        .mockResolvedValueOnce([
          { id: 'c1', sourceType: 'task', sourceId: 't1', title: 'API', content: 'a', metadata: null },
          { id: 'c2', sourceType: 'task', sourceId: 't2', title: 'Test', content: 'b', metadata: null },
        ]);

      const results: RagRetrievalResult[] = await retrieve('u1', 'api', { projectId: 'p1', topK: 5 });
      // c1 xuất hiện ở cả 2 kênh → rank cao hơn c2
      expect(results[0].id).toBe('c1');
      expect(results).toHaveLength(2);
      expect(results[0].score).toBeGreaterThan(results[1].score);
    });
  });

  describe('fuseRRF', () => {
    it('RRF: item xuất hiện ở cả 2 kênh được điểm cao hơn', () => {
      const a = [{ id: 'x', sourceType: 'task', sourceId: 'x', title: 'x', content: 'x', metadata: null }];
      const b = [
        { id: 'x', sourceType: 'task', sourceId: 'x', title: 'x', content: 'x', metadata: null },
        { id: 'y', sourceType: 'task', sourceId: 'y', title: 'y', content: 'y', metadata: null },
      ];
      const fused = fuseRRF(a, b, 5);
      expect(fused[0].id).toBe('x');
      expect(fused).toHaveLength(2);
    });
  });
});
