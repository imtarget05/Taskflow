import { FormEvent, useEffect, useState } from 'react';
import {
  useAddComment,
  useDeleteTask,
  useUpdateTask,
} from '@/hooks/useProjects';
import type { ProjectMember, TaskPriority } from '@/types';

interface TaskDetailProps {
  projectId: string;
  taskId: string;
  members: ProjectMember[];
  onClose: () => void;
}

const PRIORITIES: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

interface TaskState {
  id: string;
  title: string;
  description?: string | null;
  priority: TaskPriority;
  assignments: { id: string; user: { id: string; name: string } }[];
}

export default function TaskDetail({ projectId, taskId, members, onClose }: TaskDetailProps) {
  const { mutateAsync: addComment } = useAddComment(projectId, taskId);
  const { mutateAsync: updateTask } = useUpdateTask(projectId);
  const { mutateAsync: deleteTask } = useDeleteTask(projectId);

  const [comment, setComment] = useState('');
  const [task, setTask] = useState<TaskState | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { api } = await import('@/lib/api');
      const res = await api.get(`/projects/${projectId}/tasks/${taskId}`);
      if (active) setTask(res.data.data);
    })();
    return () => {
      active = false;
    };
  }, [projectId, taskId]);

  async function handleComment(e: FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    await addComment(comment);
    setComment('');
  }

  async function handlePriorityChange(priority: TaskPriority) {
    await updateTask({ taskId, updates: { priority } });
    setTask((t) => (t ? { ...t, priority } : t));
  }

  async function toggleAssignee(userId: string) {
    if (!task) return;
    const has = task.assignments.some((a) => a.user.id === userId);
    const assigneeIds = has
      ? task.assignments.filter((a) => a.user.id !== userId).map((a) => a.user.id)
      : [...task.assignments.map((a) => a.user.id), userId];
    await updateTask({ taskId, updates: { assigneeIds } });
    setTask((t) => (t ? { ...t, assignments: assigneeIds.map((id) => ({ id: '', user: { id, name: '' } })) } : t));
  }

  async function handleDelete() {
    if (!window.confirm('Delete this task?')) return;
    await deleteTask(taskId);
    onClose();
  }

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
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
              Priority
            </p>
            <div className="flex gap-2">
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  onClick={() => void handlePriorityChange(p)}
                  className={`rounded px-2 py-1 text-xs font-semibold ${
                    task?.priority === p
                      ? 'bg-brand-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {task?.description && <p className="text-sm text-slate-600">{task.description}</p>}

          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
              Assignees
            </p>
            <p className="text-sm text-slate-600">
              {task && task.assignments.length > 0
                ? task.assignments.map((a) => a.user.name).join(', ')
                : 'Unassigned'}
            </p>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
              Members
            </p>
            <div className="flex flex-wrap gap-1.5">
              {members.map((m) => (
                <button
                  key={m.id}
                  onClick={() => void toggleAssignee(m.user.id)}
                  className={`rounded-full px-2.5 py-1 text-xs ${
                    task?.assignments.some((a) => a.user.id === m.user.id)
                      ? 'bg-brand-100 font-semibold text-brand-700'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {m.user.name}
                </button>
              ))}
            </div>
          </div>

          {/* Comments */}
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
              Comments
            </p>
            <form onSubmit={handleComment} className="flex gap-2">
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Write a comment…"
                className="input"
              />
              <button type="submit" className="btn-primary">
                Send
              </button>
            </form>
          </div>

          <div className="flex justify-end border-t border-slate-100 pt-4">
            <button
              onClick={() => void handleDelete()}
              className="text-sm text-red-500 hover:underline"
            >
              Delete task
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}