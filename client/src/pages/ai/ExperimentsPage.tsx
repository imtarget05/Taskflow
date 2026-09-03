import { useState } from 'react';
import { Plus, FlaskConical, Gauge } from 'lucide-react';
import { useMLOpsExperiments, useCreateMLOpsExperiment, useRecordMLOpsMetrics } from '@/hooks/usePromptsMlops';
import { useToast } from '@/store/toast';
import { Button, Card, Badge, Input, Modal, Skeleton, EmptyState } from '@/components/ui';
import { Textarea } from '@/components/ui';
import AiPageNav from './AiPageNav';

export default function ExperimentsPage() {
  const { toast } = useToast();
  const { data: experiments, isLoading, refetch } = useMLOpsExperiments();
  const createExp = useCreateMLOpsExperiment();
  const record = useRecordMLOpsMetrics();
  const [showNew, setShowNew] = useState(false);
  const [recording, setRecording] = useState<string | null>(null);

  const statusTone = (s: string): 'success' | 'warning' | 'danger' | 'info' => {
    if (s === 'completed') return 'success';
    if (s === 'running') return 'info';
    if (s === 'failed') return 'danger';
    return 'warning';
  };

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="type-headline-m3 font-medium text-ink">Experiments</h1>
          <p className="text-sm text-ink-secondary">A/B retrieval configs + metrics (RAGAS)</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowNew(true)}>
          <Plus className="h-4 w-4" /> Tạo experiment
        </Button>
      </div>

      <AiPageNav />

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : !experiments || experiments.length === 0 ? (
        <EmptyState icon={<FlaskConical className="h-6 w-6" />} title="Chưa có experiment" description="Tạo experiment đầu tiên để so sánh cấu hình." />
      ) : (
        <div className="space-y-2">
          {experiments.map((e) => {
            const metrics = e.metrics ?? {};
            return (
              <Card key={e.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-medium text-ink">{e.name}</h3>
                      <Badge tone={statusTone(e.status)}>{e.status}</Badge>
                      <span className="text-xs text-ink-muted">n={e.datasetSize}</span>
                    </div>
                    {e.description && <p className="mt-1 text-xs text-ink-secondary">{e.description}</p>}
                    {Object.keys(metrics).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {Object.entries(metrics).map(([k, v]) => (
                          <span key={k} className="rounded-full bg-surfaceContainer px-2 py-0.5 text-[11px] text-ink-secondary">
                            {k}: <strong className="text-ink">{typeof v === 'number' ? v.toFixed(3) : String(v)}</strong>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {e.status === 'running' && (
                    <Button variant="ghost" size="sm" onClick={() => setRecording(e.id)}>
                      <Gauge className="h-4 w-4" /> Ghi metrics
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {showNew && (
        <NewExperimentModal
          onClose={() => setShowNew(false)}
          onSubmit={async (d) => {
            try { await createExp.mutateAsync(d); toast('success', 'Đã tạo experiment'); setShowNew(false); refetch(); }
            catch { toast('error', 'Tạo thất bại'); }
          }}
        />
      )}

      {recording && (
        <RecordMetricsModal
          onClose={() => setRecording(null)}
          onSubmit={async (metrics) => {
            try { await record.mutateAsync({ id: recording, metrics }); toast('success', 'Đã ghi metrics'); setRecording(null); refetch(); }
            catch { toast('error', 'Ghi metrics thất bại'); }
          }}
        />
      )}
    </div>
  );
}
function NewExperimentModal({ onClose, onSubmit }: {
  onClose: () => void;
  onSubmit: (d: { name: string; description?: string; config: Record<string, unknown> }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [configJson, setConfigJson] = useState('{\n  "topK": 5,\n  "rerank": false\n}');
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      title="Tạo experiment"
      open={true}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button variant="primary" disabled={busy} onClick={async () => {
            if (!name) { alert('Vui lòng nhập tên'); return; }
            let config: Record<string, unknown>;
            try { config = JSON.parse(configJson); }
            catch { alert('Config JSON không hợp lệ'); return; }
            setBusy(true);
            await onSubmit({ name, description: description || undefined, config });
            setBusy(false);
          }}>
            {busy ? 'Đang tạo...' : 'Tạo'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Tên" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Mô tả" value={description} onChange={(e) => setDescription(e.target.value)} />
        <Textarea label="Config (JSON)" rows={6} value={configJson} onChange={(e) => setConfigJson(e.target.value)} />
      </div>
    </Modal>
  );
}

function RecordMetricsModal({ onClose, onSubmit }: {
  onClose: () => void;
  onSubmit: (metrics: Record<string, number>) => Promise<void>;
}) {
  const [faithfulness, setFaithfulness] = useState('');
  const [answerRelevancy, setAnswerRelevancy] = useState('');
  const [contextRecall, setContextRecall] = useState('');
  const [contextPrecision, setContextPrecision] = useState('');
  const [avgLatency, setAvgLatency] = useState('');
  const [busy, setBusy] = useState(false);

  const num = (v: string) => (v.trim() === '' ? undefined : parseFloat(v));

  return (
    <Modal
      title="Ghi metrics"
      open={true}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button variant="primary" disabled={busy} onClick={async () => {
            const metrics: Record<string, number> = {};
            const pairs: [string, string][] = [
              ['faithfulness', faithfulness], ['answerRelevancy', answerRelevancy],
              ['contextRecall', contextRecall], ['contextPrecision', contextPrecision],
              ['avgLatency', avgLatency],
            ];
            for (const [k, v] of pairs) {
              const n = num(v);
              if (n !== undefined) metrics[k] = n;
            }
            if (Object.keys(metrics).length === 0) { alert('Nhập ít nhất một metric'); return; }
            setBusy(true);
            await onSubmit(metrics);
            setBusy(false);
          }}>
            {busy ? 'Đang ghi...' : 'Lưu metrics'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Input label="Faithfulness (0-1)" type="number" step="0.01" value={faithfulness} onChange={(e) => setFaithfulness(e.target.value)} />
        <Input label="Answer relevancy (0-1)" type="number" step="0.01" value={answerRelevancy} onChange={(e) => setAnswerRelevancy(e.target.value)} />
        <Input label="Context recall (0-1)" type="number" step="0.01" value={contextRecall} onChange={(e) => setContextRecall(e.target.value)} />
        <Input label="Context precision (0-1)" type="number" step="0.01" value={contextPrecision} onChange={(e) => setContextPrecision(e.target.value)} />
        <Input label="Avg latency (ms)" type="number" value={avgLatency} onChange={(e) => setAvgLatency(e.target.value)} />
      </div>
    </Modal>
  );
}