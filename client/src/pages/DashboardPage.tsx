import { useState } from 'react';
import { FolderKanban, Users, CheckCheck, AlertTriangle, Plus, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useProjects, useRecentActivities, useMyTasks } from '@/hooks/useProjects';
import { useRecommendations } from '@/hooks/useRecommendations';
import { useAnalyticsOverview } from '@/hooks/useAnalytics';
import { useAuth } from '@/store/auth';
import { useToast } from '@/store/toast';
import type { ProjectSummary } from '@/types';
import ProjectSettingsModal from '@/components/project/ProjectSettingsModal';
import CreateProjectWizard from '@/components/project/CreateProjectWizard';
import OnboardingModal from '@/components/onboarding/OnboardingModal';
import { onboardingDismissed } from '@/lib/onboarding';
import { Button, Card, ErrorState, SectionHeading } from '@/components/ui';
import { StatCard, ProjectCard, EmptyProjectState } from './dashboard/DashboardCards';
import { PriorityFeed } from './dashboard/PriorityFeed';

export default function DashboardPage() {
  const { data: projects, isLoading, error, refetch } = useProjects();
  const { data: stats } = useAnalyticsOverview();
  const { data: recentActivities } = useRecentActivities(12);
  const { data: myTasks } = useMyTasks();
  const { data: topRecommendations } = useRecommendations();
  const { user } = useAuth();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  // toast is used by CreateProjectWizard internally
  void toast;
  const [showOnboarding, setShowOnboarding] = useState(() => !onboardingDismissed());
  const [settingsProject, setSettingsProject] = useState<ProjectSummary | null>(null);

  const projectList = projects ?? [];
  const activityList = recentActivities ?? [];
  const taskList = myTasks ?? [];

  const totalProjects = projectList.length;
  const completedTasks = stats?.completedTasks ?? 0;
  const totalTasks = stats?.totalTasks ?? 0;
  const overdueCount = stats?.overdueTasks ?? 0;
  const teamMembers = new Set(projectList.flatMap(p => p.members.map(m => m.user.id))).size;

  const handleViewAllActivities = () => {
    // Navigate to activity page or open modal
  };

  const handleViewAllTasks = () => {
    // Navigate to tasks page
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
      {/* Sticky Header Bar */}
      <header className="sticky top-0 z-10 mb-6 flex items-center justify-between gap-4 rounded-xl bg-surfaceContainerLow px-4 py-3 shadow-elevation1 border border-outlineVariant/60">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primaryContainer text-onPrimaryContainer">
            <FolderKanban className="h-5 w-5" aria-hidden="true" />
          </span>
          <h1 className="type-headline-m3 font-medium text-ink">Bảng điều khiển</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={() => setOpen(true)} className="shadow-elevation1">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Dự án mới
          </Button>
        </div>
      </header>

      {/* Metrics Row — 4 equal cards */}
      <section aria-label="Chỉ số tổng quan" className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Dự án đang hoạt động"
          value={String(totalProjects)}
          tone="primary"
          icon={<FolderKanban className="h-5 w-5" aria-hidden="true" />}
          delay={0}
        />
        <StatCard
          label="Task đã hoàn thành"
          value={`${completedTasks} / ${totalTasks}`}
          tone="success"
          icon={<CheckCheck className="h-5 w-5" aria-hidden="true" />}
          delay={80}
        />
        <StatCard
          label="Cần chú ý"
          value={String(overdueCount)}
          tone={overdueCount > 0 ? 'warning' : 'success'}
          icon={<AlertTriangle className="h-5 w-5" aria-hidden="true" />}
          delay={160}
        />
        <StatCard
          label="Thành viên team"
          value={String(teamMembers)}
          tone="info"
          icon={<Users className="h-5 w-5" aria-hidden="true" />}
          delay={240}
        />
      </section>

      {/* Main Content: Projects | Priority Feed */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: My Projects (2/3 width) */}
        <section aria-labelledby="projects-title" className="lg:col-span-2">
          <div className="flex items-center justify-between gap-2 mb-4">
            <SectionHeading id="projects-title" title="Dự án của bạn" description="Mở bảng để xem và sắp xếp task." />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {isLoading ? (
              [1, 2, 3, 4].map((i) => (
                <Card key={i} variant="outlined" className="space-y-3 border-outlineVariant/60 bg-surfaceContainerLow p-5 animate-pulse">
                  <div className="h-1.5 w-12 rounded-full bg-surfaceContainerHighest" />
                  <div className="h-5 w-3/4 rounded-lg bg-surfaceContainerHighest" />
                  <div className="h-4 w-full rounded-lg bg-surfaceContainerHighest" />
                  <div className="h-1.5 w-full rounded-full bg-surfaceContainerHighest" />
                </Card>
              ))
            ) : error ? (
              <Card className="p-0 sm:col-span-2">
                <ErrorState error={error} title="Không thể tải dự án" onRetry={() => void refetch()} />
              </Card>
            ) : projectList.length > 0 ? (
              projectList.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  taskCount={project.columns.reduce((sum, c) => sum + c._count.tasks, 0)}
                />
              ))
            ) : (
              <EmptyProjectState onCreate={() => setOpen(true)} className="sm:col-span-2" />
            )}
          </div>
        </section>

        {/* Right: Priority Feed (1/3 width) */}
        <aside aria-labelledby="priority-feed-title" className="lg:col-span-1">
          <PriorityFeed
            activities={activityList}
            myTasks={taskList}
            currentUserName={user?.name}
            currentUserId={user?.id}
            onViewAllActivities={handleViewAllActivities}
            onViewAllTasks={handleViewAllTasks}
          />
        </aside>
      </div>

      {/* Top Recommendations Widget — M3 elevated cards */}
      {topRecommendations && topRecommendations.length > 0 && (
        <section aria-labelledby="recommendations-title" className="mt-10">
          <SectionHeading
            id="recommendations-title"
            title="Đề xuất task"
            description="Task phù hợp với bạn dựa trên kỹ năng và lịch rảnh."
            action={
              <Link
                to="/recommendations"
                className="inline-flex items-center gap-1.5 rounded-full bg-primaryContainer px-3 py-1.5 text-sm font-medium text-onPrimaryContainer hover:opacity-90 focus-m3"
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
                className="group rounded-xl border border-outlineVariant/60 bg-surfaceContainerLow p-4 shadow-elevation1 transition-all hover:shadow-elevation2 hover:-translate-y-0.5 focus-m3-soft"
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
        open={showOnboarding && !isLoading && projectList.length === 0}
        onClose={() => setShowOnboarding(false)}
        onCreateProject={() => setOpen(true)}
      />
    </div>
  );
}