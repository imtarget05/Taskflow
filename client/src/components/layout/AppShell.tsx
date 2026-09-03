import { lazy, Suspense, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Bot, Menu, Monitor, Moon, Search, Sun } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { useProjects } from '@/hooks/useProjects';
import { useTheme, type Theme } from '@/store/theme-context';
import { useAgent } from '@/store/agent';
import AppSidebar from './AppSidebar';
import UserMenu from './UserMenu';
import Breadcrumbs from './Breadcrumbs';

const CommandPalette = lazy(() => import('./CommandPalette'));
const ChatBox = lazy(() => import('../agent/ChatBox'));

interface AppShellProps {
  children: React.ReactNode;
}

const THEME_ICONS: Record<Theme, React.ReactNode> = {
  light: <Sun className="h-4 w-4" aria-hidden="true" />,
  dark: <Moon className="h-4 w-4" aria-hidden="true" />,
  system: <Monitor className="h-4 w-4" aria-hidden="true" />,
};

function shellSidebarClass(open: boolean) {
  const base =
    'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-outlineVariant bg-surfaceContainerLow transition-[width,transform] duration-500 ease-[cubic-bezier(0.2,0,0,1)] lg:static lg:translate-x-0';
  if (open) return `${base} w-72 translate-x-0 shadow-elevation2 lg:shadow-none`;
  return `${base} -translate-x-full lg:w-auto lg:translate-x-0`;
}

export default function AppShell({ children }: AppShellProps) {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const { data: projects, isLoading } = useProjects();
  const { theme, setTheme } = useTheme();
  const { open: agentOpen, setOpen: setAgentOpen } = useAgent();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('taskflow-sidebar') === 'collapsed');
  const [searchOpen, setSearchOpen] = useState(false);

  // Prevent cross-user cache leaks: drop all cached queries once signed out.
  useEffect(() => {
    if (!user) queryClient.clear();
  }, [user, queryClient]);

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      localStorage.setItem('taskflow-sidebar', v ? 'expanded' : 'collapsed');
      return !v;
    });
  };

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const nextTheme: Theme = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
  const sidebarClass = shellSidebarClass(mobileOpen);

  // Breadcrumb context: Dashboard → Project (only where a real hierarchy exists).
  const location = useLocation();
  const projectIdMatch = location.pathname.match(/^\/projects\/([^/]+)/);
  const breadcrumbProjectName = projectIdMatch
    ? (projects ?? []).find((p) => p.id === projectIdMatch[1])?.name ?? null
    : null;

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-ink">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <nav className={sidebarClass} aria-label="Primary">
        <AppSidebar
          collapsed={collapsed}
          projects={projects}
          isLoading={isLoading}
          onCloseMobile={() => setMobileOpen(false)}
          onToggleCollapse={toggleCollapsed}
          footer={
            collapsed ? (
              <UserMenu
                compact
                user={user}
                theme={theme}
                onThemeChange={setTheme}
                onLogout={() => void logout()}
              />
            ) : (
              <div className="flex items-center gap-2">
                <UserMenu
                  user={user}
                  theme={theme}
                  onThemeChange={setTheme}
                  onLogout={() => void logout()}
                />
              </div>
            )
          }
        />
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-outlineVariant bg-surfaceContainer px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              className="rounded-full p-2 text-ink-muted transition-colors hover:bg-surfaceContainerHigh hover:text-ink focus-m3 lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
              aria-expanded={mobileOpen}
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              onClick={() => setSearchOpen(true)}
              className="hidden items-center gap-2 rounded-full border border-outlineVariant bg-surfaceContainerHigh px-4 py-2 text-sm text-ink-muted shadow-elevation1 transition-colors hover:bg-surfaceContainerHighest hover:text-ink focus-m3 sm:flex"
              aria-label="Search tasks and projects (Cmd+K)"
            >
              <Search className="h-5 w-5" aria-hidden="true" />
              <span className="hidden md:inline">Search…</span>
              <kbd className="rounded-full bg-surfaceContainer px-1.5 py-0.5 text-[10px] font-semibold">
                ⌘K
              </kbd>
            </button>
            <button
              className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink focus-m3 sm:hidden"
              onClick={() => setSearchOpen(true)}
              aria-label="Search tasks and projects"
            >
              <Search className="h-5 w-5" aria-hidden="true" />
            </button>
            <Breadcrumbs projectName={breadcrumbProjectName} />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              className={`relative rounded-full p-2.5 transition-colors focus-m3 ${
                agentOpen
                  ? 'bg-primaryContainer text-onPrimaryContainer shadow-elevation1'
                  : 'text-ink-muted hover:bg-surfaceContainerHigh hover:text-ink'
              }`}
              onClick={() => setAgentOpen(!agentOpen)}
              aria-label={agentOpen ? 'Close AI assistant' : 'Open AI assistant'}
              aria-expanded={agentOpen}
              title={agentOpen ? 'Đóng AI' : 'Mở AI Assistant'}
            >
              <Bot className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              className="rounded-full p-2.5 text-ink-muted transition-colors hover:bg-surfaceContainerHigh hover:text-ink focus-m3"
              onClick={() => setTheme(nextTheme)}
              aria-label={`Switch theme (current: ${theme})`}
            >
              {THEME_ICONS[nextTheme]}
            </button>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>

      <Suspense fallback={null}>
        <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
      </Suspense>
      <Suspense fallback={null}>
        <ChatBox />
      </Suspense>
    </div>
  );
}