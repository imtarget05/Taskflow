/**
 * Cloudflare Pages Function — proxy toàn bộ /api/* tới backend Render.
 *
 * Root cause đã sửa: client production dùng VITE_API_URL=/api (same-origin)
 * nhưng trước đây không có proxy nào → mọi request /api/* bị SPA fallback
 * (_redirects "/* /index.html 200") bắt và trả về HTML thay vì JSON,
 * khiến UI loading vô hạn / không load được dữ liệu.
 *
 * Lưu ý: Pages Functions có độ ưu tiên cao hơn _redirects, nên rule SPA
 * fallback không còn nuốt các request /api/* nữa.
 *
 * Env binding (optional, đặt trong Pages dashboard → Settings → Variables):
 *   BACKEND_URL — origin của backend (mặc định: Render production URL).
 */

export const DEFAULT_BACKEND_URL = 'https://taskflow-server-n9a7.onrender.com';

/** Headers KHÔNG được forward qua proxy (hop-by-hop /Cloudflare-specific). */
const HOP_BY_HOP_HEADERS = new Set([
  'host',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'cf-connecting-ip',
  'cf-ipcountry',
  'cf-ray',
  'cf-visitor',
  'cf-worker',
  'x-forwarded-proto',
  'cdn-loop',
]);

/** Ghép path segments + query string thành URL đầy đủ tới backend. */
export function buildBackendUrl(
  backendUrl: string,
  path: string | string[] | undefined,
  search: string
): string {
  const segments = Array.isArray(path) ? path.join('/') : (path ?? '');
  const base = backendUrl.replace(/\/+$/, '');
  const suffix = segments ? `/${segments}` : '';
  return `${base}/api${suffix}${search}`;
}

interface ProxyEnv {
  BACKEND_URL?: string;
}

interface ProxyContext {
  request: Request;
  params: { path?: string | string[] };
  env: ProxyEnv;
}

async function handleRequest(context: ProxyContext): Promise<Response> {
  const backendUrl = context.env.BACKEND_URL ?? DEFAULT_BACKEND_URL;
  const requestUrl = new URL(context.request.url);

  const upstreamHeaders = new Headers();
  context.request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      upstreamHeaders.set(key, value);
    }
  });

  const method = context.request.method.toUpperCase();
  const hasBody = method !== 'GET' && method !== 'HEAD';
  const body = hasBody ? await context.request.arrayBuffer() : undefined;

  const upstreamUrl = buildBackendUrl(backendUrl, context.params.path, requestUrl.search);
  const upstreamResponse = await fetch(upstreamUrl, {
    method: context.request.method,
    headers: upstreamHeaders,
    body,
    // @ts-expect-error — redirect là option hợp lệ của Workers fetch, chỉ
    // thiếu trong lib.dom của client tsconfig (functions dir không typecheck).
    redirect: 'manual',
  });

  // Trả response gốc trực tiếp để giữ nguyên Set-Cookie (refresh token,
  // csrf_token) — tuyệt đối không re-wrap mất header nhiều giá trị.
  return upstreamResponse;
}

export const onRequest = (context: ProxyContext): Promise<Response> => handleRequest(context);
