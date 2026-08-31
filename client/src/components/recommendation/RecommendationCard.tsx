import { Check, X } from 'lucide-react';
import { Badge, Button, Card } from '@/components/ui';
import type { TaskRecommendation, TaskPriority } from '@/types';

interface RecommendationCardProps {
  recommendation: TaskRecommendation;
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
  isAccepting?: boolean;
  isDismissing?: boolean;
}

const PRIORITY_TONE: Record<TaskPriority, 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent'> = {
  LOW: 'neutral',
  MEDIUM: 'info',
  HIGH: 'warning',
  URGENT: 'danger',
};

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  LOW: 'Thấp',
  MEDIUM: 'Trung bình',
  HIGH: 'Cao',
  URGENT: 'Khẩn cấp',
};

function scoreTone(score: number): 'success' | 'warning' | 'danger' {
  if (score >= 0.7) return 'success';
  if (score >= 0.4) return 'warning';
  return 'danger';
}

export default function RecommendationCard({
  recommendation,
  onAccept,
  onDismiss,
  isAccepting,
  isDismissing,
}: RecommendationCardProps) {
  const { task, score, reason, factors } = recommendation;

  return (
    <Card className="p-4 transition-shadow hover:shadow-card-hover">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="truncate text-sm font-semibold text-ink">
              {task?.title ?? 'Task không xác định'}
            </h4>
            {task?.priority && (
              <Badge tone={PRIORITY_TONE[task.priority]}>
                {PRIORITY_LABEL[task.priority]}
              </Badge>
            )}
          </div>
          {task?.projectName && (
            <p className="mt-0.5 text-xs text-ink-muted">{task.projectName}</p>
          )}
        </div>
        <Badge tone={scoreTone(score)} className="shrink-0">
          {Math.round(score * 100)}%
        </Badge>
      </div>

      {reason && (
        <p className="mt-2 text-xs text-ink-secondary">{reason}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-ink-muted">
        <span>Kỹ năng: {Math.round(factors.skillMatch * 100)}%</span>
        <span>Thời gian: {Math.round(factors.availability * 100)}%</span>
        <span>Ưu tiên: {Math.round(factors.priority * 100)}%</span>
        <span>Lịch sử: {Math.round(factors.history * 100)}%</span>
        <span>Tải: {Math.round(factors.workloadBalance * 100)}%</span>
      </div>

      <div className="mt-4 flex gap-2">
        <Button
          size="sm"
          variant="primary"
          onClick={() => onAccept(recommendation.id)}
          loading={isAccepting}
          className="flex-1"
        >
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          Nhận task
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onDismiss(recommendation.id)}
          loading={isDismissing}
          className="flex-1"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          Bỏ qua
        </Button>
      </div>
    </Card>
  );
}
