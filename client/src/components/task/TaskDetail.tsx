import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { CalendarDays, History, Send, Trash2, X } from 'lucide-react';
import api from '@/lib/api';
import { overlayFade, quickEase, softSpring } from '@/lib/motion';
import { useAddComment, useDeleteComment, useDeleteTask, useUpdateTask } from '@/hooks/useProjects';
import AiInsightPanel from '@/components/task/AiInsightPanel';
import { timeAgo } from '@/lib/time';
import type { ProjectMember, TaskPriority } from '@/types';
import { useToast } from '@/store/toast';
import { Avatar, Badge, Button, ConfirmDialog, EmptyState, Input, Skeleton, Textarea } from '@/components/ui';


interface TaskDetailProps {
  projectId: string;
  taskId: string;
  members: ProjectMember[];
  onClose: () => void;
  userRole?: 'OWNER' | 'MEMBER' | 'VIEWER' | null;
  currentUserId?: string;
}

const PRIORITIES: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

const PRIORITY_TONE: Record<TaskPriority, 'neutral' | 'info' | 'warning' | 'danger'> = {
  LOW: 'neutral',
  MEDIUM: 'info',
  HIGH: 'warning',
  URGENT: 'danger',
};

interface TaskForm {
  title: string;
  description: string | null;
  dueDate: string | null;
  priority: TaskPriority;
  assigneeIds: string[];
}

interface TaskResponse {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  priority: TaskPriority;
  assigneeIds: string[];
  assignments: { id: string; user: { id: string; name: string } }[];
  comments: { id: string; body: string; createdAt: string; author: { id: string; name: string } }[];
  createdBy?: { id: string; name: string };
  createdAt: string;
  columnId: string;
}

function fromTask(t: TaskResponse): TaskForm {
  return {
    title: t.title,
    description: t.description ?? null,
    dueDate: t.dueDate ?? null,
    priority: t.priority,
    assigneeIds: t.assignments.map((a) => a.user.id),
  };
}

export default function TaskDetail({ projectId, taskId, members, onClose, userRole, currentUserId }: TaskDetailProps) {
  const [form, setForm] = useState<TaskForm | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved'>('idle');
  const [comment, setComment] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tab, setTab] = useState<'detail' | 'comments' | 'activity'>('detail');
  const reduceMotion = useReducedMotion() ?? false;
  const closeRef = useRef<HTMLButtonElement>(null);
  const { toast } = useToast();
  const updateTask = useUpdateTask(projectId);
  const addComment = useAddComment(projectId, taskId);
  const deleteTask = useDeleteTask(projectId);
  const deleteComment = useDeleteComment(projectId, taskId);
  const canEdit = userRole === 'OWNER' || userRole === 'MEMBER';

  const { data: taskData, isFetching, refetch } = useQuery({
    queryKey: ['task', projectId, taskId],
    queryFn: async () => {
      const res = await api.get<{ data: TaskResponse }>(`/projects/${projectId}/tasks/${taskId}`);
      return res.data.data;
    },
    enabled: !!projectId && !!taskId,
  });

  // Activities of THIS task only — used by the "Hoạt động" tab. The endpoint
  // returns project-level activity; filter to the open task client-side.
  const { data: activities } = useQuery({
    queryKey: ['task-activities', projectId],
    queryFn: async () => {
      const res = await api.get<{
        data: {
          id: string;
          action: string;
          metadata?: Record<string, unknown> | null;
          createdAt: string;
          user: { id: string; name: string };
          taskId: string | null;
        }[];
      }>(`/projects/${projectId}/activities`);
      return res.data.data;
    },
    enabled: !!projectId && tab === 'activity',
  });
  const taskActivities = (activities ?? []).filter((a) => a.taskId === taskId);

  useEffect(() => {
    if (taskData) setForm(fromTask(taskData));
  }, [taskData]);

  // Focus close button on open; block body scroll; restore on unmount.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = '';
      previous?.focus();
    };
  }, []);

  const patch = useCallback((p: Partial<TaskForm>) => {
    setForm((f) => (f ? { ...f, ...p } : f));
    setSaveState('dirty');
  }, []);

  // Debounced auto-save for title/description/dueDate/priority/assignees.
  useEffect(() => {
    if (!form || !taskData || saveState !== 'dirty') return;
    const baseline = fromTask(taskData);
    if (JSON.stringify(form) === JSON.stringify(baseline)) {
      setSaveState('saved');
      return;
    }
    setSaveState('saving');
    const timer = window.setTimeout(() => {
      updateTask.mutate(
        {
          taskId,
          updates: {
            title: form.title,
            description: form.description ?? null,
            dueDate: form.dueDate,
            priority: form.priority,
            assigneeIds: form.assigneeIds,
          },
        },
        {
          onSuccess: () => {
            setSaveState('saved');
            window.setTimeout(() => setSaveState('idle'), 2000);
          },
          onError: () => {
            setSaveState('dirty');
            toast('error', 'Failed to save changes');
          },
        }
      );
    }, 700);
    return () => window.clearTimeout(timer);
  }, [form, taskData, saveState, taskId, updateTask, toast]);

  function toggleAssignee(userId: string) {
    if (!form) return;
    const has = form.assigneeIds.includes(userId);
    patch({ assigneeIds: has ? form.assigneeIds.filter((id) => id !== userId) : [...form.assigneeIds, userId] });
  }

  async function handleComment(e: React.FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    try {
      await addComment.mutateAsync(comment.trim());
      setComment('');
      await refetch();
    } catch {
      toast('error', 'Unable to add comment');
    }
  }

  async function handleDeleteComment(commentId: string) {
    try {
      await deleteComment.mutateAsync(commentId);
      await refetch();
    } catch {
      toast('error', 'Unable to delete comment');
    }
  }

  async function handleDeleteTask() {
    try {
      await deleteTask.mutateAsync(taskId);
      toast('success', 'Task deleted');
      onClose();
    } catch {
      toast('error', 'Unable to delete task');
    }
  }

  let content: React.ReactNode;
  if (!form) {
    content = (
      <div className="space-y-4 p-6">
        <Skeleton className="h-7 w-3/4" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  } else {
    content = (
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <Input
              value={form.title}
              onChange={(e) => patch({ title: e.target.value })}
              disabled={!canEdit}
              aria-label="Task title"
              className="border-transparent bg-transparent px-0 text-lg font-semibold shadow-none focus:border-line focus:bg-surface"
            />
            <p className="mt-1 text-xs text-ink-muted">
              {saveState === 'saving'
                ? 'Saving…'
                : saveState === 'saved'
                  ? 'Saved'
                  : taskData?.createdBy
                    ? `Created by ${taskData.createdBy.name} · ${timeAgo(taskData.createdAt)}`
                    : '\u00A0'}
            </p>
          </div>
          <Button ref={closeRef} variant="ghost" size="sm" onClick={onClose} aria-label="Close task details" className="px-2">
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        {/* Tab bar — Chi tiết / Bình luận / Hoạt động */}
        <div role="tablist" aria-label="Task detail sections" className="flex shrink-0 gap-1 border-b border-line px-5">
          {(
            [
              { id: 'detail', label: 'Chi tiết' },
              { id: 'comments', label: 'Bình luận' },
              { id: 'activity', label: 'Hoạt động' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'border-accent text-accent'
                  : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Chi tiết */}
        <div
          role="tabpanel"
          aria-label="Chi tiết"
          hidden={tab !== 'detail'}
          className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4"
        >
          {tab === 'detail' && (
            <>
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">Priority</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Task priority">
              {PRIORITIES.map((p) => (
                <Button
                  key={p}
                  variant={form.priority === p ? 'primary' : 'secondary'}
                  size="sm"
                  disabled={!canEdit}
                  onClick={() => patch({ priority: p })}
                  aria-pressed={form.priority === p}
                >
                  <Badge tone={PRIORITY_TONE[p]} className="bg-transparent px-0">
                    {p}
                  </Badge>
                </Button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">Description</p>
            <Textarea
              value={form.description ?? ''}
              onChange={(e) => patch({ description: e.target.value || null })}
              disabled={!canEdit}
              placeholder="Add a description…"
              rows={4}
              aria-label="Task description"
            />
          </div>

          {canEdit && (
            <AiInsightPanel
              projectId={projectId}
              taskId={taskId}
              text={`${form.title}\n${form.description ?? ''}`.trim()}
              onApplyPriority={(priority) => patch({ priority })}
            />
          )}

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">Due date</p>
            <div className="flex items-center gap-2">
              <div className="relative w-full max-w-[180px]">
                <CalendarDays className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
                <Input
                  type="date"
                  value={form.dueDate ? form.dueDate.slice(0, 10) : ''}
                  onChange={(e) => patch({ dueDate: e.target.value ? new Date(e.target.value + 'T00:00:00').toISOString() : null })}
                  disabled={!canEdit}
                  aria-label="Due date"
                  className="pl-8"
                />
              </div>
              {form.dueDate && canEdit && (
                <Button variant="ghost" size="sm" onClick={() => patch({ dueDate: null })}>
                  Clear
                </Button>
              )}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">Assignees</p>
            <div className="flex flex-wrap gap-1.5">
              {members.length === 0 && <p className="text-sm text-ink-muted">No members yet.</p>}
              {members.map((m) => {
                const assigned = form.assigneeIds.includes(m.user.id);
                return (
                  <Button
                    key={m.id}
                    variant={assigned ? 'primary' : 'secondary'}
                    size="sm"
                    disabled={!canEdit}
                    onClick={() => toggleAssignee(m.user.id)}
                    aria-pressed={assigned}
                    className="gap-1.5"
                  >
                    <Avatar name={m.user.name} size="xs" className={`${assigned ? 'border-white/30' : ''} border-2 border-transparent`} />
                    {m.user.name}
                  </Button>
                );
              })}
            </div>
          </div>

          {isFetching && <div className="sr-only" role="status">Refreshing task…</div>}
            </>
          )}
        </div>

        {/* Bình luận */}
        <div
          role="tabpanel"
          aria-label="Bình luận"
          hidden={tab !== 'comments'}
          className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4"
        >
          {tab === 'comments' && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">Comments</p>
            {canEdit ? (
              <form onSubmit={handleComment} className="flex gap-2">
                <Input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Write a comment…"
                  aria-label="Comment body"
                />
                <Button type="submit" disabled={!comment.trim()} loading={addComment.isPending} aria-label="Send comment">
                  <Send className="h-4 w-4" aria-hidden="true" />
                </Button>
              </form>
            ) : (
              <p className="text-sm text-ink-muted">Only members can comment.</p>
            )}
            <ul className="mt-4 space-y-4">
              {taskData?.comments && taskData.comments.length > 0 ? (
                taskData.comments.map((c) => {
                  const canDelete = c.author.id === currentUserId || userRole === 'OWNER';
                  return (
                    <li key={c.id} className="flex items-start gap-2.5">
                      <Avatar name={c.author.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-ink">
                          {c.author.name}
                          <span className="ml-1.5 font-normal text-ink-muted">{timeAgo(c.createdAt)}</span>
                        </p>
                        <p className="mt-0.5 break-words text-sm text-ink-secondary">{c.body}</p>
                      </div>
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleDeleteComment(c.id)}
                          aria-label="Delete comment"
                          className="px-1.5 text-ink-muted hover:text-danger"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                      )}
                    </li>
                  );
                })
              ) : (
                <li className="text-sm text-ink-muted">No comments yet.</li>
              )}
            </ul>
          </div>
          )}
        </div>

        {/* Hoạt động */}
        <div
          role="tabpanel"
          aria-label="Hoạt động"
          hidden={tab !== 'activity'}
          className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4"
        >
          {tab === 'activity' && (
            <>
              {taskActivities.length > 0 ? (
                <ul className="space-y-2">
                  {taskActivities.map((a) => (
                    <li key={a.id} className="flex items-baseline gap-1.5 text-xs text-ink-secondary">
                      <span className="font-medium text-ink">{a.user.name}</span>{' '}
                      {a.action.replace(/_/g, ' ').toLowerCase()}
                      <span className="ml-auto shrink-0 text-[10px] text-ink-muted">{timeAgo(a.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  icon={<History className="h-6 w-6" aria-hidden="true" />}
                  title="Chưa có hoạt động nào"
                  className="py-8"
                />
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end border-t border-line px-5 py-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmDelete(true)}
            disabled={!canEdit}
            className="text-ink-muted hover:text-danger"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Delete task
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50" onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
      <motion.div
        variants={reduceMotion ? undefined : overlayFade}
        initial={reduceMotion ? false : 'hidden'}
        animate={reduceMotion ? false : 'visible'}
        transition={quickEase}
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-label="Task details"
        initial={reduceMotion ? false : { x: '100%' }}
        animate={{ x: 0 }}
        transition={softSpring}
        className="absolute inset-y-0 right-0 flex h-full w-full max-w-md flex-col overflow-hidden bg-surface shadow-modal md:max-w-lg"
      >
        {content}
      </motion.aside>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void handleDeleteTask()}
        title="Delete task?"
        message="This task and its comments will be permanently deleted. This cannot be undone."
        confirmLabel="Delete task"
        loading={deleteTask.isPending}
      />
    </div>
  );
}