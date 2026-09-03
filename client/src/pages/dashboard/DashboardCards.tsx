import { Link } from 'react-router-dom';
import { FolderKanban, Plus } from 'lucide-react';
import type { ProjectSummary } from '@/types';
import { Badge, Button, Card } from '@/components/ui';

export interface StatCardProps {
  label: string;
  value?: string;
  tone?: 'primary' | 'success' | 'warning' | 'info';
  icon?: React.ReactNode;
  delay?: number;
}

const TONE_CONFIG: Record<
  NonNullable<StatCardProps['tone']>,
  { valueTone: string; iconBg: string; iconColor: string }
> = {
  primary: {
    valueTone: 'text-primary',
    iconBg: 'bg-primaryContainer',
    iconColor: 'text-onPrimaryContainer',
  },
  success: {
    valueTone: 'text-success',
    iconBg: 'bg-success-soft',
    iconColor: 'text-success',
  },
  warning: {
    valueTone: 'text-warning',
    iconBg: 'bg-warning-soft',
    iconColor: 'text-warning',
  },
  info: {
    valueTone: 'text-info',
    iconBg: 'bg-info-soft',
    iconColor: 'text-info',
  },
};

export function StatCard({ label, value, tone = 'primary', icon, delay = 0 }: StatCardProps) {
  const cfg = TONE_CONFIG[tone];
  return (
    <Card
      variant="outlined"
      className={`animate-rise overflow-hidden p-5 bg-surfaceContainerLow border-outlineVariant/60 ${cfg.iconBg}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="type-caption font-medium tracking-wide text-ink-secondary">{label}</p>
        {icon && (
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${cfg.iconColor}`} aria-hidden="true">
            {icon}
          </span>
        )}
      </div>
      {value === undefined ? (
        <div className="mt-3 h-10 w-24 animate-pulse rounded-lg bg-surfaceContainerHighest" />
      ) : (
        <p className={`mt-3 font-display text-[32px] font-bold leading-none tracking-tight ${cfg.valueTone}`}>{value}</p>
      )}
    </Card>
  );
}

export interface ProjectCardProps {
  project: ProjectSummary;
  taskCount: number;
}

export function ProjectCard({ project, taskCount }: ProjectCardProps) {
  return (
    <Card
      variant="outlined"
      as="article"
      className="group flex flex-col p-5 transition-shadow hover:shadow-elevation2"
    >
      <div className="mb-3 flex items-center justify-between">
        <span
          className="h-1.5 w-12 rounded-full ring-1 ring-outlineVariant/60"
          style={{ backgroundColor: project.color ?? 'rgb(var(--sys-primary))' }}
          aria-hidden="true"
        />
      </div>

      <Link to={`/projects/${project.id}`} className="focus-m3-soft rounded-lg -m-1 p-1 block">
        <h3 className="type-card-title font-semibold leading-6 text-ink">{project.name}</h3>
        {project.description && (
          <p className="type-caption mt-1 line-clamp-2 text-ink-secondary">{project.description}</p>
        )}
      </Link>

      <div className="mt-4 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surfaceContainerHighest px-2.5 py-1 text-xs font-medium text-ink-secondary">
          {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
        </span>
        <Badge tone="neutral">{project.columns.length} cột</Badge>
      </div>
    </Card>
  );
}

export interface EmptyProjectStateProps {
  onCreate: () => void;
  className?: string;
}

export function EmptyProjectState({ onCreate }: EmptyProjectStateProps) {
  return (
    <Card variant="outlined" className="p-0 border-dashed border-outlineVariant/60">
      <div className="p-8 text-center">
        <FolderKanban className="mx-auto h-12 w-12 text-ink-muted" aria-hidden="true" />
        <h3 className="mt-4 type-title-large font-semibold text-ink">Chưa có dự án nào</h3>
        <p className="mt-2 type-body text-ink-secondary">Tạo dự án đầu tiên để bắt đầu quản lý công việc trên bảng Kanban.</p>
        <Button onClick={onCreate} className="mt-6 shadow-elevation1">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Tạo dự án
        </Button>
      </div>
    </Card>
  );
}