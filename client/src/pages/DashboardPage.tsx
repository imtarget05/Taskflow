import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, FolderKanban, ListTodo, Pencil, Plus, TriangleAlert } from 'lucide-react';
import { useProjects, useCreateProject } from '@/hooks/useProjects';
import { useAnalyticsOverview } from '@/hooks/useAnalytics';
import { useAuth } from '@/store/auth';
import { useToast } from '@/store/toast';
import type { ProjectSummary } from '@/types';
import ProjectSettingsModal from '@/components/project/ProjectSettingsModal';
import { Avatar, Button, EmptyState, Input, Modal, Skeleton, Textarea } from '@/components/ui';

export default function DashboardPage() {
  const { data: projects, isLoading, error } = useProjects();
  const { data: stats } = useAnalyticsOverview();
  const createProject = useCreateProject();
  const { user } = useAuth();
  const { toast } = useToast();
  const [settingsProject, setSettingsProject] = useState<ProjectSummary | null>(null);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitError, setSubmitError] = useState('');

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSubmitError('');
    if (!name.trim()) return;
    try {
      await createProject.mutateAsync({ name: name.trim(), description: description.trim() || undefined });
      setOpen(false);
      setName('');
      setDescription('');
      toast('success', 'Project created');
    } catch {
      setSubmitError('Unable to create project.');
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Your projects</h1>
          <p className="mt-0.5 text-sm text-ink-secondary">
            Boards you belong to, kept in sync for everyone.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          New project
        </Button>
      </div>

      {stats && stats.totalProjects > 0 && (
        <section aria-label="Overview statistics" className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="card flex items-center gap-3 p-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent-ink">
              <FolderKanban className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-lg font-semibold leading-none">{stats.totalProjects}</p>
              <p className="mt-1 text-xs text-ink-muted">Projects</p>
            </div>
          </div>
          <div className="card flex items-center gap-3 p-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-info-soft text-info">
              <ListTodo className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-lg font-semibold leading-none">{stats.totalTasks}</p>
              <p className="mt-1 text-xs text-ink-muted">Tasks</p>
            </div>
          </div>
          <div className="card flex items-center gap-3 p-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-success-soft text-success">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-lg font-semibold leading-none">{stats.completedTasks}</p>
              <p className="mt-1 text-xs text-ink-muted">Completed</p>
            </div>
          </div>
          <div className="card flex items-center gap-3 p-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning-soft text-warning">
              <TriangleAlert className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-lg font-semibold leading-none">{stats.overdueTasks}</p>
              <p className="mt-1 text-xs text-ink-muted">Overdue</p>
            </div>
          </div>
          <div className="card col-span-2 p-4 lg:col-span-4">
            <h2 className="text-sm font-semibold">Completion by project</h2>
            <ul className="mt-3 space-y-2.5">
              {stats.byProject
                .filter((p) => p.total > 0)
                .map((p) => {
                  const pct = Math.round((p.completed / p.total) * 100);
                  return (
                    <li key={p.projectId}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex min-w-0 items-center gap-2 font-medium text-ink">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.color ?? 'rgb(var(--accent))' }} aria-hidden="true" />
                          <span className="truncate">{p.name}</span>
                        </span>
                        <span className="shrink-0 text-ink-muted">
                          {p.completed}/{p.total} · {pct}%
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${p.name}: ${pct}% complete`}>
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
            </ul>
          </div>
        </section>
      )}

      {isLoading ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card space-y-3 p-5">
              <Skeleton className="h-2 w-10" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="card mt-6">
          <EmptyState
            icon={<FolderKanban className="h-8 w-8" aria-hidden="true" />}
            title="Unable to load projects"
            description="Check your connection and try again."
          />
        </div>
      ) : projects && projects.length > 0 ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => {
            const members = project.members;
            const taskCount = project.columns.reduce((sum, c) => sum + c._count.tasks, 0);
            return (
              <Link
                key={project.id}
                to={`/projects/${project.id}`}
                className="card group p-5 transition-shadow hover:shadow-card-hover"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div
                    className="h-1.5 w-10 rounded-full"
                    style={{ backgroundColor: project.color ?? 'rgb(var(--accent))' }}
                  />
                  <div className="flex items-center -space-x-1.5">
                    {members.slice(0, 4).map((m) => (
                      <Avatar key={m.id} name={m.user.name} size="xs" className="border-2 border-surface" />
                    ))}
                    {members.length > 4 && (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface bg-surface-2 text-[10px] font-semibold text-ink-secondary">
                        +{members.length - 4}
                      </span>
                    )}
                  </div>
                </div>
                <h3 className="font-semibold text-ink group-hover:text-accent">{project.name}</h3>
                {project.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-ink-secondary">{project.description}</p>
                )}
                <p className="mt-3 flex items-center justify-between text-xs text-ink-muted">
                  <span>
                    {taskCount} task{taskCount === 1 ? '' : 's'}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSettingsProject(project);
                    }}
                    aria-label={`Edit project ${project.name}`}
                    className="px-1.5 text-ink-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:text-ink"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </p>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="card mt-6">
          <EmptyState
            icon={<FolderKanban className="h-8 w-8" aria-hidden="true" />}
            title="No projects yet"
            description="Create your first project and start arranging tasks on the board."
            action={
              <Button onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Create a project
              </Button>
            }
          />
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New project"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="new-project-form" disabled={!name.trim()} loading={createProject.isPending}>
              Create project
            </Button>
          </>
        }
      >
        <form id="new-project-form" onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Interview prep"
            autoFocus
            required
            error={submitError || undefined}
          />
          <Textarea
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this project about? (optional)"
            rows={3}
          />
        </form>
      </Modal>

      {settingsProject && (
        <ProjectSettingsModal
          project={settingsProject}
          canDelete={settingsProject.ownerId === user?.id}
          onClose={() => setSettingsProject(null)}
        />
      )}
    </div>
  );
}