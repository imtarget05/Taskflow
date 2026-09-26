import { Writable } from 'node:stream';
import pino from 'pino';
import { HTTP_LOG_REDACT_PATHS, LOG_CENSOR } from '../logger';

// Stand-in tokens: same shape the evidence log leaked (JWT prefix + long
// base64url runs), long enough that a partial redaction would still match.
const FAKE_ACCESS_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' + 'p'.repeat(48) + '.' + 's'.repeat(43);
const FAKE_REFRESH_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' + 'q'.repeat(48) + '.' + 'r'.repeat(43);
const FAKE_CSRF_TOKEN = 'c'.repeat(64);

// Request/response envelope shaped exactly like pino-http's serialized
// `req`/`res` (mirrors the leaked "request completed" line).
const completedRequest = {
  req: {
    id: 1,
    method: 'POST',
    url: '/api/auth/register',
    query: {},
    params: {},
    headers: {
      host: '127.0.0.1:63373',
      'content-type': 'application/json',
      cookie: `access_token=${FAKE_ACCESS_JWT}`,
      authorization: `Bearer ${FAKE_ACCESS_JWT}`,
      'x-csrf-token': FAKE_CSRF_TOKEN,
    },
    remoteAddress: '::ffff:127.0.0.1',
    remotePort: 63374,
  },
  res: {
    statusCode: 201,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'set-cookie': [
        `access_token=${FAKE_ACCESS_JWT}; Max-Age=900; Path=/; HttpOnly; SameSite=Lax`,
        `refresh_token=${FAKE_REFRESH_JWT}; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax`,
      ],
    },
  },
  responseTime: 122,
  msg: 'request completed',
};

function createCapturingLogger() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding: string, callback: () => void) {
      lines.push(chunk.toString('utf8'));
      callback();
    },
  });
  const logger = pino(
    { level: 'info', redact: { paths: [...HTTP_LOG_REDACT_PATHS], censor: LOG_CENSOR } },
    stream
  );
  return { logger, output: () => lines.join('') };
}

async function logCompletedRequest() {
  const { logger, output } = createCapturingLogger();
  logger.info(completedRequest);
  await logger.flush();
  const raw = output().trim().split('\n').pop() as string;
  return { out: output(), parsed: JSON.parse(raw) as Record<string, unknown> };
}

function headersOf(parsed: Record<string, unknown>, which: 'req' | 'res') {
  const side = parsed[which] as Record<string, unknown>;
  return side.headers as Record<string, unknown>;
}

describe('HTTP log redaction (server/src/lib/logger.ts)', () => {
  it('guards the response set-cookie header that leaked JWTs in evidence logs', () => {
    // Cheap documentation of the exact regression: dot notation cannot
    // express this key, so the path below is the only valid form.
    expect(HTTP_LOG_REDACT_PATHS).toContain('res.headers["set-cookie"]');
  });

  it('does not leak access/refresh tokens from set-cookie into the serialized line', async () => {
    const { out, parsed } = await logCompletedRequest();
    expect(out).not.toContain(FAKE_ACCESS_JWT);
    expect(out).not.toContain(FAKE_REFRESH_JWT);
    expect(headersOf(parsed, 'res')['set-cookie']).toBe(LOG_CENSOR);
  });

  it('censors credentials the client sends', async () => {
    const { out, parsed } = await logCompletedRequest();
    expect(out).not.toContain(FAKE_CSRF_TOKEN);
    const reqHeaders = headersOf(parsed, 'req');
    expect(reqHeaders.cookie).toBe(LOG_CENSOR);
    expect(reqHeaders.authorization).toBe(LOG_CENSOR);
    expect(reqHeaders['x-csrf-token']).toBe(LOG_CENSOR);
  });

  it('leaves non-sensitive fields intact (redaction is not over-broad)', async () => {
    const { parsed } = await logCompletedRequest();
    const req = parsed.req as Record<string, unknown>;
    const res = parsed.res as Record<string, unknown>;
    const reqHeaders = headersOf(parsed, 'req');
    const resHeaders = headersOf(parsed, 'res');
    expect(req.method).toBe('POST');
    expect(req.url).toBe('/api/auth/register');
    expect(req.remoteAddress).toBe('::ffff:127.0.0.1');
    expect(res.statusCode).toBe(201);
    expect(parsed.responseTime).toBe(122);
    expect(reqHeaders.host).toBe('127.0.0.1:63373');
    expect(reqHeaders['content-type']).toBe('application/json');
    expect(resHeaders['content-type']).toBe('application/json; charset=utf-8');
  });
});
