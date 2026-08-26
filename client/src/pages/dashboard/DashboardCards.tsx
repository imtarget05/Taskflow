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
}

const TONE_TEXT: Record<NonNullable<MetricCardProps['tone']>, string> = {
  accent: 'text-accent',
  success: 'text-success',
  warning: 'text-warning',
  neutral: 'text-ink',
};

export function MetricCard({ label, value, progress, tone = 'neutral', to, toLabel }: MetricCardProps) {
  return (
    <Card className="p-4">
      <p className="type-caption font-medium text-ink-secondary">{label}</p>
      {value === undefined ? (
        <Skeleton className="mt-2 h-7 w-16" />
      ) : (
        <p className={`mt-1 text-2xl font-bold leading-8 ${TONE_TEXT[tone]}`}>{value}</p>
      )}
      {progress !== undefined && <ProgressBar value={progress} label={label} size="sm" className="mt-2" tone={progress >= 100 ? 'success' : 'accent'} />}
      {to && toLabel && (
        <Link
          to={to}
          className="type-meta mt-2 inline-block font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {toLabel}
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
  return (
    <Card variant="interactive" as="article" className="group relative p-5">
      <div className="mb-3 flex items-center justify-between">
        <span
          className="h-1.5 w-10 rounded-full"
          style={{ backgroundColor: project.color ?? 'rgb(var(--accent))' }}
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

      <h3 className="type-card-title font-semibold text-ink">
        <Link
          to={`/projects/${project.id}`}
          className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent after:absolute after:inset-0 hover:text-accent"
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
            <ProgressBar
              value={(progress.completed / progress.total) * 100}
              label={`${project.name} progress`}
              size="sm"
              tone={progress.completed >= progress.total ? 'success' : 'accent'}
            />
            <p className="type-meta mt-1.5 text-ink-muted">
              {progress.completed} of {progress.total} tasks completed
            </p>
          </>
        ) : (
          <p className="type-meta text-ink-muted">
            {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
          </p>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center -space-x-1.5">
          {project.members.slice(0, 4).map((m) => (
            <Avatar key={m.id} name={m.user.name} size="xs" className="border-2 border-surface" />
          ))}
          {project.members.length > 4 && (
            <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface bg-surface-muted text-[10px] font-semibold text-ink-muted">
              +{project.members.length - 4}
            </span>
          )}
        </div>
        <p className="type-meta text-ink-muted">{formatDistanceToNow(new Date(project.createdAt), { addSuffix: true })}</p>
      </div>
    </Card>
  );
}
