import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Pencil } from 'lucide-react';
import type { ProjectSummary } from '@/types';
import { Avatar, Button, Card, ColorPopover, ProgressBar, Skeleton } from '@/components/ui';

export interface MetricCardProps {
  label: string;
  /** Rendered value; skeleton while undefined. */
  value?: string;
  progress?: number;
  icon?: React.ReactNode;
  tone?: 'accent' | 'success' | 'warning' | 'neutral';
  to?: string;
  toLabel?: string;
  /** Stagger delay for entrance animation */
  delay?: number;
}

const TONE_CONFIG: Record<
  NonNullable<MetricCardProps['tone']>,
  { iconWrap: string; valueTone: string; card: string; progress: 'accent' | 'success' }
> = {
  accent: {
    iconWrap: 'bg-primaryContainer text-onPrimaryContainer',
    valueTone: 'text-primary',
    card: 'bg-surfaceContainerLow border-outlineVariant/60',
    progress: 'accent',
  },
  success: {
    iconWrap: 'bg-success-soft text-success',
    valueTone: 'text-success',
    card: 'bg-surfaceContainerLow border-outlineVariant/60',
    progress: 'success',
  },
  warning: {
    iconWrap: 'bg-warning-soft text-warning',
    valueTone: 'text-warning',
    card: 'bg-surfaceContainerLow border-outlineVariant/60',
    progress: 'accent',
  },
  neutral: {
    iconWrap: 'bg-surfaceContainerHighest text-ink-secondary',
    valueTone: 'text-ink',
    card: 'bg-surfaceContainerLow border-outlineVariant/60',
    progress: 'accent',
  },
};

export function MetricCard({ label, value, progress, icon, tone = 'neutral', to, toLabel, delay = 0 }: MetricCardProps) {
  const cfg = TONE_CONFIG[tone];
  return (
    <Card
      variant="outlined"
      className={`animate-rise overflow-hidden p-4 ${cfg.card}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="type-caption font-medium tracking-wide text-ink-secondary">{label}</p>
        {icon && (
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${cfg.iconWrap}`}
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
      </div>
      {value === undefined ? (
        <Skeleton className="mt-3 h-8 w-20" />
      ) : (
        <p className={`mt-3 font-display text-[30px] font-bold leading-none tracking-tight ${cfg.valueTone}`}>{value}</p>
      )}
      {progress !== undefined && (
        <ProgressBar value={progress} label={label} size="sm" className="mt-3" tone={cfg.progress} />
      )}
      {to && toLabel && (
        <Link
          to={to}
          className="type-meta mt-3 inline-flex items-center gap-1 font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {toLabel} →
        </Link>
      )}
    </Card>
  );
}

export interface ProjectCardProps {
  project: ProjectSummary;
  progress?: { total: number; completed: number };
  onEdit: () => void;
  onColorChange: (color: string) => void;
}

export function ProjectCard({ project, progress, onEdit, onColorChange }: ProjectCardProps) {
  const taskCount = project.columns.reduce((sum, c) => sum + c._count.tasks, 0);
  const pct = progress && progress.total > 0 ? (progress.completed / progress.total) * 100 : 0;
  const isDone = progress ? progress.completed >= progress.total && progress.total > 0 : false;
  return (
    <Card
      variant="elevated"
      as="article"
      className="group relative flex flex-col p-5 transition-all hover:shadow-elevation3 animate-slide-up"
    >
      <div className="mb-3 flex items-center justify-between">
        <span
          className="h-1.5 w-12 rounded-full ring-1 ring-outlineVariant/60"
          style={{ backgroundColor: project.color ?? 'rgb(var(--sys-primary))' }}
          aria-hidden="true"
        />
        <span className="flex items-center gap-1">
          <ColorPopover
            value={project.color}
            onChange={(color) => {
              onColorChange(color);
            }}
            ariaLabel={`Change color of ${project.name}`}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onEdit();
            }}
            aria-label={`Edit project ${project.name}`}
            className="px-1.5 text-ink-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:text-ink"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </span>
      </div>

      <h3 className="type-card-title font-semibold leading-6 text-ink">
        <Link
          to={`/projects/${project.id}`}
          className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary after:absolute after:inset-0 hover:text-primary"
        >
          {project.name}
        </Link>
      </h3>
      {project.description && (
        <p className="type-caption mt-1 line-clamp-2 text-ink-secondary">{project.description}</p>
      )}

      {/* Progress from real analytics data */}
      <div className="mt-4">
        {progress && progress.total > 0 ? (
          <>
            <div className="flex items-center justify-between">
              <span className="type-meta font-medium text-ink-secondary">
                {progress.completed} / {progress.total}
              </span>
              <span className={`type-meta font-semibold ${isDone ? 'text-success' : 'text-primary'}`}>
                {Math.round(pct)}%
              </span>
            </div>
            <ProgressBar
              value={pct}
              label={`${project.name} progress`}
              size="sm"
              tone={isDone ? 'success' : 'accent'}
              className="mt-1.5"
            />
            <p className="type-meta mt-1.5 text-ink-muted">
              {progress.completed} of {progress.total} tasks completed
            </p>
          </>
        ) : (
          <span className="inline-flex items-center rounded-full bg-surfaceContainerHighest px-2.5 py-1 text-xs font-medium text-ink-secondary">
            {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
          </span>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-outlineVariant/50 pt-4">
        <div className="flex items-center -space-x-1.5">
          {project.members.slice(0, 4).map((m) => (
            <Avatar key={m.id} name={m.user.name} size="xs" className="border-2 border-surfaceContainerLow" />
          ))}
          {project.members.length > 4 && (
            <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-surfaceContainerLow bg-surfaceContainerHighest text-[10px] font-semibold text-ink-muted">
              +{project.members.length - 4}
            </span>
          )}
        </div>
        <p className="type-meta text-ink-muted">{formatDistanceToNow(new Date(project.createdAt), { addSuffix: true })}</p>
      </div>
    </Card>
  );
}
