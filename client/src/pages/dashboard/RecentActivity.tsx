import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Activity as ActivityIcon, Clock3 } from 'lucide-react';
import type { Activity, ProjectSummary } from '@/types';
import { Avatar, Card } from '@/components/ui';

export interface RecentActivitySectionProps {
  activities: (Activity & { projectName?: string })[];
  currentUserName?: string;
}

/**
 * "Recent activity" feed on the dashboard — real cross-project events from
 * GET /api/activities, rendered as a two-column list with links to boards.
 */
export function RecentActivitySection({ activities, currentUserName }: RecentActivitySectionProps) {
  if (activities.length === 0) return null;

  return (
    <section aria-labelledby="activity-title" className="mt-10">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primaryContainer text-onPrimaryContainer">
          <ActivityIcon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <h2 id="activity-title" className="text-base font-semibold leading-5 text-ink">
            Recent activity
          </h2>
          <p className="type-meta text-ink-muted">What happened across your projects lately.</p>
        </div>
      </div>
      <Card variant="outlined" className="mt-4 overflow-hidden border-outlineVariant/60 bg-surfaceContainerLow">
        <ul className="divide-y divide-outlineVariant/40">
          {activities.map((activity) => (
            <li
              key={activity.id}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surfaceContainerHighest/60"
            >
              <Avatar name={activity.user.name} size="xs" className="shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm leading-5 text-ink-secondary">
                  <span className="font-semibold text-ink">
                    {activity.user.name === currentUserName ? 'You' : activity.user.name}
                  </span>{' '}
                  <span className="text-ink-muted">{activity.action.replace(/_/g, ' ').toLowerCase()}</span>
                  {' in '}
                  <Link
                    to={`/projects/${activity.projectId}`}
                    className="font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {activity.projectName}
                  </Link>
                  {activity.metadata && 'title' in activity.metadata && typeof activity.metadata.title === 'string' && (
                    <span className="font-medium text-ink"> · {activity.metadata.title}</span>
                  )}
                </p>
              </div>
              <span className="hidden shrink-0 items-center gap-1 text-xs text-ink-muted sm:flex">
                <Clock3 className="h-3 w-3" aria-hidden="true" />
                {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

/** Skeleton grid shown while the projects query loads. */
export function ProjectsLoadingGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <Card key={i} variant="outlined" className="space-y-3 border-outlineVariant/60 bg-surfaceContainerLow p-5">
          <div className="h-1.5 w-12 animate-pulse rounded-full bg-surfaceContainerHighest" />
          <div className="h-5 w-3/4 animate-pulse rounded-lg bg-surfaceContainerHighest" />
          <div className="h-4 w-full animate-pulse rounded-lg bg-surfaceContainerHighest" />
          <div className="h-1.5 w-full animate-pulse rounded-full bg-surfaceContainerHighest" />
        </Card>
      ))}
    </div>
  );
}

export type { ProjectSummary };
