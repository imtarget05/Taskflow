import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';

describe('SC Dashboard frontend hook integration', () => {
  let app: ReturnType<typeof createApp>;
  let agent: ReturnType<typeof request.agent>;

  async function resetDb() {
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
      email: 'dashboard@test.dev',
      password: 'password123',
      name: 'Dashboard Tester',
    });
    expect(res.status).toBe(201);
    const raw = res.headers['set-cookie'];
    const setCookie = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
    const csrfEntry = setCookie.find((entry) => entry.startsWith('csrf_token='));
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

  describe('GET /api/sc/dashboard/:projectId', () => {
    it('rejects unauthenticated request with 401', async () => {
      const res = await request(app)
        .get('/api/sc/dashboard/nonexistent');
      expect(res.status).toBe(401);
    });

    it('returns 403 when user is not a member of the project', async () => {
      const projectRes = await authed().post('/api/projects').send({
        name: 'Other Project',
        description: 'test',
        color: '#ff0000',
      });
      expect(projectRes.status).toBe(201);
      const projectId = projectRes.body.data.id;

      // A second, freshly-registered user (not a member of the project) must be
      // denied. The project creator is auto-added as OWNER member, so we can't
      // use the same agent here.
      const outsider = request.agent(app);
      const reg = await outsider.post('/api/auth/register').send({
        email: 'outsider@test.dev',
        password: 'password123',
        name: 'Outsider',
      });
      expect(reg.status).toBe(201);
      const rawCsrf = reg.headers['set-cookie'];
      const setCookie = Array.isArray(rawCsrf) ? rawCsrf : rawCsrf ? [String(rawCsrf)] : [];
      const csrfEntry = setCookie.find((e) => e.startsWith('csrf_token='));
      const outsiderCsrf = csrfEntry?.split(';')[0].split('=')[1] ?? '';

      const res = await outsider.get(`/api/sc/dashboard/${projectId}`).set('X-CSRF-Token', outsiderCsrf);
      expect(res.status).toBe(403);
    });

    it('returns metrics for a SC project with orders + inventory', async () => {
      // Create SC project
      const projectRes = await authed().post('/api/projects').send({
        name: 'SC Test Dashboard',
        description: 'test',
        color: '#00ff00',
      });
      expect(projectRes.status).toBe(201);
      const projectId = projectRes.body.data.id;

      // Create supplier
      const supplierRes = await authed().post('/api/sc/suppliers').send({
        name: 'Supplier ABC',
        code: 'SUP-001',
        email: 'supplier@test.dev',
      });
      expect(supplierRes.status).toBe(201);
      const supplierId = supplierRes.body.data.id;

      // Create 5 orders with various statuses
      const order1 = await authed().post('/api/sc/orders').send({
        supplierId,
        projectId,
        orderNumber: 'PO-001',
        status: 'PENDING_APPROVAL',
      });
      const order2 = await authed().post('/api/sc/orders').send({
        supplierId,
        projectId,
        orderNumber: 'PO-002',
        status: 'PENDING_APPROVAL',
      });
      const order3 = await authed().post('/api/sc/orders').send({
        supplierId,
        projectId,
        orderNumber: 'PO-003',
        status: 'APPROVED',
      });
      const order4 = await authed().post('/api/sc/orders').send({
        supplierId,
        projectId,
        orderNumber: 'PO-004',
        status: 'SHIPPED',
      });
      const order5 = await authed().post('/api/sc/orders').send({
        supplierId,
        projectId,
        orderNumber: 'PO-005',
        status: 'IN_FULFILLMENT',
      });
      expect(order1.status).toBe(201);
      expect(order2.status).toBe(201);
      expect(order3.status).toBe(201);
      expect(order4.status).toBe(201);
      expect(order5.status).toBe(201);

      // Create inventory items
      await authed().post('/api/sc/inventory').send({
        projectId,
        sku: 'INV-001',
        name: 'Linh kiện A',
        quantity: 100,
        unit: 'CÁT',
        minStock: 50,
      });
      await authed().post('/api/sc/inventory').send({
        projectId,
        sku: 'INV-002',
        name: 'Linh kiện B',
        quantity: 20,
        unit: 'CÁT',
        minStock: 50,
      });

      const res = await authed().get(`/api/sc/dashboard/${projectId}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const { data } = res.body;
      expect(data.totalPO).toBe(5);
      expect(data.pendingApproval).toBe(2);
      expect(data.approved).toBe(1);
      expect(data.inFulfillment).toBe(1);
      expect(data.shipped).toBe(1);
      expect(data.cancelled).toBe(0);
      expect(data.closed).toBe(0);
      expect(data.fulfillmentRate).toBe(40);
      expect(data.inventory.totalItems).toBe(2);
      expect(data.inventory.totalQuantity).toBe(120);
      expect(data.inventory.lowStockItems).toBe(1); // INV-002: 20 < 50 minStock
      expect(data.inventory.lowStockQuantity).toBe(20);

      // Check recentOrders
      expect(data.recentOrders.length).toBeGreaterThan(0);
      expect(data.recentOrders[0].status).toBeDefined();
    });
  });

  describe('GET /api/sc/dashboard/:projectId/export/csv', () => {
    it('returns CSV with Vietnamese headers', async () => {
      const projectRes = await authed().post('/api/projects').send({
        name: 'SC CSV Test',
        description: 'test',
        color: '#00ff00',
      });
      expect(projectRes.status).toBe(201);
      const projectId = projectRes.body.data.id;

      // Add supplier + order
      const supplierRes = await authed().post('/api/sc/suppliers').send({
        name: 'Supplier CSV',
        code: 'SUP-CSV',
      });
      const supplierId = supplierRes.body.data.id;

      await authed().post('/api/sc/orders').send({
        supplierId,
        projectId,
        orderNumber: 'PO-CSV-001',
        status: 'PENDING_APPROVAL',
      });

      const res = await authed().get(`/api/sc/dashboard/${projectId}/export/csv`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text).toContain('Tổng PO');
      expect(res.text).toContain('Đang chờ duyệt');
      expect(res.text).toContain('PO-CSV-001');
    });
  });

  describe('GET /api/sc/dashboard/:projectId/export/txt', () => {
    it('returns TXT report with Vietnamese content', async () => {
      const projectRes = await authed().post('/api/projects').send({
        name: 'SC TXT Test',
        description: 'test',
        color: '#00ff00',
      });
      expect(projectRes.status).toBe(201);
      const projectId = projectRes.body.data.id;

      // Add supplier + order + inventory
      const supplierRes = await authed().post('/api/sc/suppliers').send({
        name: 'Supplier TXT',
        code: 'SUP-TXT',
      });
      const supplierId = supplierRes.body.data.id;

      await authed().post('/api/sc/orders').send({
        supplierId,
        projectId,
        orderNumber: 'PO-TXT-001',
        status: 'SHIPPED',
      });

      await authed().post('/api/sc/inventory').send({
        projectId,
        sku: 'INV-TXT-001',
        name: 'Item TXT',
        quantity: 50,
        unit: 'CÁT',
        minStock: 20,
      });

      const res = await authed().get(`/api/sc/dashboard/${projectId}/export/txt`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/plain');
      expect(res.text).toContain('BÁO CÁO DASHBOARD SUPPLY CHAIN');
      expect(res.text).toContain('PO-TXT-001');
      expect(res.text).toContain('SHIPPED');
    });
  });
});
