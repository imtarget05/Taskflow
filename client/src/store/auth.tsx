import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import api, { clearAuth, setCsrfToken } from '@/lib/api';
import type { AuthResponse, User } from '@/types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function bootstrap() {
      try { const res = await api.get('/auth/me'); setUser(res.data.user); } catch { /* anonymous */ }
      setLoading(false);
    }
    void bootstrap();
  }, []);

  async function login(email: string, password: string) {
    const res = await api.post<AuthResponse>('/auth/login', { email, password });
    setUser(res.data.user);
    if (res.data.csrfToken) setCsrfToken(res.data.csrfToken);
  }

  async function register(name: string, email: string, password: string) {
    const res = await api.post<AuthResponse>('/auth/register', { name, email, password });
    setUser(res.data.user);
    if (res.data.csrfToken) setCsrfToken(res.data.csrfToken);
  }

  async function logout() {
    try {
      await api.post('/auth/logout');
    } catch {
      // Best effort.
    }
    clearAuth();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
