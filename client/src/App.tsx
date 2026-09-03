import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './store/auth';
import AppShell from './components/layout/AppShell';
import { Skeleton } from './components/ui';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const LandingPage = lazy(() => import('./pages/LandingPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const BoardPage = lazy(() => import('./pages/BoardPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const RecommendationsPage = lazy(() => import('./pages/RecommendationsPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

// Supply Chain pages
const ScDashboardPage = lazy(() => import('./pages/supply-chain/ScDashboardPage'));
const OrdersPage = lazy(() => import('./pages/supply-chain/OrdersPage'));
const SuppliersPage = lazy(() => import('./pages/supply-chain/SuppliersPage'));
const InventoryPage = lazy(() => import('./pages/supply-chain/InventoryPage'));
const ScNlpPage = lazy(() => import('./pages/supply-chain/ScNlpPage'));

// Integrations + AI pages
const IntegrationsPage = lazy(() => import('./pages/integrations/IntegrationsPage'));
const ModelsPage = lazy(() => import('./pages/ai/ModelsPage'));
const PromptsPage = lazy(() => import('./pages/ai/PromptsPage'));
const ExperimentsPage = lazy(() => import('./pages/ai/ExperimentsPage'));
const EvaluationPage = lazy(() => import('./pages/ai/EvaluationPage'));

function pageFallback() {
  return (
    <div className="flex h-full flex-col gap-3 p-6">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-72" />
      <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  );
}

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

function guestFallback() {
  return (
    <div className="grid min-h-screen place-items-center bg-bg p-6">
      <div className="w-full max-w-md space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    </div>
  );
}

function GuestRoute() {
  const { user, loading } = useAuth();
  if (loading) return guestFallback();
  return user ? <Navigate to="/dashboard" replace /> : <Outlet />;
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <Suspense fallback={<Skeleton className="mx-auto mt-8 h-40 w-full max-w-2xl" />}>
            <LandingPage />
          </Suspense>
        }
      />
      <Route element={<GuestRoute />}>
        <Route
          path="/login"
          element={
            <Suspense fallback={guestFallback()}>
              <LoginPage />
            </Suspense>
          }
        />
        <Route
          path="/register"
          element={
            <Suspense fallback={guestFallback()}>
              <RegisterPage />
            </Suspense>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <Suspense fallback={guestFallback()}>
              <ForgotPasswordPage />
            </Suspense>
          }
        />
        <Route
          path="/reset-password"
          element={
            <Suspense fallback={guestFallback()}>
              <ResetPasswordPage />
            </Suspense>
          }
        />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route
          element={
            <AppShell>
              <Outlet />
            </AppShell>
          }
        >
          <Route
            path="/dashboard"
            element={
              <Suspense fallback={pageFallback()}>
                <DashboardPage />
              </Suspense>
            }
          />
          <Route
            path="/projects/:projectId"
            element={
              <Suspense fallback={pageFallback()}>
                <BoardPage />
              </Suspense>
            }
          />
          <Route
            path="/recommendations"
            element={
              <Suspense fallback={pageFallback()}>
                <RecommendationsPage />
              </Suspense>
            }
          />
          <Route
            path="/supply-chain"
            element={<Suspense fallback={pageFallback()}><ScDashboardPage /></Suspense>}
          />
          <Route
            path="/supply-chain/orders"
            element={<Suspense fallback={pageFallback()}><OrdersPage /></Suspense>}
          />
          <Route
            path="/supply-chain/suppliers"
            element={<Suspense fallback={pageFallback()}><SuppliersPage /></Suspense>}
          />
          <Route
            path="/supply-chain/inventory"
            element={<Suspense fallback={pageFallback()}><InventoryPage /></Suspense>}
          />
          <Route
            path="/supply-chain/nlp"
            element={<Suspense fallback={pageFallback()}><ScNlpPage /></Suspense>}
          />
          <Route
            path="/integrations"
            element={<Suspense fallback={pageFallback()}><IntegrationsPage /></Suspense>}
          />
          <Route
            path="/ai/models"
            element={<Suspense fallback={pageFallback()}><ModelsPage /></Suspense>}
          />
          <Route
            path="/ai/prompts"
            element={<Suspense fallback={pageFallback()}><PromptsPage /></Suspense>}
          />
          <Route
            path="/ai/experiments"
            element={<Suspense fallback={pageFallback()}><ExperimentsPage /></Suspense>}
          />
          <Route
            path="/ai/evaluation"
            element={<Suspense fallback={pageFallback()}><EvaluationPage /></Suspense>}
          />
          <Route
            path="/settings"
            element={
              <Suspense fallback={<Skeleton className="mx-auto mt-8 h-40 w-full max-w-2xl" />}>
                <SettingsPage />
              </Suspense>
            }
          />
        </Route>
      </Route>
      <Route
        path="*"
        element={
          <Suspense fallback={null}>
            <NotFoundPage />
          </Suspense>
        }
      />
    </Routes>
  );
}