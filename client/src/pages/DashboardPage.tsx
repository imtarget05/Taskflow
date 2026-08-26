import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  FolderKanban,
  Pencil,
  Plus,
  TriangleAlert,
} from 'lucide-react';
import { useProjects, useUpdateProject, useRecentActivities } from '@/hooks/useProjects';
import { useAnalyticsOverview } from '@/hooks/useAnalytics';
import { useAuth } from '@/store/auth';
import { useToast } from '@/store/toast';
import type { Activity, ProjectSummary } from '@/types';
import ProjectSettingsModal from '@/components/project/ProjectSettingsModal';
import CreateProjectWizard from '@/components/project/CreateProjectWizard';
import OnboardingModal from '@/components/onboarding/OnboardingModal';
import { onboardingDismissed } from '@/lib/onboarding';
import {
  Avatar,
  Button,
  Card,
  ColorPopover,
  EmptyState,
  ErrorState,
  ProgressBar,
  SectionHeading,
  Skeleton,
} from '@/components/ui';

/**
 * Dashboard — answers in ~5 seconds: what am I working on, what's progressing,
 * and what needs attention. Only real data (useProjects + analytics overview);
 * no fabricated trends or mock activity.
 */
export default function DashboardPage() {
  const { data: projects, isLoading, error, refetch } = useProjects();
  const { data: stats } = useAnalyticsOverview();
  const { data: recentActivities } = useRecentActivities(12);
  const updateProject = useUpdateProject();
  const { user } = useAuth();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  // First-run onboarding: only for accounts with zero projects whose browser
  // has not dismissed the walkthrough before.
  const [showOnboarding, setShowOnboarding] = useState(() => !onboardingDismissed());
  const [settingsProject, setSettingsProject] = useState<ProjectSummary | null>(null);

interface MetricCardProps {
  label: string;
  /** Rendered value; skeleton while undefined. */
  value?: string;
  progress?: number;
  icon?: React.ReactNode;
  tone?: 'accent' | 'success' | 'warning' | 'neutral';
  to?: string;
  toLabel?: string;
}

const TONE_TEXT: Record<NonNullable<MetricCardProps['tone']>, string> = {
  accent: 'text-accent',
  success: 'text-success',
  warning: 'text-warning',
  neutral: 'text-ink',
};

function MetricCard({ label, value, progress, tone = 'neutral', to, toLabel }: MetricCardProps) {
  return (
    <Card className="p-4">
      <p className="type-caption font-medium text-ink-secondary">{label}</p>
      {value === undefined ? (
        <Skeleton className="mt-2 h-7 w-16" />
      ) : (
        <p className={`mt-1 text-2xl font-bold leading-8 ${TONE_TEXT[tone]}`}>{value}</p>
      )}
      {progress !== undefined && <ProgressBar value={progress} label={label} size="sm" className="mt-2" tone={progress >= 100 ? 'success' : 'accent'} />}
      {to && toLabel && (
        <Link
          to={to}
          className="type-meta mt-2 inline-block font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {toLabel}
        </Link>
      )}
    </Card>
  );
}

interface ProjectCardProps {
  project: ProjectSummary;
  progress?: { total: number; completed: number };
  onEdit: () => void;
  onColorChange: (color: string) => void;
}

function ProjectCard({ project, progress, onEdit, onColorChange }: ProjectCardProps) {
  const taskCount = project.columns.reduce((sum, c) => sum + c._count.tasks, 0);
  return (
    <Card variant="interactive" as="article" className="group relative p-5">
      <div className="mb-3 flex items-center justify-between">
        <span
          className="h-1.5 w-10 rounded-full"
          style={{ backgroundColor: project.color ?? 'rgb(var(--accent))' }}
          aria-hidden="true"
        />
        <span className="flex items-center gap-1">
          <ColorPopover
            value={project.color}
            onChange={(color) => {
              onColorChange(color);
            }}
            ariaLabel={`Change color of ${project.name}`}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onEdit();
            }}
            aria-label={`Edit project ${project.name}`}
            className="px-1.5 text-ink-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:text-ink"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </span>
      </div>

      <h3 className="type-card-title font-semibold text-ink">
        <Link
          to={`/projects/${project.id}`}
          className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent after:absolute after:inset-0 hover:text-accent"
        >
          {project.name}
        </Link>
      </h3>
      {project.description && (
        <p className="type-caption mt-1 line-clamp-2 text-ink-secondary">{project.description}</p>
      )}

      {/* Progress from real analytics data */}
      <div className="mt-4">
        {progress && progress.total > 0 ? (
          <>
            <ProgressBar
              value={(progress.completed / progress.total) * 100}
              label={`${project.name} progress`}
              size="sm"
              tone={progress.completed >= progress.total ? 'success' : 'accent'}
            />
            <p className="type-meta mt-1.5 text-ink-muted">
              {progress.completed} of {progress.total} tasks completed
            </p>
          </>
        ) : (
          <p className="type-meta text-ink-muted">
            {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
          </p>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center -space-x-1.5">
          {project.members.slice(0, 4).map((m) => (
            <Avatar key={m.id} name={m.user.name} size="xs" className="border-2 border-surface" />
          ))}
          {project.members.length > 4 && (
            <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface bg-surface-muted text-[10px] font-semibold text-ink-muted">
              +{project.members.length - 4}
            </span>
          )}
        </div>
        <p className="type-meta text-ink-muted">{formatDistanceToNow(new Date(project.createdAt), { addSuffix: true })}</p>
      </div>
    </Card>
  );
}
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      {/* Header */}
      <SectionHeading
        title={`Welcome back, ${user?.name?.split(' ')[0] ?? 'there'}`}
        description={
          stats && stats.overdueTasks > 0
            ? `You have ${stats.overdueTasks} overdue ${stats.overdueTasks === 1 ? 'task' : 'tasks'} across your projects.`
            : 'Here’s how your projects are moving.'
        }
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New project
          </Button>
        }
      />

      {/* Key metrics — only numbers the user can act on */}
      <section aria-label="Overview" className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard label="Active projects" value={stats ? String(stats.totalProjects) : undefined} tone="accent" />
        <MetricCard
          label="Tasks completed"
          value={stats ? `${stats.completedTasks} of ${stats.totalTasks}` : undefined}
          progress={stats && stats.totalTasks > 0 ? (stats.completedTasks / stats.totalTasks) * 100 : undefined}
          tone="success"
        />
        <MetricCard
          label="Needs attention"
          value={stats ? String(stats.overdueTasks) : undefined}
          icon={<TriangleAlert className="hidden h-4 w-4" aria-hidden="true" />}
          tone={(stats?.overdueTasks ?? 0) > 0 ? 'warning' : 'neutral'}
        />
      </section>

      {/* Recent activity — real cross-project feed from GET /api/activities */}
      {recentActivities && recentActivities.length > 0 && (
        <section aria-labelledby="activity-title" className="mt-10">
          <SectionHeading
            id="activity-title"
            title="Recent activity"
            description="What happened across your projects lately."
          />
          <Card className="mt-5 p-4">
            <ul className="grid gap-x-6 gap-y-2 md:grid-cols-2">
              {recentActivities.map((activity: Activity & { projectName: string }) => (
                <li
                  key={activity.id}
                  className="flex min-w-0 items-baseline gap-1.5 text-xs text-ink-secondary"
                >
                  <span className="font-medium text-ink">
                    {activity.user.name === user?.name ? 'You' : activity.user.name}
                  </span>{' '}
                  {activity.action.replace(/_/g, ' ').toLowerCase()}
                  {'in '}
                  <Link
                    to={`/projects/${activity.projectId}`}
                    className="truncate font-medium text-accent hover:underline"
                  >
                    {activity.projectName}
                  </Link>
                  {activity.metadata &&
                    'title' in activity.metadata &&
                    typeof activity.metadata.title === 'string' && (
                      <span className="truncate font-medium text-ink"> · {activity.metadata.title}</span>
                    )}
                  <span className="ml-auto shrink-0 text-[10px] text-ink-muted">
                    {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      {/* Active projects — primary block */}
      <section aria-labelledby="projects-title" className="mt-10">
        <SectionHeading id="projects-title" title="Your projects" description="Open a board to see and organize its tasks." />
        <div className="mt-5">
          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="space-y-3 p-5">
                  <Skeleton className="h-2 w-10" />
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-1.5 w-full" />
                </Card>
              ))}
            </div>
          ) : error ? (
            <Card className="p-0">
              <ErrorState error={error} title="Unable to load projects" onRetry={() => void refetch()} />
            </Card>
          ) : projects && projects.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  progress={stats?.byProject.find((b) => b.projectId === project.id)}
                  onEdit={() => setSettingsProject(project)}
                  onColorChange={(color) =>
                    updateProject.mutate(
                      { projectId: project.id, color },
                      {
                        onSuccess: () => toast('success', 'Color updated'),
                        onError: () => toast('error', 'Unable to update color'),
                      }
                    )
                  }
                />
              ))}
            </div>
          ) : (
            <Card className="p-0">
              <EmptyState
                icon={<FolderKanban className="h-8 w-8" aria-hidden="true" />}
                title="No projects yet"
                description="Create your first project and start arranging tasks on its board."
                action={
                  <Button onClick={() => setOpen(true)}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Create a project
                  </Button>
                }
              />
            </Card>
          )}
        </div>
      </section>

      {/* New project wizard (4 steps: basics → columns → members → review) */}
      {open && <CreateProjectWizard onClose={() => setOpen(false)} />}

      {/* Project settings modal */}
      {settingsProject && (
        <ProjectSettingsModal
          project={settingsProject}
          canDelete={settingsProject.ownerId === user?.id}
          onClose={() => setSettingsProject(null)}
        />
      )}

      {/* First-run onboarding — only while the account has no projects */}
      <OnboardingModal
        open={showOnboarding && !isLoading && (projects?.length ?? 0) === 0}
        onClose={() => setShowOnboarding(false)}
        onCreateProject={() => setOpen(true)}
      />
    </div>
  );
}