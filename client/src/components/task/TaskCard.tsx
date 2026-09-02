import { useEffect, useRef, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CalendarDays, Check, MessageSquare, Pencil } from 'lucide-react';
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

const PRIORITY_BAR: Record<TaskPriority, string> = {
  LOW: 'bg-slate-300',
  MEDIUM: 'bg-info',
  HIGH: 'bg-warning',
  URGENT: 'bg-danger',
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

  const [editingTitle, setEditingTitle] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const inputRef = useRef<HTMLInputElement>(null);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const overdue = isOverdue(task.dueDate);
  const commentCount = task.comments?.length ?? 0;
  const assignments = task.assignments ?? [];

  // Keep the draft in sync when the title changes elsewhere (realtime, refetch).
  useEffect(() => {
    if (!editingTitle) setDraft(task.title);
  }, [task.title, editingTitle]);

  function openEditor(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    setDraft(task.title);
    setEditingTitle(true);
  }

  function commit() {
    const next = draft.trim();
    setEditingTitle(false);
    if (next && next !== task.title) {
      void updateTask.mutateAsync({ taskId: task.id, updates: { title: next } });
    }
  }

  /** Escape: revert the draft and close without saving. */
  function cancel(e?: React.SyntheticEvent) {
    e?.stopPropagation();
    setDraft(task.title);
    setEditingTitle(false);
  }

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
        if ((e.key === 'Enter' || e.key === ' ') && onClick && !disabled && !editingTitle) {
          e.preventDefault();
          onClick();
        }
      }}
      className={`group relative mb-2 rounded-xl bg-surfaceContainerLow p-3.5 shadow-elevation1 transition-all duration-200 hover:shadow-elevation2 hover:-translate-y-0.5 ${
        disabled ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
      } ${isDragging ? 'opacity-50 outline outline-2 outline-primary shadow-elevation3' : ''} ${task.completed ? 'opacity-70' : ''}`}
    >
      {/* Priority indicator bar */}
      <div className={`absolute left-0 top-2 bottom-2 w-1 rounded-full ${PRIORITY_BAR[task.priority]}`} aria-hidden="true" />
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
          className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[2px] border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 ${
            task.completed ? 'border-primary bg-primary text-onPrimary' : 'border-outline bg-surface hover:border-primary'
          }`}
        >
          {task.completed && <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            {editingTitle ? (
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                aria-label="Tiêu đề task"
                autoFocus
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    commit();
                  }
                  if (e.key === 'Escape') {
                    cancel(e);
                  }
                }}
                className="min-w-0 flex-1 rounded border border-accent bg-surface px-1 py-0.5 text-sm font-medium text-ink outline-none focus:ring-1 focus:ring-accent"
              />
            ) : (
              <>
                <p
                  className={`min-w-0 text-sm font-medium leading-snug ${
                    task.completed ? 'text-ink-muted line-through' : 'text-ink'
                  }`}
                >
                  {task.title}
                </p>
                <button
                  type="button"
                  aria-label={`Sửa tiêu đề task ${task.title}`}
                  onClick={openEditor}
                  className="shrink-0 self-start rounded p-0.5 text-ink-muted opacity-0 transition-opacity hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Pencil className="h-3 w-3" aria-hidden="true" />
                </button>
              </>
            )}
            {!editingTitle && (
              <Badge tone={PRIORITY_TONE[task.priority]} className="uppercase tracking-wide">
                {task.priority}
              </Badge>
            )}
          </div>

          {task.description && !editingTitle && (
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

          {!editingTitle && (
            <div className="mt-2 flex items-center justify-between gap-2">
              {commentCount > 0 ? (
                <span className="flex items-center gap-1 text-xs text-ink-muted">
                  <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                  {commentCount}
                </span>
              ) : (
                <span />
              )}
              {assignments.length > 0 && (
                <div className="flex items-center -space-x-1.5">
                  {assignments.slice(0, 3).map((a) => (
                    <Avatar key={a.id} name={a.user.name} size="xs" className="border-2 border-surface" />
                  ))}
                  {assignments.length > 3 && (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface bg-surface-2 text-[10px] font-semibold text-ink-secondary">
                      +{assignments.length - 3}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
