import { useState } from 'react';
import { ClipboardCheck, Play } from 'lucide-react';
import { useEvaluationHistory, useRunEvaluation } from '@/hooks/usePromptsMlops';
import { useToast } from '@/store/toast';
import { Button, Card, Badge, Input, Modal, Skeleton, EmptyState } from '@/components/ui';
import { Textarea } from '@/components/ui';
import AiPageNav from './AiPageNav';

export default function EvaluationPage() {
  const { toast } = useToast();
  const { data: runs, isLoading, refetch } = useEvaluationHistory();
  const runEval = useRunEvaluation();
  const [showNew, setShowNew] = useState(false);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="type-headline-m3 font-medium text-ink">Evaluation Runs</h1>
          <p className="text-sm text-ink-secondary">RAGAS metrics cho chất lượng LLM outputs</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowNew(true)}>
          <Play className="h-4 w-4" /> Chạy evaluation
        </Button>
      </div>

      <AiPageNav />

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : !runs || runs.length === 0 ? (
        <EmptyState icon={<ClipboardCheck className="h-6 w-6" />} title="Chưa có run nào" description="Chạy evaluation đầu tiên với eval set." />
      ) : (
        <div className="space-y-2">
          {runs.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-ink">{r.name}</h3>
                    {r.promptVersion && <Badge tone="accent">v{r.promptVersion}</Badge>}
                    <span className="text-xs text-ink-muted">n={r.datasetSize}</span>
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">
                    {r.createdAt ? new Date(r.createdAt).toLocaleString('vi-VN') : '—'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(r.metrics).map(([k, v]) => (
                    <span key={k} className="rounded-full bg-surfaceContainer px-2.5 py-1 text-[11px] text-ink-secondary">
                      {k}: <strong className="text-ink">{(v * 100).toFixed(1)}%</strong>
                    </span>
                  ))}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showNew && (
        <RunEvalModal
          onClose={() => setShowNew(false)}
          onSubmit={async (data) => {
            try { await runEval.mutateAsync(data); toast('success', 'Đã chạy evaluation'); setShowNew(false); refetch(); }
            catch { toast('error', 'Chạy evaluation thất bại'); }
          }}
        />
      )}
    </div>
  );
}

function RunEvalModal({ onClose, onSubmit }: {
  onClose: () => void;
  onSubmit: (d: {
    name: string;
    items: { question: string; answer?: string; context: string[]; accuracy?: number }[];
  }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [itemsJson, setItemsJson] = useState(JSON.stringify([
    {
      question: 'Hệ thống TaskFlow dùng model nào?',
      answer: 'TaskFlow dùng Ollama qwen2.5:7b cho LLM cục bộ.',
      context: ['TaskFlow là nền tảng Kanban cộng tác thời gian thực.', 'LLM mặc định là qwen2.5:7b chạy qua Ollama.'],
      accuracy: 0.95,
    },
  ], null, 2));
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      title="Chạy evaluation"
      open={true}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button variant="primary" disabled={busy} onClick={async () => {
            if (!name) { alert('Vui lòng nhập tên run'); return; }
            let items: unknown[];
            try { items = JSON.parse(itemsJson); }
            catch { alert('Items JSON không hợp lệ'); return; }
            if (!Array.isArray(items) || items.length === 0) { alert('Cần ít nhất 1 item'); return; }
            setBusy(true);
            await onSubmit({ name, items: items as { question: string; answer?: string; context: string[]; accuracy?: number }[] });
            setBusy(false);
          }}>
            {busy ? 'Đang chạy...' : 'Chạy'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Tên run" value={name} onChange={(e) => setName(e.target.value)} />
        <Textarea
          label="Items (JSON — question/answer/context/accuracy?)"
          rows={10}
          value={itemsJson}
          onChange={(e) => setItemsJson(e.target.value)}
        />
        <p className="text-xs text-ink-muted">
          Mỗi item: question (bắt buộc), answer, context (mảng chuỗi), accuracy 0–1 (tuỳ chọn).
        </p>
      </div>
    </Modal>
  );
}