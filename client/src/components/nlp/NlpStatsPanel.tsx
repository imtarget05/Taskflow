import { useNlpStats } from '@/hooks/useNlp';
import { Card } from '@/components/ui';

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/**
 * Implicit NLP eval dashboard — the "eval ngầm" from real user behavior.
 * Shows per-category apply rate (1-click apply = positive label) and the
 * priorityConfidence distribution across analysed tickets.
 */
export default function NlpStatsPanel() {
  const { data, isLoading, isError } = useNlpStats();

  if (isLoading) {
    return (
      <Card className="p-4">
        <p className="text-sm text-ink-muted">Đang tải thống kê phân tích…</p>
      </Card>
    );
  }
  if (isError || !data) {
    return (
      <Card className="p-4">
        <p className="text-sm text-danger">Không tải được thống kê.</p>
      </Card>
    );
  }

  if (data.totalFeedback === 0) {
    return (
      <Card className="p-4">
        <p className="text-sm text-ink-muted">
          Chưa có dữ liệu. Dùng nút “Phân tích AI” trong task để bắt đầu thu thập phản hồi ngầm.
        </p>
      </Card>
    );
  }

  return (
    <Card className="space-y-4 p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Chất lượng phân tích NLP (từ hành vi thật)
        </p>
        <p className="mt-1 text-sm text-ink-secondary">
          Tỷ lệ áp dụng chung:{' '}
          <span className="font-semibold text-ink">{pct(data.overallApplyRate)}</span> ·{' '}
          {data.totalFeedback} lượt phản hồi
        </p>
      </div>

      {data.byCategory.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-ink-muted">Tỷ lệ áp dụng theo phân loại</p>
          <div className="space-y-1.5">
            {data.byCategory.map((row) => (
              <div key={row.category} className="flex items-center gap-2 text-sm">
                <span className="w-40 shrink-0 truncate text-ink-secondary" title={row.category}>
                  {row.category}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-success"
                    style={{ width: pct(row.applyRate) }}
                    aria-hidden="true"
                  />
                </div>
                <span className="w-12 shrink-0 text-right text-xs text-ink-muted">
                  {pct(row.applyRate)}
                </span>
                <span className="w-12 shrink-0 text-right text-xs text-ink-muted">
                  {row.total}×
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-xs font-medium text-ink-muted">Phân bố độ tin cậy ưu tiên</p>
        <div className="flex flex-wrap gap-1.5">
          {data.confidenceBuckets.map((b) => (
            <span
              key={b.bucket}
              className="rounded-md bg-surface-2 px-2 py-1 text-xs text-ink-secondary"
              title={`${b.bucket}: ${b.count} ticket`}
            >
              {b.bucket}: {b.count}
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}
