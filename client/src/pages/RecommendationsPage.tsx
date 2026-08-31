import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useRecommendations, useRefreshRecommendations, useAcceptRecommendation, useDismissRecommendation } from '@/hooks/useRecommendations';
import { useRecommendationStats } from '@/hooks/useRecommendations';
import { useUserSkills, useUpdateUserSkills } from '@/hooks/useRecommendations';
import { useUserAvailability, useUpdateUserAvailability } from '@/hooks/useRecommendations';
import { useToast } from '@/store/toast';
import { SectionHeading } from '@/components/ui';
import RecommendationPanel from '@/components/recommendation/RecommendationPanel';
import RecommendationStats from '@/components/recommendation/RecommendationStats';
import SkillEditor from '@/components/recommendation/SkillEditor';
import AvailabilityEditor from '@/components/recommendation/AvailabilityEditor';


export default function RecommendationsPage() {
  const { toast } = useToast();
  const [acceptingId, setAcceptingId] = useState<string | undefined>();
  const [dismissingId, setDismissingId] = useState<string | undefined>();

  const { data: recommendations, isLoading, refetch } = useRecommendations();
  const { data: stats, isLoading: isLoadingStats } = useRecommendationStats();
  const { data: skills, isLoading: isLoadingSkills } = useUserSkills();
  const { data: availability, isLoading: isLoadingAvailability } = useUserAvailability();

  const refresh = useRefreshRecommendations();
  const accept = useAcceptRecommendation();
  const dismiss = useDismissRecommendation();
  const updateSkills = useUpdateUserSkills();
  const updateAvailability = useUpdateUserAvailability();

  async function handleRefresh() {
    try {
      await refresh.mutateAsync();
      toast('success', 'Đã làm mới đề xuất');
    } catch {
      toast('error', 'Không thể làm mới đề xuất');
    }
  }

  async function handleAccept(id: string) {
    setAcceptingId(id);
    try {
      await accept.mutateAsync(id);
      toast('success', 'Đã nhận task');
    } catch {
      toast('error', 'Không thể nhận task');
    } finally {
      setAcceptingId(undefined);
    }
  }

  async function handleDismiss(id: string) {
    setDismissingId(id);
    try {
      await dismiss.mutateAsync(id);
      toast('info', 'Đã bỏ qua đề xuất');
    } catch {
      toast('error', 'Không thể bỏ qua đề xuất');
    } finally {
      setDismissingId(undefined);
    }
  }

  async function handleSaveSkills(newSkills: { skill: string; level: number }[]) {
    try {
      await updateSkills.mutateAsync(newSkills);
      toast('success', 'Đã lưu kỹ năng');
      await refetch();
    } catch {
      toast('error', 'Không thể lưu kỹ năng');
    }
  }

  async function handleSaveAvailability(newAvailability: { dayOfWeek: number; morning: boolean; afternoon: boolean; evening: boolean }[]) {
    try {
      await updateAvailability.mutateAsync(
        newAvailability.map((a) => ({
          dayOfWeek: a.dayOfWeek,
          morning: a.morning,
          afternoon: a.afternoon,
          evening: a.evening,
        }))
      );
      toast('success', 'Đã lưu lịch rảnh');
      await refetch();
    } catch {
      toast('error', 'Không thể lưu lịch rảnh');
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <SectionHeading
        title="Đề xuất task"
        description="Hệ thống gợi ý task phù hợp dựa trên kỹ năng, lịch rảnh và tiến độ công việc của bạn."
      />

      <div className="mt-6">
        <RecommendationStats stats={stats} isLoading={isLoadingStats} />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecommendationPanel
            recommendations={recommendations}
            isLoading={isLoading}
            isRefreshing={refresh.isPending}
            onRefresh={handleRefresh}
            onAccept={handleAccept}
            onDismiss={handleDismiss}
            acceptingId={acceptingId}
            dismissingId={dismissingId}
          />
        </div>

        <div className="space-y-4">
          <SkillEditor
            skills={skills}
            isLoading={isLoadingSkills}
            isSaving={updateSkills.isPending}
            onSave={handleSaveSkills}
          />
          <AvailabilityEditor
            availability={availability}
            isLoading={isLoadingAvailability}
            isSaving={updateAvailability.isPending}
            onSave={handleSaveAvailability}
          />
        </div>
      </div>

      {recommendations && recommendations.length > 0 && (
        <div className="mt-6 flex justify-center">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Xem dashboard
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      )}
    </div>
  );
}
