import { NavLink } from 'react-router-dom';
import {
  ChevronsLeft,
  ChevronsRight,
  LayoutDashboard,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';
import { Skeleton } from '@/components/ui';
import type { ProjectSummary } from '@/types';

interface AppSidebarProps {
  collapsed: boolean;
  projects?: ProjectSummary[];
  isLoading?: boolean;
  onCloseMobile: () => void;
  onToggleCollapse: () => void;
  /** Bottom area: user menu (avatar, theme, logout). */
  footer?: React.ReactNode;
}

const itemClass = ({ isActive }: { isActive: boolean }) =>
  `group relative flex items-center gap-3 rounded-xl py-2.5 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
    isActive
      ? 'bg-primaryContainer text-onPrimaryContainer'
      : 'text-ink-secondary hover:bg-surfaceContainerHighest hover:text-ink'
  }`;

/** Active indicator pill for navigation rail */
function ActiveIndicator() {
  return (
    <span
      className="absolute inset-y-1 left-0 w-1 rounded-r-full bg-primary"
      aria-hidden="true"
    />
  );
}

export default function AppSidebar({
  collapsed,
  projects,
  isLoading,
  onCloseMobile,
  onToggleCollapse,
  footer,
}: AppSidebarProps) {
  return (
    <div
      className={`flex h-full flex-col ${collapsed ? 'lg:w-16' : 'lg:w-64'}`}
    >
      {/* Brand */}
      <div
        className={`flex h-14 shrink-0 items-center border-b border-line ${
          collapsed ? 'justify-center' : 'justify-between px-4'
        }`}
      >
        <NavLink
          to="/dashboard"
          className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-lg"
          onClick={onCloseMobile}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary font-display text-sm font-bold text-onPrimary">
            T
          </span>
          {!collapsed && (
            <span className="text-sm font-bold tracking-tight">Taskflow</span>
          )}
        </NavLink>
        <button
          className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink lg:hidden"
          onClick={onCloseMobile}
          aria-label="Close menu"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Primary navigation */}
      <nav aria-label="Primary" className="min-h-0 flex-1 overflow-y-auto py-3">
        <ul className="space-y-0.5 px-3">
          <li>
            <NavLink to="/dashboard" onClick={onCloseMobile} className={itemClass} title={collapsed ? 'Dashboard' : undefined}>
              <ActiveIndicator />
              <LayoutDashboard className="h-4 w-4 shrink-0" aria-hidden="true" />
              {!collapsed && <span>Dashboard</span>}
            </NavLink>
          </li>
          <li>
            <NavLink to="/recommendations" onClick={onCloseMobile} className={itemClass} title={collapsed ? 'Đề xuất' : undefined}>
              <ActiveIndicator />
              <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
              {!collapsed && <span>Đề xuất</span>}
            </NavLink>
          </li>
        </ul>

        {!collapsed && (
          <p className="mb-1.5 mt-4 px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
            Projects
          </p>
        )}
        <ProjectList
          collapsed={collapsed}
          projects={projects}
          isLoading={isLoading}
          onCloseMobile={onCloseMobile}
        />

        <div className="mt-4 px-3">
          <NavLink to="/settings" onClick={onCloseMobile} className={itemClass} title={collapsed ? 'Settings' : undefined}>
            <ActiveIndicator />
            <Settings className="h-4 w-4 shrink-0" aria-hidden="true" />
            {!collapsed && <span>Settings</span>}
          </NavLink>
        </div>
      </nav>

      {/* User area */}
      {footer && <div className="shrink-0 border-t border-line p-3">{footer}</div>}

      {/* Collapse control */}
      <div className="hidden shrink-0 justify-center border-t border-line p-2 lg:flex">
        <button
          onClick={onToggleCollapse}
          className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
        >
          {collapsed ? (
            <ChevronsRight className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}

function ProjectList({
  collapsed,
  projects,
  isLoading,
  onCloseMobile,
}: {
  collapsed: boolean;
  projects?: ProjectSummary[];
  isLoading?: boolean;
  onCloseMobile: () => void;
}) {
  if (isLoading) {
    if (collapsed) return null;
    return (
      <div className="space-y-2 px-3 pt-1">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-3/4" />
      </div>
    );
  }
  return (
    <ul className={`space-y-0.5 ${collapsed ? 'px-3' : 'px-3'}`}>
      {(projects ?? []).map((project) => (
        <li key={project.id}>
          <NavLink
            to={`/projects/${project.id}`}
            onClick={onCloseMobile}
            title={collapsed ? project.name : undefined}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl py-2.5 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                collapsed ? 'justify-center px-0' : 'px-3'
              } ${
                isActive
                  ? 'bg-primaryContainer text-onPrimaryContainer'
                  : 'text-ink-secondary hover:bg-surfaceContainerHighest hover:text-ink'
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
      {!collapsed && (projects ?? []).length === 0 && (
        <li className="px-3 py-1 text-xs text-ink-muted">No projects yet</li>
      )}
    </ul>
  );
}

