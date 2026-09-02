/**
 * Pages Function reverse proxy: forwards /api/* and /socket.io/* requests to
 * the Node API origin so every request is same-origin from the browser's
 * perspective. Cookies (auth + CSRF) are then first-party on the Pages host,
 * immune to third-party cookie blocking, and the CSRF cookie (httpOnly: false)
 * can be read directly via document.cookie.
 *
 * WebSocket upgrades are intentionally NOT relayed: socket.io falls back to
 * HTTP polling through this proxy, which carries the same first-party cookies.
 */

export interface PageEnv {
  API_ORIGIN?: string;
}

const DEFAULT_ORIGIN = 'https://taskflow-server-n9a7.onrender.com';

export async function onRequest(context: { request: Request; env: PageEnv }): Promise<Response> {
  const origin = (typeof context.env?.API_ORIGIN === 'string' && context.env.API_ORIGIN) || DEFAULT_ORIGIN;
  const url = new URL(context.request.url);
  const target = new URL(url.pathname + url.search, origin);

  const headers = new Headers(context.request.headers);
  headers.delete('host');
  headers.set('x-forwarded-host', url.host);
  headers.set('x-forwarded-proto', url.protocol.replace(':', ''));
  const clientIp = context.request.headers.get('cf-connecting-ip');
  if (clientIp) {
    headers.set('x-forwarded-for', clientIp);
    headers.set('x-real-ip', clientIp);
  }

  const init: RequestInit = { method: context.request.method, headers, redirect: 'manual' };
  if (context.request.method !== 'GET' && context.request.method !== 'HEAD') {
    init.body = context.request.body;
  }

  const resp = await fetch(target.toString(), init);
  // Preserve all headers including multiple Set-Cookie (cannot use `new Response(body, resp)` —
  // the ResponseInit overload drops duplicate Set-Cookie). Clone status/headers explicitly.
  const outHeaders = new Headers(resp.headers);
  // Cloudflare's fetch may expose combined Set-Cookie as comma-joined; use getSetCookie when available.
  const setCookies: string[] =
    typeof (resp.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === 'function'
      ? (resp.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
      : resp.headers.get('set-cookie')
        ? [resp.headers.get('set-cookie') as string]
        : [];
  const out = new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers: outHeaders,
  });
  // Re-append each Set-Cookie individually when the runtime supports it.
  if (setCookies.length > 1) {
    out.headers.delete('set-cookie');
    for (const c of setCookies) out.headers.append('set-cookie', c);
  }
  return out;
}