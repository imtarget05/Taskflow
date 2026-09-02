import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';

/**
 * SC NLP Analysis integration test (Step 2.4).
 *
 * Dạng test tương tự projects.integration.test.ts —
 * dùng request.agent để giữ session + CSRF cookie.
 */
describe('SC NLP Analysis integration', () => {
  let app: ReturnType<typeof createApp>;
  let agent: ReturnType<typeof request.agent>;
  let userId = '';

  async function resetDb() {
    await prisma.nlpFeedback.deleteMany();
    await prisma.ticketAnalysis.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.taskAssignment.deleteMany();
    await prisma.task.deleteMany();
    await prisma.column.deleteMany();
    await prisma.projectMember.deleteMany();
    await prisma.project.deleteMany();
    await prisma.user.deleteMany();
  }

  beforeAll(async () => {
    app = createApp();
    agent = request.agent(app);
  });

  beforeEach(async () => {
    await resetDb();

    // Register → capture CSRF
    const res = await agent.post('/api/auth/register').send({
      email: 'sc@test.dev',
      password: 'password123',
      name: 'SC Tester',
    });
    expect(res.status).toBe(201);
    const raw = res.headers['set-cookie'];
    const setCookie = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
    const csrfEntry = setCookie.find((entry) => entry.startsWith('csrf_token='));
    (agent as unknown as { csrfToken?: string }).csrfToken =
      csrfEntry?.split(';')[0].split('=')[1] ?? '';
    userId = (res.body.user as { id: string }).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function authed() {
    const token = (agent as unknown as { csrfToken?: string }).csrfToken ?? '';
    return agent.set('X-CSRF-Token', token);
  }

  describe('POST /api/sc/nlp/analyse-order', () => {
    it('rejects unauthenticated request with 401', async () => {
      const res = await request(app)
        .post('/api/sc/nlp/analyse-order')
        .send({ text: 'PO mới từ nhà cung cấp' });
      expect(res.status).toBe(401);
    });

    it('returns 400 when text is empty', async () => {
      const res = await authed()
        .post('/api/sc/nlp/analyse-order')
        .send({ text: '' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when text exceeds max length', async () => {
      const res = await authed()
        .post('/api/sc/nlp/analyse-order')
        .send({ text: 'x'.repeat(5000) });
      expect(res.status).toBe(400);
    });

    it('returns classification + confidence + suggestedAction (fallback rule-based khi AI unavailable)', async () => {
      // Increase timeout because LLM calls can take ~13s and may be slower under load
      const res = await authed()
        .post('/api/sc/nlp/analyse-order')
        .send({ text: 'PO số PO-2026-001 từ nhà cung cấp ABC, 500 cái linh kiện' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            classification: expect.stringContaining('PO'),
            confidence: expect.any(Number),
            suggestedAction: expect.any(String),
            workflowTrigger: expect.any(String),
          }),
        })
      );

      // Check persisted in DB — ghi vào SCOrderAnalysis (không phải ticketAnalysis)
      const analyses = await prisma.sCOrderAnalysis.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });
      expect(analyses).toHaveLength(1);
      const analysis = analyses[0];
      expect(analysis.classification).toContain('PO');
      expect(analysis.suggestedAction).toBeDefined();
    }, 30000);

    it('phân loại PO cập nhật (annotation / điều chỉnh)', async () => {
      const res = await authed()
        .post('/api/sc/nlp/analyse-order')
        .send({ text: 'Cập nhật PO-2026-002, tăng quantity từ 100 lên 200' });

      expect(res.status).toBe(200);
      const { data } = res.body;
      expect(data.classification).toContain('PO_UPDATE');
      expect(data.confidence).toBeGreaterThanOrEqual(0);
    });

    it('phân loại Invoice (hóa đơn)', async () => {
      const res = await authed()
        .post('/api/sc/nlp/analyse-order')
        .send({ text: 'Hóa đơn INV-2026-030 từ nhà cung cấp XYZ, tổng 50 triệu VND' });

      expect(res.status).toBe(200);
      const { data } = res.body;
      expect(data.classification).toContain('INVOICE');
    });

    it('phân loại ASN (Advanced Shipping Notice)', async () => {
      const res = await authed()
        .post('/api/sc/nlp/analyse-order')
        .send({ text: 'ASN ASN-2026-005, shipment sắp tới từ kho B, ETA 15/09' });

      expect(res.status).toBe(200);
      const { data } = res.body;
      expect(data.classification).toContain('ASN');
    });

    it('emits socket event sc:order:analysed (best-effort, không lỗi)', async () => {
      // Socket event emit được gọi trong service. Test chỉ đảm bảo endpoint không ném.
      const res = await authed()
        .post('/api/sc/nlp/analyse-order')
        .send({ text: 'test socket event' });

      expect(res.status).toBe(200);
      // Server không ném — socket event được emit bên trong (không throw)
    });

    it('lưu projectId khi được truyền', async () => {
      const projectRes = await authed().post('/api/projects').send({
        name: 'SC Test Project',
        description: 'test',
        color: '#00ff00',
      });
      expect(projectRes.status).toBe(201);
      const projectId = projectRes.body.data.id;

      const res = await authed()
        .post('/api/sc/nlp/analyse-order')
        .send({ text: 'PO test cho project', projectId });

      expect(res.status).toBe(200);
      const analyses = await prisma.sCOrderAnalysis.findMany({
        where: { userId, projectId },
      });
      expect(analyses).toHaveLength(1);
    });
  });
});
