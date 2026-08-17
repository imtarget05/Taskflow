import axios, { AxiosError } from 'axios';

const API_URL = import.meta.env.VITE_API_URL ?? '/api';

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

// Attach access token on every request.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export interface RefreshResponse {
  success: boolean;
  accessToken: string;
  refreshToken: string;
}

let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) throw new Error('No refresh token');

  const res = await axios.post<RefreshResponse>(`${API_URL}/auth/refresh`, { refreshToken });
  localStorage.setItem('access_token', res.data.accessToken);
  localStorage.setItem('refresh_token', res.data.refreshToken);
  return res.data.accessToken;
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
        const token = localStorage.getItem('access_token');
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch (refreshError) {
        refreshPromise = null;
        clearAuth();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);

export function setAuth(accessToken: string, refreshToken: string): void {
  localStorage.setItem('access_token', accessToken);
  localStorage.setItem('refresh_token', refreshToken);
}

export function clearAuth(): void {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
}

export function getAccessToken(): string | null {
  return localStorage.getItem('access_token');
}

export default api;
