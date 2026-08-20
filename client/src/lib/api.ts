import axios, { AxiosError } from 'axios';

export const API_URL = import.meta.env.VITE_API_URL ?? '/api';

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

// Authentication is carried by httpOnly cookies; tokens never enter JS storage.
// CSRF token is stored in memory after login/register/refresh (returned in response body).
let csrfTokenMemory: string | null = null;

export function setCsrfToken(token: string): void {
  csrfTokenMemory = token;
}

export function getCsrfToken(): string | null {
  return csrfTokenMemory;
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
  await axios.post(`${API_URL}/auth/refresh`, undefined, { withCredentials: true });
  return 'cookie';
}

// Retry once with a refreshed token on 401.
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (typeof error.config & { _retry?: boolean }) | undefined;
    const isAuthEndpoint =
      original?.url?.includes('/auth/') && !original.url.includes('/auth/me');

    if (error.response?.status === 401 && original && !original._retry && !isAuthEndpoint) {
      original._retry = true;
      try {
        refreshPromise = refreshPromise ?? refreshAccessToken();
        await refreshPromise;
        refreshPromise = null;
        return api(original);
      } catch (refreshError) {
        refreshPromise = null;
        clearAuth();
        return Promise.reject(refreshError);
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

export default api;
