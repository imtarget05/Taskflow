import { useState } from 'react';
import { CheckCheck, FolderKanban, Layers3, Plus, Sparkles, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useProjects, useUpdateProject, useRecentActivities } from '@/hooks/useProjects';
import { useRecommendations } from '@/hooks/useRecommendations';
import { useAnalyticsOverview } from '@/hooks/useAnalytics';
import { useAuth } from '@/store/auth';
import { useToast } from '@/store/toast';
import type { ProjectSummary } from '@/types';
import ProjectSettingsModal from '@/components/project/ProjectSettingsModal';
import CreateProjectWizard from '@/components/project/CreateProjectWizard';
import OnboardingModal from '@/components/onboarding/OnboardingModal';
import { onboardingDismissed } from '@/lib/onboarding';
import { Button, Card, EmptyState, ErrorState, SectionHeading } from '@/components/ui';
import { MetricCard, ProjectCard } from './dashboard/DashboardCards';
import { ProjectsLoadingGrid, RecentActivitySection } from './dashboard/RecentActivity';

/**
 * Dashboard — answers in ~5 seconds: what am I working on, what's progressing,
 * and what needs attention. Only real data (useProjects + analytics overview);
 * no fabricated trends or mock activity. Cards and the activity feed live in
 * ./dashboard/ to keep this file a composition layer.
 */
export default function DashboardPage() {
  const { data: projects, isLoading, error, refetch } = useProjects();
  const { data: stats } = useAnalyticsOverview();
  const { data: recentActivities } = useRecentActivities(12);
  const { data: topRecommendations } = useRecommendations();
  const updateProject = useUpdateProject();
  const { user } = useAuth();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  // First-run onboarding: only for accounts with zero projects whose browser
  // has not dismissed the walkthrough before.
  const [showOnboarding, setShowOnboarding] = useState(() => !onboardingDismissed());
  const [settingsProject, setSettingsProject] = useState<ProjectSummary | null>(null);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      {/* Hero — M3 tonal header */}
      <div className="rounded-xl bg-surfaceContainerLow px-5 py-5 shadow-elevation1 md:px-6 md:py-6">
        <SectionHeading
          title={`Welcome back, ${user?.name?.split(' ')[0] ?? 'there'}`}
          description={
            stats && stats.overdueTasks > 0
              ? `You have ${stats.overdueTasks} overdue ${stats.overdueTasks === 1 ? 'task' : 'tasks'} across your projects.`
              : 'Here’s how your projects are moving.'
          }
          action={
            <Button onClick={() => setOpen(true)} className="shadow-elevation1">
              <Plus className="h-4 w-4" aria-hidden="true" />
              New project
            </Button>
          }
        />
      </div>

      {/* Key metrics — M3 tonal cards with icons */}
      <section aria-label="Overview" className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          label="Active projects"
          value={stats ? String(stats.totalProjects) : undefined}
          tone="accent"
          delay={0}
          icon={<Layers3 className="h-5 w-5" aria-hidden="true" />}
        />
        <MetricCard
          label="Tasks completed"
          value={stats ? `${stats.completedTasks} of ${stats.totalTasks}` : undefined}
          progress={stats && stats.totalTasks > 0 ? (stats.completedTasks / stats.totalTasks) * 100 : undefined}
          tone="success"
          delay={80}
          icon={<CheckCheck className="h-5 w-5" aria-hidden="true" />}
        />
        <MetricCard
          label="Needs attention"
          value={stats ? String(stats.overdueTasks) : undefined}
          icon={<TriangleAlert className="h-5 w-5" aria-hidden="true" />}
          tone={(stats?.overdueTasks ?? 0) > 0 ? 'warning' : 'neutral'}
          delay={160}
        />
      </section>

      {/* Recent activity — real cross-project feed from GET /api/activities */}
      <RecentActivitySection activities={recentActivities ?? []} currentUserName={user?.name} />

      {/* Active projects — primary block */}
      <section aria-labelledby="projects-title" className="mt-10">
        <SectionHeading id="projects-title" title="Your projects" description="Open a board to see and organize its tasks." />
        <div className="mt-5">
          {isLoading ? (
            <ProjectsLoadingGrid />
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


      {/* Top recommendations widget — M3 elevated cards */}
      {topRecommendations && topRecommendations.length > 0 && (
        <section aria-labelledby="recommendations-title" className="mt-10">
          <SectionHeading
            id="recommendations-title"
            title="Đề xuất task"
            description="Task phù hợp với bạn dựa trên kỹ năng và lịch rảnh."
            action={
              <Link
                to="/recommendations"
                className="inline-flex items-center gap-1.5 rounded-full bg-primaryContainer px-3 py-1.5 text-sm font-medium text-onPrimaryContainer hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Xem tất cả
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            }
          />
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {topRecommendations.slice(0, 3).map((rec) => (
              <Link
                key={rec.id}
                to={`/projects/${rec.projectId}`}
                className="group rounded-xl border border-outlineVariant/60 bg-surfaceContainerLow p-4 shadow-elevation1 transition-all hover:shadow-elevation2 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <div className="flex items-start justify-between gap-2">
                  <h4 className="line-clamp-1 text-sm font-semibold text-ink group-hover:text-primary">{rec.task?.title ?? 'Task'}</h4>
                  <span className="shrink-0 rounded-full bg-primaryContainer px-2 py-0.5 text-[11px] font-bold text-onPrimaryContainer">
                    {Math.round(rec.score * 100)}%
                  </span>
                </div>
                {rec.task?.projectName && (
                  <p className="mt-1 truncate text-xs text-ink-muted">{rec.task.projectName}</p>
                )}
                {rec.reason && (
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-ink-secondary">{rec.reason}</p>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}
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
