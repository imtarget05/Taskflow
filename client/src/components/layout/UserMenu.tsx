import { Avatar, Dropdown } from '@/components/ui';
import { LogOut, Monitor, Moon, Sun } from 'lucide-react';
import type { Theme } from '@/store/theme-context';
import type { User } from '@/types';

interface UserMenuProps {
  user: User | null;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onLogout: () => void;
  /** Compact rendering inside the collapsed sidebar. */
  compact?: boolean;
}

const THEME_OPTIONS: { theme: Theme; label: string; icon: React.ReactNode }[] = [
  { theme: 'light', label: 'Light', icon: <Sun className="h-4 w-4" aria-hidden="true" /> },
  { theme: 'dark', label: 'Dark', icon: <Moon className="h-4 w-4" aria-hidden="true" /> },
  { theme: 'system', label: 'System', icon: <Monitor className="h-4 w-4" aria-hidden="true" /> },
];

/**
 * Compact identity area pinned to the bottom of the sidebar. Uses only data
 * already in the auth context — no extra API calls.
 */
export default function UserMenu({ user, theme, onThemeChange, onLogout, compact }: UserMenuProps) {
  if (compact) {
    return (
      <Dropdown
        label="User menu"
        align="right"
        selectedKey={theme}
        trigger={() => (
          <button
            className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="Open user menu"
          >
            <Avatar name={user?.name ?? '?'} size="sm" />
          </button>
        )}
        items={[
          ...THEME_OPTIONS.map((opt) => ({
            key: opt.theme,
            label: opt.label,
            icon: opt.icon,
            onSelect: () => onThemeChange(opt.theme),
          })),
          { key: 'logout', label: 'Log out', icon: <LogOut className="h-4 w-4" />, onSelect: onLogout },
        ]}
      />
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Dropdown
        label="User menu"
        align="left"
        width="w-52"
        selectedKey={theme}
        trigger={(open) => (
          <button
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label={`Account menu for ${user?.name ?? 'user'}`}
            aria-expanded={open}
          >
            <Avatar name={user?.name ?? '?'} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{user?.name}</span>
              <span className="block truncate text-xs text-ink-muted">{user?.email}</span>
            </span>
          </button>
        )}
        items={[
          ...THEME_OPTIONS.map((opt) => ({
            key: opt.theme,
            label: opt.label,
            icon: opt.icon,
            description: opt.theme === theme ? 'Current' : undefined,
            onSelect: () => onThemeChange(opt.theme),
          })),
          {
            key: 'logout',
            label: 'Log out',
            icon: <LogOut className="h-4 w-4" aria-hidden="true" />,
            danger: true,
            onSelect: onLogout,
          },
        ]}
      />
    </div>
  );
}
