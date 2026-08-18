import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useAddComment, useDeleteTask, useUpdateTask } from '@/hooks/useProjects';
import type { ProjectMember, TaskPriority } from '@/types';

interface TaskDetailProps {
  projectId: string;
  taskId: string;
  members: ProjectMember[];
  onClose: () => void;
  userRole?: 'OWNER' | 'MEMBER' | 'VIEWER' | null;
}

const PRIORITIES: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

interface TaskState {
  id: string;
  title: string;
  description?: string | null;
  dueDate?: string | null;
  priority: TaskPriority;
  columnId: string;
  assignments: { id: string; user: { id: string; name: string } }[];
  comments?: { id: string; body: string; createdAt: string; author: { id: string; name: string } }[];
}

export default function TaskDetail({ projectId, taskId, members, onClose, userRole }: TaskDetailProps) {
  const [comment, setComment] = useState('');
  const [task, setTask] = useState<TaskState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { mutateAsync: addComment } = useAddComment(projectId, taskId);
  const { mutateAsync: updateTask } = useUpdateTask(projectId);
  const { mutateAsync: deleteTask } = useDeleteTask(projectId);

  // Use React Query to fetch task data (Task 2.3: removes old useEffect hack)
  const { data: taskData, refetch } = useQuery({
    queryKey: ['task', projectId, taskId],
    queryFn: async () => {
      const res = await api.get(`/projects/${projectId}/tasks/${taskId}`);
      const t = res.data.data;
      return {
        id: t.id,
        title: t.title,
        description: t.description,
        dueDate: t.dueDate ? t.dueDate.split('T')[0] : undefined,
        priority: t.priority,
        columnId: t.columnId,
        assignments: t.assignments,
        comments: t.comments,
      } as TaskState;
    },
    enabled: !!projectId && !!taskId,
  });

  // Sync local state when query data arrives
  useEffect(() => {
    if (taskData) setTask(taskData);
  }, [taskData]);

  async function handleComment(e: React.FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    try { await addComment(comment); setComment(''); await refetch(); } catch { setError('Unable to add comment.'); }
  }

  async function handlePriorityChange(priority: TaskPriority) {
    try { await updateTask({ taskId, updates: { priority } }); await refetch(); } catch { setError('Unable to update task.'); }
  }

  async function toggleAssignee(userId: string) {
    if (!task) return;
    const has = task.assignments.some((a) => a.user.id === userId);
    const assigneeIds = has
      ? task.assignments.filter((a) => a.user.id !== userId).map((a) => a.user.id)
      : [...task.assignments.map((a) => a.user.id), userId];
    try { await updateTask({ taskId, updates: { assigneeIds } }); await refetch(); } catch { setError('Unable to update assignees.'); }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this task?')) return;
    try { await deleteTask(taskId); onClose(); } catch { setError('Unable to delete task.'); }
  }

  async function saveDetails() {
    if (!task) return;
    try {
      await updateTask({ taskId, updates: { description: task.description ?? '', dueDate: task.dueDate || null } });
      await refetch();
    } catch { setError('Unable to save task details.'); }
  }

  // Role-based access (Task 2.3): only OWNER/MEMBER can delete
  const canDelete = userRole === 'OWNER' || userRole === 'MEMBER';
  const canEdit = canDelete;
return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="card max-h-[80vh] w-full max-w-lg overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-slate-800">{task?.title ?? 'Task'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Priority</p>
            <div className="flex gap-2">
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  disabled={!canEdit}
                  onClick={() => void handlePriorityChange(p)}
                  className={
                    task?.priority === p
                      ? 'rounded px-2 py-1 text-xs font-semibold bg-brand-600 text-white'
                      : 'rounded px-2 py-1 text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Description</p>
            <textarea
              value={task?.description || ''}
              onChange={(e) => setTask((t) => (t ? { ...t, description: e.target.value } : t))}
              disabled={!canEdit}
              placeholder="Description"
              className="textarea textarea-bordered w-full mb-2"
            />
            {canEdit && <button onClick={() => void saveDetails()} className="btn-secondary text-xs">Save details</button>}
          </div>

          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Due date</p>
            <input type="date" value={task?.dueDate ?? ''} disabled={!canEdit}
              onChange={(e) => setTask((t) => (t ? { ...t, dueDate: e.target.value || null } : t))} className="input" />
          </div>

          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Assignees</p>
            <p className="text-sm text-slate-600">
              {task && task.assignments.length > 0
                ? task.assignments.map((a) => a.user.name).join(', ')
                : 'Unassigned'}
            </p>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Members</p>
            <div className="flex flex-wrap gap-1.5">
              {members.map((m) => (
                <button
                  key={m.id}
                  disabled={!canEdit}
                  onClick={() => void toggleAssignee(m.user.id)}
                  className={
                    task?.assignments.some((a) => a.user.id === m.user.id)
                      ? 'rounded-full px-2.5 py-1 text-xs bg-brand-100 font-semibold text-brand-700'
                      : 'rounded-full px-2.5 py-1 text-xs bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }
                >
                  {m.user.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Comments</p>
            <form onSubmit={handleComment} className="flex gap-2">
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Write a comment…"
                className="input"
              />
              <button type="submit" disabled={!canEdit} className="btn-primary">Send</button>
            </form>
            <div className="mt-4 space-y-3">
              {task && task.comments && task.comments.length > 0 ? (
                task.comments.map((comment) => (
                  <div key={comment.id} className="flex gap-3">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-200 text-xs font-semibold text-brand-800">
                      {comment.author.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-700">{comment.author.name}</div>
                      <div className="text-sm text-slate-600">{comment.body}</div>
                      <div className="text-[10px] text-slate-400 mt-1">{new Date(comment.createdAt).toLocaleString()}</div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-400">No comments yet.</p>
              )}
            </div>
          </div>

          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

          {canDelete && (
            <div className="flex justify-end border-t border-slate-100 pt-4">
              <button onClick={() => void handleDelete()} className="text-sm text-red-500 hover:underline">
                Delete task
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
