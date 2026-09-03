import { describe, it, expect, vi, afterEach } from 'vitest';
import { onRequest, buildBackendUrl, DEFAULT_BACKEND_URL } from './[[path]]';

function makeContext(
  url: string,
  init: { method?: string; body?: string | null; headers?: Record<string, string> } = {}
) {
  const request = new Request(url, {
    method: init.method ?? 'GET',
    headers: init.headers,
    body: init.body ?? undefined,
  });
  const pathname = new URL(url).pathname;
  const path = pathname.replace(/^\/api\/?/, '');
  return {
    request,
    params: { path: path || undefined },
    env: {},
  };
}

describe('buildBackendUrl', () => {
  it('ghép path đơn + query', () => {
    expect(buildBackendUrl('https://be.example', 'auth/me', '?x=1')).toBe(
      'https://be.example/api/auth/me?x=1'
    );
  });

  it('ghép path nhiều segment', () => {
    expect(buildBackendUrl(DEFAULT_BACKEND_URL, ['projects', 'abc', 'tasks'], '')).toBe(
      `${DEFAULT_BACKEND_URL}/api/projects/abc/tasks`
    );
  });

  it('xử lý backend URL có dấu / thừa và path rỗng', () => {
    expect(buildBackendUrl('https://be.example///', undefined, '')).toBe('https://be.example/api');
  });
});

describe('onRequest (proxy /api → backend)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('forward GET với headers + query, loại bỏ hop-by-hop headers', async () => {
    const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await onRequest(
      makeContext('https://taskflow-8kv.pages.dev/api/health?deep=1', {
        headers: { Cookie: 'a=b', 'CF-Ray': 'xyz', Host: 'taskflow-8kv.pages.dev' },
      })
    );

    expect(res.status).toBe(200);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(calledUrl).toBe(`${DEFAULT_BACKEND_URL}/api/health?deep=1`);
    const headers = new Headers(calledInit.headers);
    expect(headers.get('cookie')).toBe('a=b');
    expect(headers.has('cf-ray')).toBe(false);
    expect(headers.has('host')).toBe(false);
  });

  it('forward POST body', async () => {
    const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await onRequest(
      makeContext('https://taskflow-8kv.pages.dev/api/auth/login', {
        method: 'POST',
        body: '{"email":"a@b.c"}',
        headers: { 'Content-Type': 'application/json' },
      })
    );

    expect(res.status).toBe(201);
    const [, calledInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(calledInit.method).toBe('POST');
    expect(new TextDecoder().decode(calledInit.body as ArrayBuffer)).toBe('{"email":"a@b.c"}');
  });

  it('GET/HEAD không mang body', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await onRequest(makeContext('https://taskflow-8kv.pages.dev/api/health'));
    const [, calledInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(calledInit.body).toBeUndefined();
  });

  it('dùng BACKEND_URL từ env binding khi có', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const ctx = makeContext('https://taskflow-8kv.pages.dev/api/auth/me');
    ctx.env = { BACKEND_URL: 'https://staging.example.com' };
    await onRequest(ctx);

    expect((fetchMock.mock.calls[0] as unknown[])[0]).toBe('https://staging.example.com/api/auth/me');
  });
});
