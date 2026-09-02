import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';

/** Convert supertest's set-cookie header (string | string[] | undefined) into
 * a single Cookie header value for `.set('Cookie', ...)`. Supertest expects a
 * string, not an array — passing the raw array is what throws the TypeError. */
function cookieHeaderValue(setCookie: unknown): string {
  if (!setCookie) return '';
  if (typeof setCookie === 'string') return setCookie;
  if (Array.isArray(setCookie)) return setCookie.join('; ');
  return String(setCookie);
}

/** Extract just the refresh_token cookie from a set-cookie header value. */
function refreshCookieOnly(setCookie: unknown): string {
  const all = cookieHeaderValue(setCookie);
  const cookies = all.split(';').map((c) => c.trim());
  const refresh = cookies.find((c) => c.startsWith('refresh_token='));
  return refresh ?? '';
}

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
      expect(res.headers['set-cookie']).toHaveLength(3);
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
      expect(res.headers['set-cookie']).toHaveLength(3);
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
      const agent = request.agent(app);
      const reg = await agent
        .post('/api/auth/register')
        .send({ email: 'refresh@taskflow.dev', password: 'password123', name: 'Refresh User' });
      // Refresh is no longer CSRF-exempt: echo the csrf_token cookie.
      const csrf = (reg.headers['set-cookie'] as unknown as string[])
        .find((c) => c.startsWith('csrf_token='))
        ?.split(';')[0]
        .split('=')[1];

      const res = await agent.post('/api/auth/refresh').set('x-csrf-token', csrf ?? '');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('rejects invalid refresh tokens', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', 'refresh_token=invalid-token');

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
        .set('Cookie', cookieHeaderValue(reg.headers['set-cookie']));

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('me@taskflow.dev');
    });

    it('rejects missing token with 401', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('rejects a refresh token used as an access token', async () => {
      const reg = await request(app)
        .post('/api/auth/register')
        .send({ email: 'type@taskflow.dev', password: 'password123', name: 'Type User' });

      const res = await request(app).get('/api/auth/me').set('Cookie', refreshCookieOnly(reg.headers['set-cookie']));
      expect(res.status).toBe(401);
    });

    it('rejects an access token belonging to a deleted user', async () => {
      const reg = await request(app)
        .post('/api/auth/register')
        .send({ email: 'deleted@taskflow.dev', password: 'password123', name: 'Gone' });

      await prisma.user.deleteMany({ where: { email: 'deleted@taskflow.dev' } });

      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', cookieHeaderValue(reg.headers['set-cookie']));
      expect(res.status).toBe(401);
    });

    it('rejects a tampered token with 401', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', 'access_token=eyJhbGciOiJIUzI1NiJ9.invalid.signature');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/auth/logout', () => {
    it('logs out without a token', async () => {
      const res = await request(app).post('/api/auth/logout').send({});
      expect(res.status).toBe(200);
    });
  });
});
