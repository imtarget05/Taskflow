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
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-line bg-surface p-10 lg:flex xl:p-14" aria-hidden="true">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-accent-soft opacity-70 blur-3xl motion-reduce:hidden" />
        <Link to="/" className="relative flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">T</span>
          <span className="text-lg font-bold tracking-tight">Taskflow</span>
        </Link>
        <div className="relative max-w-md">
          <h2 className="type-page-title text-balance">
            Plan projects clearly.{' '}
            <span className="text-accent">Move work forward</span> together.
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
          <Link to="/" className="mb-8 flex items-center justify-center gap-2 lg:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">T</span>
            <span className="text-lg font-bold tracking-tight">Taskflow</span>
          </Link>
          <div className="card p-6 sm:p-8">
            <h1 className="type-page-title text-ink">{title}</h1>
            {subtitle && <p className="type-caption mt-1 text-ink-secondary">{subtitle}</p>}
            <div className="mt-6">{children}</div>
          </div>
        </div>
      </main>
    </div>
  );
}
