import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';

describe('Auth API integration', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(async () => {
    // Clean up tables between runs (order matters for FK constraints).
    await prisma.refreshToken.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.taskAssignment.deleteMany();
    await prisma.task.deleteMany();
    await prisma.column.deleteMany();
    await prisma.projectMember.deleteMany();
    await prisma.project.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('POST /api/auth/register', () => {
    it('creates a user and returns tokens', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'user@taskflow.dev', password: 'password123', name: 'Test User' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.user.email).toBe('user@taskflow.dev');
    });

    it('rejects duplicate emails with 409', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({ email: 'dup@taskflow.dev', password: 'password123', name: 'First' });

      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'dup@taskflow.dev', password: 'otherpass123', name: 'Second' });

      expect(res.status).toBe(409);
    });

    it('rejects short passwords', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'short@taskflow.dev', password: 'short', name: 'Shorty' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/auth/register')
        .send({ email: 'login@taskflow.dev', password: 'password123', name: 'Login User' });
    });

    it('logs in with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'login@taskflow.dev', password: 'password123' });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
    });

    it('rejects invalid credentials with 401', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'login@taskflow.dev', password: 'wrongpass' });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('issues a new access token from a valid refresh token', async () => {
      const reg = await request(app)
        .post('/api/auth/register')
        .send({ email: 'refresh@taskflow.dev', password: 'password123', name: 'Refresh User' });

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: reg.body.refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
    });

    it('rejects invalid refresh tokens', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid-token' });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns the authenticated user', async () => {
      const reg = await request(app)
        .post('/api/auth/register')
        .send({ email: 'me@taskflow.dev', password: 'password123', name: 'Me User' });

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${reg.body.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('me@taskflow.dev');
    });

    it('rejects missing token with 401', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });
  });
});