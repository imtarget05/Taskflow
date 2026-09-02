import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

const VALUE_POINTS = [
  'Boards, tasks, and conversations in one calm workspace',
  'Real-time updates for your whole team',
  'An AI assistant that helps you plan before you commit',
];

/**
 * Split auth layout: value panel on desktop, auth-first on mobile.
 * Purely presentational — no auth logic lives here.
 */
export default function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className="grid min-h-screen bg-bg lg:grid-cols-[1.1fr_1fr]">
      {/* Value panel — desktop only */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-primaryContainer/30 via-surface to-secondaryContainer/20 p-10 lg:flex xl:p-14" aria-hidden="true">
        <div className="pointer-events-none absolute -right-32 -top-32 h-[500px] w-[500px] rounded-full bg-primary/5 blur-3xl motion-reduce:hidden" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-tertiary/10 blur-3xl motion-reduce:hidden" />
        <Link to="/" className="relative flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary font-display text-sm font-bold text-onPrimary">T</span>
          <span className="text-lg font-bold tracking-tight font-display">Taskflow</span>
        </Link>
        <div className="relative max-w-md">
          <h2 className="type-page-title text-balance">
            Plan projects clearly.{' '}
            <span className="bg-gradient-to-r from-primary to-tertiary bg-clip-text text-transparent">Move work forward</span> together.
          </h2>
          <ul className="mt-6 space-y-3">
            {VALUE_POINTS.map((point) => (
              <li key={point} className="flex items-start gap-2.5 type-body text-ink-secondary">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <p className="type-meta relative text-ink-muted">Free to start · Works in your browser</p>
      </aside>

      {/* Auth card */}
      <main className="flex flex-col items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md">
          {/* Compact brand for mobile (value panel is hidden) */}
          <Link to="/" className="mb-8 flex items-center justify-center gap-2.5 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary font-display text-sm font-bold text-onPrimary">T</span>
            <span className="text-lg font-bold tracking-tight font-display">Taskflow</span>
          </Link>
          <div className="rounded-2xl bg-surfaceContainerLow p-6 shadow-elevation1 sm:p-8">
            <h1 className="type-page-title text-ink">{title}</h1>
            {subtitle && <p className="type-caption mt-1 text-ink-secondary">{subtitle}</p>}
            <div className="mt-6">{children}</div>
          </div>
        </div>
      </main>
    </div>
  );
}
