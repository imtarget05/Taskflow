import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import type { Activity, ProjectSummary } from '@/types';
import { Card } from '@/components/ui';

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
      <div className="flex items-baseline justify-between">
        <h2 id="activity-title" className="text-base font-semibold text-ink">
          Recent activity
        </h2>
        <p className="type-meta text-ink-muted">What happened across your projects lately.</p>
      </div>
      <Card className="mt-4 p-4">
        <ul className="grid gap-x-6 gap-y-2 md:grid-cols-2">
          {activities.map((activity) => (
            <li key={activity.id} className="flex min-w-0 items-baseline gap-1.5 text-xs text-ink-secondary">
              <span className="font-medium text-ink">
                {activity.user.name === currentUserName ? 'You' : activity.user.name}
              </span>{' '}
              {activity.action.replace(/_/g, ' ').toLowerCase()}
              {'in '}
              <Link
                to={`/projects/${activity.projectId}`}
                className="truncate font-medium text-accent hover:underline"
              >
                {activity.projectName}
              </Link>
              {activity.metadata && 'title' in activity.metadata && typeof activity.metadata.title === 'string' && (
                <span className="truncate font-medium text-ink"> · {activity.metadata.title}</span>
              )}
              <span className="ml-auto shrink-0 text-[10px] text-ink-muted">
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
        <Card key={i} className="space-y-3 p-5">
          <div className="h-1.5 w-10 animate-pulse rounded-full bg-surface-2" />
          <div className="h-5 w-3/4 animate-pulse rounded bg-surface-2" />
          <div className="h-4 w-full animate-pulse rounded bg-surface-2" />
        </Card>
      ))}
    </div>
  );
}

export type { ProjectSummary };
