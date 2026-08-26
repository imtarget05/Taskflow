import { useState } from 'react';
import { FolderKanban, Plus, TriangleAlert } from 'lucide-react';
import { useProjects, useUpdateProject, useRecentActivities } from '@/hooks/useProjects';
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
