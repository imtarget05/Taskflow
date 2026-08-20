/**
 * Forward /socket.io/* (engine.io long-polling) to the API origin through the
 * same-origin proxy, carrying the same first-party auth cookie. WebSocket
 * upgrades are served as ordinary requests; the client polls instead.
 */

export interface PageEnv {
  API_ORIGIN?: string;
}

const DEFAULT_ORIGIN = 'https://taskflow-server-illy.onrender.com';

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
  return new Response(resp.body, resp);
}