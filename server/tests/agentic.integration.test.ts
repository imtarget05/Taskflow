import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';

/**
 * Agentic Flow integration test (Track B — TDD).
 * Pattern giống sc-nlp.integration.test.ts: request.agent giữ session + CSRF,
 * authed() attach X-CSRF-Token, reset DB trước mỗi test.
 */
describe('Agentic Flow integration', () => {
  let app: ReturnType<typeof createApp>;
  let agent: ReturnType<typeof request.agent>;
  let userId = '';

  async function resetDb() {
    await prisma.agenticDecision.deleteMany();
    await prisma.sCOrderAnalysis.deleteMany();
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
    await prisma.order.deleteMany();
    await prisma.lineItem.deleteMany();
    await prisma.supplier.deleteMany();
    await prisma.inventoryItem.deleteMany();
    await prisma.user.deleteMany();
  }

  beforeAll(async () => {
    app = createApp();
    agent = request.agent(app);
  });

  beforeEach(async () => {
    await resetDb();
    const res = await agent.post('/api/auth/register').send({
      email: 'agentic@test.dev',
      password: 'password123',
      name: 'Agentic Tester',
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

  async function createOrderWithNotes(
    notes: string,
    existingProjectId?: string
  ): Promise<{ projectId: string; orderId: string }> {
    let projectId = existingProjectId ?? '';
    if (!projectId) {
      const projectRes = await authed().post('/api/projects').send({
        name: 'Agentic SC Project',
        description: 'test',
        color: '#0000ff',
      });
      expect(projectRes.status).toBe(201);
      projectId = projectRes.body.data.id;
    }

    const supplierRes = await authed().post('/api/sc/suppliers').send({
      name: 'Supplier AGT',
      code: `SUP-AGT-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      email: 'supplier-agt@test.dev',
    });
    expect(supplierRes.status).toBe(201);
    const supplierId = supplierRes.body.data.id;

    const orderRes = await authed().post('/api/sc/orders').send({
      supplierId,
      projectId,
      orderNumber: `PO-AGT-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      notes,
    });
    expect(orderRes.status).toBe(201);
    const orderId = orderRes.body.data.id;
    return { projectId, orderId };
  }

  describe('POST /api/sc/agentic/process-order', () => {
    it('rejects unauthenticated request with 401', async () => {
      const res = await request(app)
        .post('/api/sc/agentic/process-order')
        .send({ orderId: 'x', projectId: 'y' });
      expect(res.status).toBe(401);
    });

    it('returns 400 when orderId or projectId is missing', async () => {
      const res = await authed().post('/api/sc/agentic/process-order').send({ orderId: '' });
      expect(res.status).toBe(400);
    });

    it('returns 404 when order does not exist', async () => {
      const res = await authed()
        .post('/api/sc/agentic/process-order')
        .send({ orderId: 'nonexistent', projectId: 'nonexistent' });
      expect(res.status).toBe(404);
    });

    it('PO_NEW order → decision auto + create_task (low-risk, confidence >= 0.7)', async () => {
      const { projectId, orderId } = await createOrderWithNotes('PO mới, đặt hàng 500 linh kiện');
      const res = await authed().post('/api/sc/agentic/process-order').send({ orderId, projectId });

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(
        expect.objectContaining({
          orderId,
          classification: 'PO_NEW',
          decision: 'auto',
          llmUsed: false,
          agenticDecisionId: expect.any(String),
        })
      );
      expect(res.body.data.taskId).toBeTruthy();

      const task = await prisma.task.findUnique({ where: { id: res.body.data.taskId } });
      expect(task).not.toBeNull();
      expect(task!.projectId).toBe(projectId);

      const decision = await prisma.agenticDecision.findUnique({
        where: { id: res.body.data.agenticDecisionId },
      });
      expect(decision!.decision).toBe('auto');
      expect(decision!.taskId).toBe(res.body.data.taskId);
    });

    it('Invoice order → decision human_task (high-risk approve_payment)', async () => {
      const { projectId, orderId } = await createOrderWithNotes('Hóa đơn INV-001, thanh toán 50 triệu');
      const res = await authed().post('/api/sc/agentic/process-order').send({ orderId, projectId });

      expect(res.status).toBe(200);
      expect(res.body.data.decision).toBe('human_task');
      expect(res.body.data.classification).toBe('INVOICE');
      expect(res.body.data.humanTaskId).toBeTruthy();

      const decision = await prisma.agenticDecision.findUnique({
        where: { id: res.body.data.agenticDecisionId },
      });
      expect(decision!.decision).toBe('human_task');
      expect(decision!.humanTaskId).toBe(res.body.data.humanTaskId);
    });

    it('unrecognized order → decision manual_review (confidence < 0.7)', async () => {
      const { projectId, orderId } = await createOrderWithNotes('Ghi chú chung chung không khớp rule');
      const res = await authed().post('/api/sc/agentic/process-order').send({ orderId, projectId });

      expect(res.status).toBe(200);
      expect(res.body.data.decision).toBe('manual_review');
      expect(res.body.data.confidence).toBeLessThan(0.7);
    });

    it('returns 400 when order does not belong to project', async () => {
      const { orderId } = await createOrderWithNotes('PO mới đặt hàng');
      const otherProject = await authed().post('/api/projects').send({ name: 'Other Project' });
      const res = await authed()
        .post('/api/sc/agentic/process-order')
        .send({ orderId, projectId: otherProject.body.data.id });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/sc/agentic/decisions/:projectId', () => {
    it('rejects unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/sc/agentic/decisions/whatever');
      expect(res.status).toBe(401);
    });

    it('lists decisions for a project (newest first, with order + user)', async () => {
      const first = await createOrderWithNotes('PO mới, đặt hàng 100 cái');
      const second = await createOrderWithNotes('Hóa đơn INV-002, thanh toán', first.projectId);

      await authed().post('/api/sc/agentic/process-order').send({ orderId: first.orderId, projectId: first.projectId });
      await authed().post('/api/sc/agentic/process-order').send({ orderId: second.orderId, projectId: first.projectId });

      const res = await authed().get(`/api/sc/agentic/decisions/${first.projectId}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(2);

      const createdAts = res.body.data.map((d: { createdAt: string }) => new Date(d.createdAt).getTime());
      expect(createdAts[0]).toBeGreaterThanOrEqual(createdAts[1]);
      expect(res.body.data[0].order).toEqual(expect.objectContaining({ id: expect.any(String) }));
      expect(res.body.data[0].user).toEqual(expect.objectContaining({ id: userId }));
    });

    it('returns empty list for project without decisions', async () => {
      const projectRes = await authed().post('/api/projects').send({ name: 'Empty SC' });
      const res = await authed().get(`/api/sc/agentic/decisions/${projectRes.body.data.id}`);
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(0);
      expect(res.body.data).toEqual([]);
    });
  });
});
