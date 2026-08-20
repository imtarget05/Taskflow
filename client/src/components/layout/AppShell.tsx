import { lazy, Suspense, useEffect, useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CheckSquare, ChevronsLeft, ChevronsRight, FolderKanban, Settings, Sun, Moon, X, LogOut, Monitor, Search, Sparkles } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { useProjects } from '@/hooks/useProjects';
import { useTheme, type Theme } from '@/store/theme-context';
import { useAgent } from '@/store/agent';
import { Avatar, Button, Skeleton } from '@/components/ui';

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

function sidebarClass(open: boolean, collapsed: boolean) {
  const base =
    'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-line bg-surface transition-[width,transform] duration-200 ease-out lg:static lg:translate-x-0';
  if (open) return `${base} w-72 translate-x-0 shadow-modal lg:shadow-none`;
  if (collapsed) return `${base} w-16 -translate-x-full lg:translate-x-0`;
  return `${base} w-72 -translate-x-full lg:translate-x-0`;
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
  const sidebar = sidebarClass(mobileOpen, collapsed);
  const navItems = collapsed ? 'items-center px-3' : 'px-3';

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

      <nav className={sidebar} aria-label="Primary">
        <div className={`flex h-14 shrink-0 items-center border-b border-line ${collapsed ? 'justify-center' : 'justify-between px-4'}`}>
          <Link to="/" className="flex items-center gap-2" onClick={() => setMobileOpen(false)}>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white">
              <CheckSquare className="h-4 w-4" aria-hidden="true" />
            </span>
            {!collapsed && <span className="text-sm font-bold tracking-tight">TaskFlow</span>}
          </Link>
          <button
            className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-3">
          {isLoading ? (
            <div className="space-y-2 px-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-3/4" />
            </div>
          ) : (
            <>
              <p className={`mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-muted ${navItems}`}>
                Projects
              </p>
              {projects && projects.length > 0 ? (
                <ul className="space-y-0.5">
                  {projects.map((project) => (
                    <li key={project.id}>
                      <NavLink
                        to={`/projects/${project.id}`}
                        onClick={() => setMobileOpen(false)}
                        title={collapsed ? project.name : undefined}
                        className={({ isActive }) =>
                          `flex items-center gap-2.5 rounded-lg py-2 text-sm transition-colors ${
                            collapsed ? 'justify-center px-0 text-center' : 'px-3'
                          } ${
                            isActive
                              ? 'bg-accent-soft font-medium text-accent-ink'
                              : 'text-ink-secondary hover:bg-surface-2 hover:text-ink'
                          }`
                        }
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: project.color ?? 'rgb(var(--accent))' }}
                          aria-hidden="true"
                        />
                        {!collapsed && <span className="truncate">{project.name}</span>}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              ) : (
                !collapsed && <p className="px-3 text-xs text-ink-muted">No projects yet</p>
              )}
            </>
          )}

          <div className={`mt-4 ${navItems}`}>
            <NavLink
              to="/settings"
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg py-2 text-sm transition-colors ${
                  collapsed ? 'justify-center' : 'px-3'
                } ${isActive ? 'bg-accent-soft font-medium text-accent-ink' : 'text-ink-secondary hover:bg-surface-2 hover:text-ink'}`
              }
            >
              <Settings className="h-4 w-4 shrink-0" aria-hidden="true" />
              {!collapsed && <span>Settings</span>}
            </NavLink>
          </div>
        </div>

        <div className={`shrink-0 border-t border-line p-3 ${collapsed ? 'flex justify-center' : 'flex items-center gap-2'}`}>
          <Avatar name={user?.name ?? '?'} size="sm" />
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user?.name}</p>
              <p className="truncate text-xs text-ink-muted">{user?.email}</p>
            </div>
          )}
          <button
            onClick={toggleCollapsed}
            className="hidden rounded-md p-1.5 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink lg:block"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <ChevronsRight className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-4">
          <div className="flex items-center gap-3">
            <button
              className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <FolderKanban className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              onClick={() => setSearchOpen(true)}
              className="hidden items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink sm:flex"
              aria-label="Search tasks and projects (Cmd+K)"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              <span className="hidden md:inline">Search…</span>
              <kbd className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold">
                ⌘K
              </kbd>
            </button>
            <button
              className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink sm:hidden"
              onClick={() => setSearchOpen(true)}
              aria-label="Search tasks and projects"
            >
              <Search className="h-5 w-5" aria-hidden="true" />
            </button>
            <span className="hidden text-sm font-medium text-ink-secondary lg:inline">
              {user?.email ?? ''}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
              onClick={() => setAgentOpen(!agentOpen)}
              aria-label={agentOpen ? 'Close AI assistant' : 'Open AI assistant'}
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
              onClick={() => setTheme(nextTheme)}
              aria-label={`Switch theme (current: ${theme})`}
            >
              {THEME_ICONS[nextTheme]}
            </button>
            <Button variant="ghost" size="sm" onClick={() => void logout()}>
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Log out</span>
            </Button>
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