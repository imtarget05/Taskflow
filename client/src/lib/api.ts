import axios, { AxiosError } from 'axios';

export const API_URL = import.meta.env.VITE_API_URL ?? '/api';

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

// Authentication is carried by httpOnly cookies; tokens never enter JS storage.
// In production the Pages Function proxy makes the API same-origin, so the
// csrf_token cookie (httpOnly: false) can be read straight from document.cookie.
// In local dev (cross-origin) we fall back to the value echoed in response bodies.
let csrfTokenMemory: string | null = null;

function csrfFromCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function setCsrfToken(token: string): void {
  csrfTokenMemory = token;
}

export function getCsrfToken(): string | null {
  return csrfFromCookie() ?? csrfTokenMemory;
}

export function clearCsrfToken(): void {
  csrfTokenMemory = null;
}

// Double-submit CSRF: echo the stored csrf_token on mutation requests so the
// server can verify the request originates from our own client.
api.interceptors.request.use((config) => {
  const method = config.method?.toLowerCase();
  if (method && !['get', 'head', 'options'].includes(method)) {
    const token = getCsrfToken();
    if (token) {
      config.headers.set('X-CSRF-Token', token);
    }
  }
  return config;
});

let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const { data } = await axios.post<{ csrfToken?: string }>(`${API_URL}/auth/refresh`, undefined, { withCredentials: true });
  // Refresh rotates the CSRF cookie; keep the in-memory token in sync.
  if (data?.csrfToken) setCsrfToken(data.csrfToken);
  return 'cookie';
}

// Retry once with a refreshed token on 401; re-sync and retry once on CSRF 403.
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (typeof error.config & { _retry?: boolean; _csrfRetry?: boolean }) | undefined;
    if (!original) return Promise.reject(error);
    // /auth/me (session bootstrap) must NOT trigger the refresh+redirect flow:
    // a 401 there just means "anonymous" — AuthProvider handles it. Retrying
    // caused an infinite reload loop on /login (refresh 400 → redirect).
    const isAuthEndpoint =
      original.url?.includes('/auth/') && !original.url.includes('/auth/csrf');

    if (error.response?.status === 401 && !original._retry && !isAuthEndpoint) {
      original._retry = true;
      try {
        refreshPromise = refreshPromise ?? refreshAccessToken();
        await refreshPromise;
        refreshPromise = null;
        return api(original);
      } catch (refreshError) {
        refreshPromise = null;
        clearAuth();
        // Only bounce to /login when we're on an app page. Redirecting from
        // the login/register pages themselves caused an infinite reload loop
        // (guest page mounts providers → 401 → refresh 400 → redirect).
        const path = typeof window !== 'undefined' ? window.location.pathname : '/';
        if (!path.startsWith('/login') && !path.startsWith('/register')) {
          if (typeof window !== 'undefined') {
            window.location.href = '/login?reason=session_expired';
          }
        }
        return Promise.reject(refreshError);
      }
    }

    if (error.response?.status === 403 && !original._csrfRetry && !isAuthEndpoint) {
      original._csrfRetry = true;
      try {
        const { data } = await axios.get<{ csrfToken?: string }>(`${API_URL}/auth/me`, { withCredentials: true });
        if (data?.csrfToken) setCsrfToken(data.csrfToken);
        return api(original);
      } catch {
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  }
);

export function setAuth(): void {}

export function clearAuth(): void {
  clearCsrfToken();
}

export function getAccessToken(): string | null {
  return null;
}

export interface ForgotPasswordResponse {
  success: boolean;
  message: string;
  resetToken?: string;
}

export async function forgotPassword(email: string): Promise<ForgotPasswordResponse> {
  const { data } = await api.post<ForgotPasswordResponse>('/auth/forgot-password', { email });
  return data;
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await api.post('/auth/reset-password', { token, newPassword });
}

export default api;
