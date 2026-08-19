import { useState } from 'react';
import { LogOut, Monitor, Moon, Sun } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/store/theme-context';
import { useToast } from '@/store/toast';
import { Avatar, Button, ConfirmDialog } from '@/components/ui';

const THEMES = [
  { value: 'light' as const, label: 'Light', icon: Sun },
  { value: 'dark' as const, label: 'Dark', icon: Moon },
  { value: 'system' as const, label: 'System', icon: Monitor },
];

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const [confirmLogout, setConfirmLogout] = useState(false);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:px-8">
      <h1 className="text-xl font-semibold">Settings</h1>
      <p className="mt-0.5 text-sm text-ink-secondary">Manage your account and preferences.</p>

      <section className="card mt-6 p-5" aria-labelledby="account-heading">
        <h2 id="account-heading" className="text-sm font-semibold">Account</h2>
        <div className="mt-4 flex items-center gap-3">
          <Avatar name={user?.name ?? '?'} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{user?.name}</p>
            <p className="truncate text-xs text-ink-muted">{user?.email}</p>
          </div>
        </div>
      </section>

      <section className="card mt-4 p-5" aria-labelledby="appearance-heading">
        <h2 id="appearance-heading" className="text-sm font-semibold">Appearance</h2>
        <p className="mt-1 text-xs text-ink-muted">Choose how TaskFlow looks on this device.</p>
        <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Theme">
          {THEMES.map(({ value, label, icon: Icon }) => (
            <Button
              key={value}
              variant={theme === value ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => {
                setTheme(value);
                toast('success', `Theme set to ${label.toLowerCase()}`);
              }}
              aria-pressed={theme === value}
              role="radio"
              aria-checked={theme === value}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </Button>
          ))}
        </div>
      </section>

      <section className="card mt-4 p-5" aria-labelledby="session-heading">
        <h2 id="session-heading" className="text-sm font-semibold text-danger">Session</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Sign out of this device. You can sign back in anytime.
        </p>
        <Button variant="danger" size="sm" className="mt-3" onClick={() => setConfirmLogout(true)}>
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Log out
        </Button>
      </section>

      <ConfirmDialog
        open={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        onConfirm={() => void logout()}
        title="Log out?"
        message="You will need to sign in again to access your boards."
        confirmLabel="Log out"
        tone="primary"
      />
    </div>
  );
}