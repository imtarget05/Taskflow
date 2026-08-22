import { AlertTriangle, CloudOff, Lock, ShieldAlert, SearchX, ServerCrash, Clock, Sparkles } from 'lucide-react';
import Button from './Button';
import { classifyApiError } from '@/lib/errors';

/**
 * Semantic API-failure categories. Classified from the actual AxiosError the
 * app receives (see lib/errors.ts) — never from guessed statuses.
 */
export type ErrorVariant =
  | 'generic'
  | 'network'
  | 'unauthorized'
  | 'forbidden'
  | 'notFound'
  | 'server'
  | 'rateLimited'
  | 'unavailable'
  | 'ai';

const VARIANTS: Record<ErrorVariant, { title: string; message: string; icon: React.ReactNode }> = {
  generic: {
    title: 'We couldn’t load this content.',
    message: 'Please try again in a moment.',
    icon: <AlertTriangle className="h-8 w-8 text-warning" aria-hidden="true" />,
  },
  network: {
    title: 'Can’t reach Taskflow right now.',
    message: 'Check your internet connection and try again.',
    icon: <CloudOff className="h-8 w-8 text-ink-muted" aria-hidden="true" />,
  },
  unauthorized: {
    title: 'Your session has expired.',
    message: 'Sign in again to continue where you left off.',
    icon: <Lock className="h-8 w-8 text-ink-muted" aria-hidden="true" />,
  },
  forbidden: {
    title: 'You don’t have permission to view this.',
    message: 'Ask a project owner to grant you access.',
    icon: <ShieldAlert className="h-8 w-8 text-warning" aria-hidden="true" />,
  },
  notFound: {
    title: 'This item no longer exists.',
    message: 'It may have been deleted or moved.',
    icon: <SearchX className="h-8 w-8 text-ink-muted" aria-hidden="true" />,
  },
  server: {
    title: 'Taskflow is having trouble loading this.',
    message: 'Our team is on it — please try again shortly.',
    icon: <ServerCrash className="h-8 w-8 text-danger" aria-hidden="true" />,
  },
  rateLimited: {
    title: 'Too many requests.',
    message: 'Please wait a moment before trying again.',
    icon: <Clock className="h-8 w-8 text-warning" aria-hidden="true" />,
  },
  unavailable: {
    title: 'Taskflow is temporarily unavailable.',
    message: 'This usually resolves within a minute. Try again shortly.',
    icon: <Clock className="h-8 w-8 text-warning" aria-hidden="true" />,
  },
  ai: {
    title: 'AI is temporarily unavailable.',
    message: 'Try again shortly.',
    icon: <Sparkles className="h-8 w-8 text-accent" aria-hidden="true" />,
  },
};

interface ErrorStateProps {
  /** Semantic category; classified automatically if you pass `error` instead. */
  variant?: ErrorVariant;
  /** Raw error (e.g. AxiosError from a failed query) — auto-classified. */
  error?: unknown;
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export default function ErrorState({
  variant,
  error,
  title,
  message,
  onRetry,
  retryLabel = 'Try again',
  className = '',
}: ErrorStateProps) {
  const resolved = variant ?? classifyApiError(error);
  const v = VARIANTS[resolved];
  return (
    <div role="alert" className={`flex flex-col items-center justify-center px-6 py-12 text-center ${className}`}>
      {v.icon}
      <h3 className="text-sm font-semibold text-ink">{title ?? v.title}</h3>
      <p className="mt-1 max-w-sm text-sm text-ink-secondary">{message ?? v.message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
