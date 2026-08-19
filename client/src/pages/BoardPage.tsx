import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, History, Users } from 'lucide-react';
import { useBoard, useActivities } from '@/hooks/useProjects';
import KanbanBoard from '@/components/board/KanbanBoard';
import TaskDetail from '@/components/task/TaskDetail';
import MemberModal from '@/components/board/MemberModal';
import { useRealtime } from '@/hooks/useRealtime';
import { useAuth } from '@/store/auth';
import { Avatar, Badge, Button, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import type { Activity } from '@/types';

export default function BoardPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();
  const { data: board, isLoading, error, refetch } = useBoard(projectId);
  const { data: activities } = useActivities(projectId ?? '');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showMemberModal, setShowMemberModal] = useState(false);

  const realtimeStatus = useRealtime(projectId);

  if (isLoading) {
    return (
      <div className="flex h-full flex-col gap-4 p-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="flex flex-1 gap-4 overflow-hidden">
          {[1, 2, 3].map((i) => (
            <div key={i} className="w-72 shrink-0 space-y-3 rounded-xl bg-surface-2 p-3">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !board) {
    return (
      <ErrorState
        title="Unable to load project"
        message="You may not be a member, or the project doesn't exist."
        onRetry={() => void refetch()}
        className="h-full"
      />
    );
  }

  const project = board.project;
  const canEdit = board.role === 'OWNER' || board.role === 'MEMBER';

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 border-b border-line bg-surface px-4 py-3 md:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/"
            className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
            aria-label="Back to projects"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base font-semibold">{project.name}</h1>
              <Badge tone={board.role === 'OWNER' ? 'accent' : 'neutral'}>{board.role}</Badge>
              <span
                className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  realtimeStatus === 'online' ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'
                }`}
                aria-label={realtimeStatus === 'online' ? 'Live updates connected' : 'Reconnecting to live updates'}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${realtimeStatus === 'online' ? 'bg-success' : 'bg-warning'}`}
                  aria-hidden="true"
                />
                {realtimeStatus === 'online' ? 'Live' : realtimeStatus === 'connecting' ? 'Connecting' : 'Reconnecting'}
              </span>
            </div>
            {project.description && (
              <p className="truncate text-xs text-ink-secondary">{project.description}</p>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center -space-x-1.5 md:flex">
              {project.members.slice(0, 4).map((m) => (
                <Avatar key={m.id} name={m.user.name} size="sm" className="border-2 border-surface" />
              ))}
              {project.members.length > 4 && (
                <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface bg-surface-2 text-[10px] font-semibold text-ink-secondary">
                  +{project.members.length - 4}
                </span>
              )}
            </div>
            {canEdit && (
              <Button variant="secondary" size="sm" onClick={() => setShowMemberModal(true)}>
                <Users className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Members</span>
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6 lg:flex-row">
        <main className="min-w-0 flex-1 overflow-x-auto">
          <KanbanBoard board={board} projectId={project.id} onTaskClick={setSelectedTaskId} />
        </main>

        <aside
          aria-label="Recent activity"
          className="card w-full shrink-0 overflow-y-auto p-4 lg:w-64"
        >
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <History className="h-4 w-4 text-ink-muted" aria-hidden="true" />
            Activity
          </h2>
          {activities && activities.length > 0 ? (
            <ul className="space-y-3">
              {activities.map((activity: Activity) => (
                <li key={activity.id} className="text-xs text-ink-secondary">
                  <span className="font-medium text-ink">
                    {activity.user.name === user?.name ? 'You' : activity.user.name}
                  </span>{' '}
                  {activity.action.replace(/_/g, ' ').toLowerCase()}
                  <span className="block text-xs text-ink-muted">
                    {new Date(activity.createdAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<History className="h-6 w-6" aria-hidden="true" />}
              title="No activity yet"
              className="py-8"
            />
          )}
        </aside>
      </div>

      {selectedTaskId && projectId && (
        <TaskDetail
          key={selectedTaskId}
          projectId={projectId}
          taskId={selectedTaskId}
          members={project.members}
          onClose={() => setSelectedTaskId(null)}
          userRole={board.role}
          currentUserId={user?.id}
        />
      )}

      {showMemberModal && projectId && (
        <MemberModal
          projectId={projectId}
          role={board.role}
          members={project.members}
          ownerId={project.ownerId}
          onClose={() => setShowMemberModal(false)}
        />
      )}
    </div>
  );
}