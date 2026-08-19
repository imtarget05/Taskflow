import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CalendarDays, MessageSquare } from 'lucide-react';
import { Avatar, Badge } from '@/components/ui';
import { isOverdue } from '@/lib/time';
import type { Task, TaskPriority } from '@/types';

const PRIORITY_TONE: Record<TaskPriority, 'neutral' | 'info' | 'warning' | 'danger'> = {
  LOW: 'neutral',
  MEDIUM: 'info',
  HIGH: 'warning',
  URGENT: 'danger',
};

interface TaskCardProps {
  task: Task;
  onClick?: () => void;
}

export default function TaskCard({ task, onClick }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const overdue = isOverdue(task.dueDate);
  const commentCount = task.comments?.length ?? 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
      className={`card mb-2 cursor-grab select-none p-3 transition-shadow hover:shadow-card-hover active:cursor-grabbing ${
        isDragging ? 'opacity-50 ring-2 ring-accent' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-sm font-medium leading-snug text-ink">{task.title}</p>
        <Badge tone={PRIORITY_TONE[task.priority]} className="uppercase tracking-wide">
          {task.priority}
        </Badge>
      </div>

      {task.description && (
        <p className="mt-1 line-clamp-2 text-xs text-ink-secondary">{task.description}</p>
      )}

      {task.dueDate && (
        <p
          className={`mt-2 flex items-center gap-1 text-xs ${
            overdue ? 'font-medium text-danger' : 'text-ink-muted'
          }`}
        >
          <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
          {overdue
            ? `Overdue ${new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
            : `Due ${new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
        </p>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        {commentCount > 0 ? (
          <span className="flex items-center gap-1 text-xs text-ink-muted">
            <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
            {commentCount}
          </span>
        ) : (
          <span />
        )}
        {task.assignments.length > 0 && (
          <div className="flex items-center -space-x-1.5">
            {task.assignments.slice(0, 3).map((a) => (
              <Avatar key={a.id} name={a.user.name} size="xs" className="border-2 border-surface" />
            ))}
            {task.assignments.length > 3 && (
              <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface bg-surface-2 text-[10px] font-semibold text-ink-secondary">
                +{task.assignments.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}