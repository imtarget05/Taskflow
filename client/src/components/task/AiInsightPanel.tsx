import { useState } from 'react';
import { Sparkles, Wand2 } from 'lucide-react';
import { useAnalyseText, type AnalyseResponse } from '@/hooks/useNlp';
import { Badge, Button } from '@/components/ui';

interface AiInsightPanelProps {
  projectId: string;
  taskId: string;
  /** Text to analyse: task title + description. */
  text: string;
  /** Called when the user accepts the AI-suggested priority. */
  onApplyPriority?: (priority: AnalyseResponse['priority']) => void;
}

const PRIORITY_TONE: Record<AnalyseResponse['priority'], 'neutral' | 'info' | 'warning' | 'danger'> = {
  LOW: 'neutral',
  MEDIUM: 'info',
  HIGH: 'warning',
  URGENT: 'danger',
};

const SENTIMENT_LABEL_VI: Record<AnalyseResponse['sentiment'], string> = {
  positive: 'tích cực',
  neutral: 'trung lập',
  negative: 'tiêu cực',
};

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/**
 * "Phân tích AI" panel inside the TaskDetail drawer. Sends the task text to
 * POST /api/nlp/analyse and shows the classification (category / priority /
 * sentiment / keywords). The suggested priority can be applied to the task
 * with one click.
 */
export default function AiInsightPanel({ projectId, taskId, text, onApplyPriority }: AiInsightPanelProps) {
  const analyse = useAnalyseText();
  const [result, setResult] = useState<AnalyseResponse | null>(null);

  function run() {
    analyse.mutate(
      { projectId, taskId, text },
      { onSuccess: (data) => setResult(data) }
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">AI insight</p>
        <Button
          variant="secondary"
          size="sm"
          onClick={run}
          loading={analyse.isPending}
          disabled={!text.trim()}
          aria-label="Phân tích AI"
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Phân tích AI
        </Button>
      </div>

      {!result && (
        <p className="mt-1.5 text-xs text-ink-muted">
          Gợi ý phân loại, mức ưu tiên và từ khoá dựa trên tiêu đề + mô tả.
        </p>
      )}

      {analyse.isError && (
        <p role="alert" className="mt-1.5 text-xs text-danger">
          Không phân tích được văn bản này. Vui lòng thử lại sau.
        </p>
      )}

      {result && (
        <div className="mt-2 space-y-2 rounded-lg border border-line bg-card p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={PRIORITY_TONE[result.priority]}>{result.priority}</Badge>
            <Badge tone="neutral">{SENTIMENT_LABEL_VI[result.sentiment]}</Badge>
            {result.urgency && <Badge tone="danger">khẩn</Badge>}
            <span className="text-xs text-ink-secondary">{result.category}</span>
          </div>
          <p className="text-[11px] text-ink-muted">
            Độ tin cậy: phân loại {pct(result.categoryConfidence)} · ưu tiên {pct(result.priorityConfidence)}
            {result.duplicateScore != null && ` · trùng lặp ${pct(result.duplicateScore)}`}
          </p>
          {result.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {result.keywords.map((k) => (
                <span
                  key={k}
                  className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent-ink"
                >
                  {k}
                </span>
              ))}
            </div>
          )}
          {onApplyPriority && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => onApplyPriority(result.priority)}
              aria-label={`Áp dụng ưu tiên ${result.priority}`}
            >
              <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
              Áp dụng ưu tiên {result.priority}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
