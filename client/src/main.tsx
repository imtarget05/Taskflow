import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from './components/ErrorBoundary';
import App from './App';
import { AuthProvider } from './store/auth';
import { AgentProvider } from './store/agent';
import { ThemeProvider } from './store/theme';
import { ToastProvider } from './components/ui';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 60_000, gcTime: 5 * 60_000, refetchOnWindowFocus: false },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <AgentProvider>
              <BrowserRouter>
                <ErrorBoundary>
                  <App />
                </ErrorBoundary>
              </BrowserRouter>
            </AgentProvider>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>
);

// PWA: register the offline-shell service worker (production only — the dev
// server's HMR/websocket flow conflicts with SW interception).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline support is best-effort */
    });
  });
}