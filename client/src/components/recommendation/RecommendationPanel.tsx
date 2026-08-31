import { RefreshCw } from 'lucide-react';
import { Button, EmptyState, Skeleton } from '@/components/ui';
import type { TaskRecommendation } from '@/types';
import RecommendationCard from './RecommendationCard';

interface RecommendationPanelProps {
  recommendations?: TaskRecommendation[];
  isLoading?: boolean;
  isRefreshing?: boolean;
  onRefresh: () => void;
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
  acceptingId?: string;
  dismissingId?: string;
}

function RecommendationCardSkeleton() {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-5 w-12" />
      </div>
      <Skeleton className="mt-2 h-3 w-24" />
      <Skeleton className="mt-3 h-3 w-full" />
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-8 flex-1" />
        <Skeleton className="h-8 flex-1" />
      </div>
    </div>
  );
}

export default function RecommendationPanel({
  recommendations,
  isLoading,
  isRefreshing,
  onRefresh,
  onAccept,
  onDismiss,
  acceptingId,
  dismissingId,
}: RecommendationPanelProps) {
  const sorted = recommendations
    ? [...recommendations].sort((a, b) => b.score - a.score)
    : [];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Đề xuất cho bạn</h3>
        <Button
          size="sm"
          variant="ghost"
          onClick={onRefresh}
          loading={isRefreshing}
          aria-label="Làm mới đề xuất"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {!isRefreshing && <span className="ml-1.5 hidden sm:inline">Làm mới</span>}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <RecommendationCardSkeleton />
          <RecommendationCardSkeleton />
          <RecommendationCardSkeleton />
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState
          title="Chưa có đề xuất"
          description="Hệ thống đang phân tích để đề xuất task phù hợp. Hãy thử làm mới sau."
        />
      ) : (
        <div className="space-y-3">
          {sorted.map((rec) => (
            <RecommendationCard
              key={rec.id}
              recommendation={rec}
              onAccept={onAccept}
              onDismiss={onDismiss}
              isAccepting={acceptingId === rec.id}
              isDismissing={dismissingId === rec.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
