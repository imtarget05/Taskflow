import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

/**
 * Context breadcrumb for the shell header. Only renders where a real
 * hierarchy exists (Dashboard → Project); standalone pages show nothing.
 * On mobile the intermediate segments collapse — only the tail is shown.
 */
export default function Breadcrumbs({ projectName }: { projectName?: string | null }) {
  const location = useLocation();
  const match = location.pathname.match(/^\/projects\/([^/]+)/);

  if (!match) return null;

  const segments = [{ label: 'Dashboard', to: '/dashboard' }];
  if (projectName) {
    segments.push({ label: projectName, to: location.pathname });
  }

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-sm">
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1;
        return (
          <span key={seg.to} className="flex min-w-0 items-center gap-1">
            {i > 0 && (
              <>
                <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-ink-muted sm:block" aria-hidden="true" />
                {/* Mobile collapses middle segments: separator only */}
                {i > 0 && isLast && (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-muted sm:hidden" aria-hidden="true" />
                )}
              </>
            )}
            {isLast ? (
              <span className="max-w-[10rem] truncate font-medium text-ink sm:max-w-xs" aria-current="page">
                {seg.label}
              </span>
            ) : (
              <Link
                to={seg.to}
                className="hidden rounded px-0.5 text-ink-secondary transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:inline"
              >
                {seg.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
