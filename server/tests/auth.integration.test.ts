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

/** The bare refresh token value (no `refresh_token=` prefix, no attributes),
 * derived from the cookie-capture helper above. */
function refreshTokenValue(setCookie: unknown): string {
  return refreshCookieOnly(setCookie).replace(/^refresh_token=/, '');
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

    // A rotated refresh token must never be usable a second time. Presenting an
    // already-consumed token is treated as a stolen-token replay: EVERY refresh
    // token for that user is revoked. This is the most security-relevant branch
    // in auth.service.refresh(), so it is driven end-to-end here through a real
    // rotation rather than by calling the service directly.
    it('revokes every refresh token for the user when a rotated token is replayed', async () => {
      // Session A: register -> original refresh token R1.
      const reg = await request(app)
        .post('/api/auth/register')
        .send({ email: 'reuse@taskflow.dev', password: 'password123', name: 'Reuse User' });
      expect(reg.status).toBe(201);
      const userId = reg.body.user.id as string;
      const csrf = reg.body.csrfToken as string;
      const r1 = refreshTokenValue(reg.headers['set-cookie']);
      expect(r1).not.toBe('');

      // A second, independent session, so "all sessions revoked" is provable
      // rather than just "the replayed token stopped working".
      const second = await request(app)
        .post('/api/auth/login')
        .send({ email: 'reuse@taskflow.dev', password: 'password123' });
      expect(second.status).toBe(200);
      const otherSessionToken = refreshTokenValue(second.headers['set-cookie']);
      expect(await prisma.refreshToken.count({ where: { userId } })).toBe(2);

      // Legitimate rotation: R1 is consumed and replaced by R2.
      const rotate = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `refresh_token=${r1}; csrf_token=${csrf}`)
        .set('x-csrf-token', csrf);
      expect(rotate.status).toBe(200);
      const r2 = refreshTokenValue(rotate.headers['set-cookie']);
      expect(r2).not.toBe(r1);
      expect(await prisma.refreshToken.count({ where: { userId } })).toBe(3);

      // Replay R1 -> reuse detected -> 401, and every session is revoked.
      const replay = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `refresh_token=${r1}; csrf_token=${csrf}`)
        .set('x-csrf-token', csrf);
      expect(replay.status).toBe(401);
      expect(replay.body.success).toBe(false);
      expect(replay.body.message).toMatch(/reuse detected/i);

      // Nothing survives: the replayed token, the freshly rotated token (R2) and
      // the unrelated second session's token are all revoked.
      expect(await prisma.refreshToken.count({ where: { userId } })).toBe(0);

      // The revocation is enforced by the API, not just absent from the table:
      // neither the rotated token nor the other session can refresh any more.
      for (const revoked of [r2, otherSessionToken]) {
        const after = await request(app)
          .post('/api/auth/refresh')
          .set('Cookie', `refresh_token=${revoked}; csrf_token=${csrf}`)
          .set('x-csrf-token', csrf);
        expect(after.status).toBe(401);
      }
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
