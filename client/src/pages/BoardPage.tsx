import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useBoard, useActivities } from '@/hooks/useProjects';
import KanbanBoard from '@/components/board/KanbanBoard';
import TaskDetail from '@/components/task/TaskDetail';
import { useRealtime } from '@/hooks/useRealtime';
import { useAuth } from '@/store/auth';
import type { Activity } from '@/types';

export default function BoardPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: board, isLoading, error } = useBoard(projectId);
  const { data: activities } = useActivities(projectId ?? '');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  useRealtime(projectId);

  if (isLoading) {
    return <div className="p-8 text-slate-500">Loading board…</div>;
  }

  if (error || !board) {
    return (
      <div className="p-8">
        <p className="text-red-600">
          Unable to load project. You may not be a member, or the project doesn't exist.
        </p>
        <Link to="/" className="mt-4 inline-block text-brand-600 hover:underline">
          ← Back to projects
        </Link>
      </div>
    );
  }

  const project = board.project;

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-slate-400 hover:text-brand-600">
              ←
            </Link>
            <div>
              <h1 className="text-lg font-bold text-slate-800">{project.name}</h1>
              {project.description && (
                <p className="text-sm text-slate-500">{project.description}</p>
              )}
            </div>
            <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
              {board.role}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              {project.members.map((m) => (
                <span
                  key={m.id}
                  title={m.user.name}
                  className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-brand-200 text-xs font-semibold text-brand-800"
                >
                  {m.user.name.charAt(0).toUpperCase()}
                </span>
              ))}
            </div>
            <button onClick={() => navigate('/')} className="btn-secondary text-sm">
              Dashboard
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 gap-4 overflow-hidden p-6">
        <main className="flex-1 overflow-x-auto">
          <KanbanBoard
            board={board}
            projectId={project.id}
            onTaskClick={setSelectedTaskId}
          />
        </main>

        <aside className="card w-64 shrink-0 overflow-y-auto p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Activity</h3>
          {activities && activities.length > 0 ? (
            <ul className="space-y-3">
                             {activities.map((activity: Activity) => (
                <li key={activity.id} className="text-xs text-slate-600">
                  <span className="font-medium">
                    {activity.user.name === user?.name ? 'You' : activity.user.name}
                  </span>{' '}
                  {activity.action.replace(/_/g, ' ').toLowerCase()}
                  <span className="block text-[10px] text-slate-400">
                    {new Date(activity.createdAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-400">No activity yet.</p>
          )}
        </aside>
      </div>

      {selectedTaskId && projectId && (
        <TaskDetail
          projectId={projectId}
          taskId={selectedTaskId}
          members={project.members}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
    </div>
  );
}