import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './store/auth';
import AppShell from './components/layout/AppShell';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import BoardPage from './pages/BoardPage';
import { Skeleton } from './components/ui';

const SettingsPage = lazy(() => import('./pages/SettingsPage'));

function ProtectedRoute() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex h-screen flex-col gap-3 bg-bg p-6">
        <Skeleton className="h-14 w-full" />
        <div className="flex flex-1 gap-3">
          <Skeleton className="hidden w-64 md:block" />
          <Skeleton className="flex-1" />
        </div>
      </div>
    );
  }
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}

function GuestRoute() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/" replace /> : <Outlet />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<GuestRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route
          element={
            <AppShell>
              <Outlet />
            </AppShell>
          }
        >
          <Route path="/" element={<DashboardPage />} />
          <Route path="/projects/:projectId" element={<BoardPage />} />
          <Route path="/settings" element={
                <Suspense fallback={<Skeleton className="mx-auto mt-8 h-40 w-full max-w-2xl" />}>
                  <SettingsPage />
                </Suspense>
              } />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}