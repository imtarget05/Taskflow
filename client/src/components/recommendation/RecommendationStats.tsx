import { CheckCircle, Clock, XCircle } from 'lucide-react';
import { Card } from '@/components/ui';
import type { RecommendationStats as Stats } from '@/types';

interface RecommendationStatsProps {
  stats?: Stats;
  isLoading?: boolean;
}

export default function RecommendationStats({ stats, isLoading }: RecommendationStatsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-ink-muted" aria-hidden="true" />
          <span className="text-xs font-medium text-ink-secondary">Chờ xử lý</span>
        </div>
        {isLoading ? (
          <div className="mt-2 h-7 w-12 animate-pulse rounded bg-surface-muted" />
        ) : (
          <p className="mt-1 text-2xl font-bold text-ink">{stats?.pending ?? 0}</p>
        )}
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-success" aria-hidden="true" />
          <span className="text-xs font-medium text-ink-secondary">Đã nhận</span>
        </div>
        {isLoading ? (
          <div className="mt-2 h-7 w-12 animate-pulse rounded bg-surface-muted" />
        ) : (
          <p className="mt-1 text-2xl font-bold text-success">{stats?.accepted ?? 0}</p>
        )}
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-2">
          <XCircle className="h-4 w-4 text-ink-muted" aria-hidden="true" />
          <span className="text-xs font-medium text-ink-secondary">Đã bỏ qua</span>
        </div>
        {isLoading ? (
          <div className="mt-2 h-7 w-12 animate-pulse rounded bg-surface-muted" />
        ) : (
          <p className="mt-1 text-2xl font-bold text-ink">{stats?.dismissed ?? 0}</p>
        )}
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-ink-secondary">Tỷ lệ nhận</span>
        </div>
        {isLoading ? (
          <div className="mt-2 h-7 w-16 animate-pulse rounded bg-surface-muted" />
        ) : (
          <p className="mt-1 text-2xl font-bold text-accent">
            {stats ? Math.round(stats.acceptRate * 100) : 0}%
          </p>
        )}
      </Card>
    </div>
  );
}
