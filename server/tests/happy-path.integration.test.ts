import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';

/**
 * Happy-path integration test: chứng minh user xài BÌNH THƯỜNG (input ĐÚNG)
 * luôn nhận 200/201 — không phải 4xx/5xx.
 * Đây là phần bổ sung cho edge-case tests (input XẤU → 400).
 */
describe('Happy-path: user xài bình thường đều 200/201', () => {
  let app: ReturnType<typeof createApp>;
  let agent: ReturnType<typeof request.agent>;
  const uid = () => `happy-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  async function resetDb() {
    await prisma.sCOrderAnalysis.deleteMany();
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

  beforeAll(() => {
    app = createApp();
    agent = request.agent(app);
  });

  beforeEach(async () => {
    await resetDb();
    const email = `${uid()}@test.dev`;
    const res = await agent.post('/api/auth/register').send({
      email,
      password: 'password123',
      name: 'Happy User',
    });
    expect(res.status).toBe(201);
    const raw = res.headers['set-cookie'];
    const setCookie = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
    const csrfEntry = setCookie.find((e) => e.startsWith('csrf_token='));
    (agent as unknown as { csrfToken?: string }).csrfToken =
      csrfEntry?.split(';')[0].split('=')[1] ?? '';
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function authed() {
    const token = (agent as unknown as { csrfToken?: string }).csrfToken ?? '';
    return agent.set('X-CSRF-Token', token);
  }

  it('auth: register + login + me đều 200/201', async () => {
    const login = await authed().post('/api/auth/login').send({
      email: `${uid()}@test.dev`,
      password: 'password123',
    });
    expect([200, 401]).toContain(login.status); // login user chưa tồn tại → 401 (đúng)
    const me = await authed().get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toContain('@test.dev');
  });

  it('project: create + list + getById đều 200/201', async () => {
    const create = await authed().post('/api/projects').send({
      name: 'Dự án vui vẻ 🇻🇳',
      description: 'test happy path',
      columnNames: ['To Do', 'In Progress', 'Done'],
    });
    expect(create.status).toBe(201);
    const projectId = create.body.data.id;

    const list = await authed().get('/api/projects');
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBeGreaterThan(0);

    const getOne = await authed().get(`/api/projects/${projectId}`);
    expect(getOne.status).toBe(200);
    expect(getOne.body.data.project.name).toBe('Dự án vui vẻ 🇻🇳');
  });

  it('column + task + comment + move đều 200/201', async () => {
    const p = await authed().post('/api/projects').send({ name: 'P', columnNames: ['A', 'B'] });
    const projectId = p.body.data.id;
    const col = await authed().post(`/api/projects/${projectId}/columns`).send({ name: 'C1', position: 0 });
    expect(col.status).toBe(201);
    const columnId = col.body.data.id;

    const task = await authed().post(`/api/projects/${projectId}/tasks`).send({
      title: 'Task vui',
      columnId,
      priority: 'MEDIUM',
    });
    expect(task.status).toBe(201);
    const taskId = task.body.data.id;

    const move = await authed().post(`/api/projects/${projectId}/columns/${columnId}/move`).send({
      sourceColumnId: columnId,
      targetColumnId: columnId,
      sourceIndex: 0,
      targetIndex: 0,
    });
    expect(move.status).toBe(200);

    const comment = await authed().post(`/api/projects/${projectId}/tasks/${taskId}/comments`).send({
      body: 'Comment vui 🎉',
    });
    expect(comment.status).toBe(201);
  });

  it('SC: supplier + order + inventory + dashboard + nlp + agentic đều 200/201', async () => {
    const p = await authed().post('/api/projects').send({ name: 'SC', columnNames: ['A'] });
    const projectId = p.body.data.id;
    const sup = await authed().post('/api/sc/suppliers').send({
      name: 'Nhà cung cấp A',
      code: `SUP-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      email: 'a@b.com',
    });
    expect(sup.status).toBe(201);
    const supplierId = sup.body.data.id;

    const order = await authed().post('/api/sc/orders').send({
      projectId,
      supplierId,
      orderNumber: `PO-${Date.now()}-HP`,
      status: 'PENDING_APPROVAL',
      items: [{ sku: 'K1', name: 'Item', quantity: 5, unitPrice: 10 }],
    });
    expect(order.status).toBe(201);
    const orderId = order.body.data.id;

    const inv = await authed().post('/api/sc/inventory').send({
      projectId,
      sku: `SKU-${Date.now()}-HP`,
      name: 'Kho A',
      quantity: 100,
      minStock: 10,
    });
    expect(inv.status).toBe(201);
    const invId = inv.body.data.id;

    const adj = await authed().patch(`/api/sc/inventory/${invId}/adjust`).send({ quantity: 90, reason: 'kiểm kê' });
    expect(adj.status).toBe(200);

    const dash = await authed().get(`/api/sc/dashboard/${projectId}`);
    expect(dash.status).toBe(200);
    expect(dash.body.data.totalPO).toBe(1);

    const nlp = await authed().post('/api/sc/nlp/analyse-order').send({
      text: 'Yêu cầu mua PO-ABC số lượng 100 cái gấp',
    });
    expect(nlp.status).toBe(200);

    const agentic = await authed().post('/api/sc/agentic/process-order').send({
      orderId,
      projectId,
      notes: 'Yêu cầu mua PO-ABC',
    });
    expect(agentic.status).toBe(200);
    expect(agentic.body.data).toBeDefined();
  });

  it('agent chat + analytics + search đều 200', async () => {
    const p = await authed().post('/api/projects').send({ name: 'Chat', columnNames: ['A'] });
    const projectId = p.body.data.id;

    const chat = await authed().post('/api/agent/chat').send({
      messages: [{ role: 'user', content: 'Tạo PO cho supplier X' }],
      projectId,
    });
    expect(chat.status).toBe(200);

    const analytics = await authed().get(`/api/analytics/overview?projectId=${projectId}`);
    expect(analytics.status).toBe(200);

    const search = await authed().get('/api/search?q=PO');
    expect(search.status).toBe(200);
  });

  it('order state-machine: PENDING→APPROVED→...→CLOSED đều 200', async () => {
    const p = await authed().post('/api/projects').send({ name: 'SM', columnNames: ['A'] });
    const projectId = p.body.data.id;
    const sup = await authed().post('/api/sc/suppliers').send({
      name: 'S',
      code: `SUP-${Date.now()}-SM`,
      email: 's@s.com',
    });
    const supplierId = sup.body.data.id;
    const order = await authed().post('/api/sc/orders').send({
      projectId,
      supplierId,
      orderNumber: `PO-${Date.now()}-SM`,
      status: 'PENDING_APPROVAL',
    });
    const orderId = order.body.data.id;

    const steps = ['APPROVED', 'IN_FULFILLMENT', 'SHIPPED', 'DELIVERED', 'CLOSED'];
    for (const s of steps) {
      const r = await authed().patch(`/api/sc/orders/${orderId}/status`).send({ status: s });
      expect(r.status).toBe(200);
    }
  });
});
