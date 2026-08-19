import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CalendarDays, Check, MessageSquare } from 'lucide-react';
import { Avatar, Badge } from '@/components/ui';
import { useUpdateTask } from '@/hooks/useProjects';
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
  disabled?: boolean;
}

export default function TaskCard({ task, onClick, disabled = false }: TaskCardProps) {
  const updateTask = useUpdateTask(task.projectId);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const overdue = isOverdue(task.dueDate);
  const commentCount = task.comments?.length ?? 0;

  function toggleComplete(e: React.MouseEvent | React.KeyboardEvent) {
    e.stopPropagation();
    e.preventDefault();
    void updateTask.mutateAsync({ taskId: task.id, updates: { completed: !task.completed } });
  }

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
        if ((e.key === 'Enter' || e.key === ' ') && onClick && !disabled) {
          e.preventDefault();
          onClick();
        }
      }}
      className={`card mb-2 p-3 transition-shadow hover:shadow-card-hover ${
        disabled ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
      } ${isDragging ? 'opacity-50 ring-2 ring-accent' : ''}`}
    >
      <div className="flex items-start gap-2">
        <button
          role="checkbox"
          aria-checked={task.completed}
          aria-label={task.completed ? 'Mark as not done' : 'Mark as done'}
          onClick={toggleComplete}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleComplete(e);
            }
          }}
          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 ${
            task.completed ? 'border-accent bg-accent text-white' : 'border-line bg-surface hover:border-accent'
          }`}
        >
          {task.completed && <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p
              className={`min-w-0 text-sm font-medium leading-snug ${
                task.completed ? 'text-ink-muted line-through' : 'text-ink'
              }`}
            >
              {task.title}
            </p>
            <Badge tone={PRIORITY_TONE[task.priority]} className="uppercase tracking-wide">
              {task.priority}
            </Badge>
          </div>

          {task.description && (
            <p className={`mt-1 line-clamp-2 text-xs ${task.completed ? 'text-ink-muted' : 'text-ink-secondary'}`}>
              {task.description}
            </p>
          )}

          {task.dueDate && (
            <p
              className={`mt-2 flex items-center gap-1 text-xs ${
                overdue && !task.completed ? 'font-medium text-danger' : 'text-ink-muted'
              }`}
            >
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              {overdue && !task.completed
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
      </div>
    </div>
  );
}