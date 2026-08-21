import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, FilterX, History, MessageSquare, Settings2, Users } from 'lucide-react';
import { useBoard, useActivities, useUpdateProject } from '@/hooks/useProjects';
import { ALL_FILTERS, type BoardFilters } from '@/lib/filters';
import TaskDetail from '@/components/task/TaskDetail';
import MemberModal from '@/components/board/MemberModal';
import ProjectSettingsModal from '@/components/project/ProjectSettingsModal';
import ExportMenu from '@/components/board/ExportMenu';
import { useRealtime } from '@/hooks/useRealtime';
import { useAuth } from '@/store/auth';
import { useAgent } from '@/store/agent';
import { useToast } from '@/store/toast';
import { Avatar, Badge, Button, ColorPopover, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import type { Activity, TaskPriority } from '@/types';

const KanbanBoard = lazy(() => import('@/components/board/KanbanBoard'));
const ChatPanel = lazy(() => import('@/components/board/ChatPanel'));

type PriorityFilter = TaskPriority | 'ALL';

export default function BoardPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { setProjectId: setAgentProjectId } = useAgent();
  const { data: board, isLoading, error, refetch } = useBoard(projectId);
  const { data: activities } = useActivities(projectId ?? '');
  const updateProject = useUpdateProject(projectId);
  const { toast } = useToast();
  const [filters, setFilters] = useState<BoardFilters>({ ...ALL_FILTERS });
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(searchParams.get('task'));
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showChat, setShowChat] = useState(false);

  useEffect(() => {
    setAgentProjectId(projectId ?? null);
    return () => setAgentProjectId(null);
  }, [projectId, setAgentProjectId]);

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
            to="/dashboard"
            className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
            aria-label="Back to projects"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="h-6 w-1 shrink-0 rounded-full"
                style={{ backgroundColor: project.color ?? 'rgb(var(--accent))' }}
                aria-hidden="true"
              />
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
              <>
                <ColorPopover
                  value={project.color}
                  onChange={(color) => {
                    updateProject.mutate(
                      { color },
                      {
                        onSuccess: () => toast('success', 'Color updated'),
                        onError: () => toast('error', 'Unable to update color'),
                      }
                    );
                  }}
                  ariaLabel="Change project color"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowSettings(true)}
                  aria-label="Project settings"
                >
                  <Settings2 className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">Settings</span>
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setShowMemberModal(true)}>
                  <Users className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">Members</span>
                </Button>
              </>
            )}
            <ExportMenu projectId={project.id} projectName={project.name} />
            <Button
              variant={showChat ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setShowChat((s) => !s)}
              aria-label="Open chat"
              aria-pressed={showChat}
            >
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Chat</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div
          className={`min-h-0 flex-1 flex-col gap-4 p-4 md:p-6 ${
            showChat ? 'hidden lg:flex' : 'flex'
          }`}
        >
          <main className="flex min-w-0 flex-1 flex-col">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-ink-secondary">
              <span>Priority</span>
              <select
                aria-label="Filter by priority"
                value={filters.priority}
                onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value as PriorityFilter }))}
                className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="ALL">All</option>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm text-ink-secondary">
              <span>Assignee</span>
              <select
                aria-label="Filter by assignee"
                value={filters.assigneeId}
                onChange={(e) => setFilters((f) => ({ ...f, assigneeId: e.target.value }))}
                className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="ALL">Everyone</option>
                {project.members.map((m) => (
                  <option key={m.id} value={m.user.id}>
                    {m.user.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex cursor-pointer items-center gap-1.5 text-sm text-ink-secondary">
              <input
                type="checkbox"
                checked={filters.showCompleted}
                onChange={(e) => setFilters((f) => ({ ...f, showCompleted: e.target.checked }))}
                className="h-4 w-4 rounded border-line accent-accent"
              />
              Show completed
            </label>

            {JSON.stringify(filters) !== JSON.stringify(ALL_FILTERS) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFilters({ ...ALL_FILTERS })}
                aria-label="Clear all filters"
                className="text-ink-muted hover:text-ink"
              >
                <FilterX className="h-3.5 w-3.5" aria-hidden="true" />
                Clear filters
              </Button>
            )}
          </div>

          <Suspense fallback={<Skeleton className="h-40 w-full" />}>
            <KanbanBoard board={board} projectId={project.id} filters={filters} onTaskClick={(id) => setSelectedTaskId(id)} />
          </Suspense>

          <section
            aria-label="Recent activity"
            className="card mt-4 w-full p-4"
          >
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <History className="h-4 w-4 text-ink-muted" aria-hidden="true" />
              Activity
              {activities && activities.length > 0 && (
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-ink-muted">
                  {activities.length}
                </span>
              )}
            </h2>
            {activities && activities.length > 0 ? (
              <ul className="grid gap-x-6 gap-y-2 md:grid-cols-2">
                {activities.map((activity: Activity) => (
                  <li key={activity.id} className="flex min-w-0 items-baseline gap-1.5 text-xs text-ink-secondary">
                    <span className="font-medium text-ink">
                      {activity.user.name === user?.name ? 'You' : activity.user.name}
                    </span>{' '}
                    {activity.action.replace(/_/g, ' ').toLowerCase()}
                    {activity.metadata && 'title' in activity.metadata && typeof activity.metadata.title === 'string' && (
                      <span className="truncate font-medium text-ink"> · {activity.metadata.title}</span>
                    )}
                    <span className="ml-auto shrink-0 text-[10px] text-ink-muted">
                      {new Date(activity.createdAt).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={<History className="h-6 w-6" aria-hidden="true" />}
                title="No activity yet"
                className="py-6"
              />
            )}
          </section>
        </main>

        {showChat && (
          <div className="hidden h-full shrink-0 lg:flex">
            <Suspense fallback={<div className="w-80 bg-surface" />}>
              <ChatPanel
                projectId={project.id}
                name={project.name}
                members={project.members}
                currentUser={user}
                role={board.role}
                onClose={() => setShowChat(false)}
              />
            </Suspense>
          </div>
        )}
      </div>
      </div>

      {showChat && (
        <div
          className="fixed inset-0 z-40 flex justify-end bg-black/40 lg:hidden"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowChat(false)}
        >
          <div className="h-full w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <Suspense fallback={<div className="h-full w-full bg-surface" />}>
              <ChatPanel
                projectId={project.id}
                name={project.name}
                members={project.members}
                currentUser={user}
                role={board.role}
                onClose={() => setShowChat(false)}
              />
            </Suspense>
          </div>
        </div>
      )}

      {selectedTaskId && projectId && (
        <TaskDetail
          key={selectedTaskId}
          projectId={projectId}
          taskId={selectedTaskId}
          members={project.members}
          onClose={() => {
            setSelectedTaskId(null);
            if (searchParams.get('task')) {
              setSearchParams({}, { replace: true });
            }
          }}
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

      {showSettings && (
        <ProjectSettingsModal
          project={project}
          canDelete={project.ownerId === user?.id}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}