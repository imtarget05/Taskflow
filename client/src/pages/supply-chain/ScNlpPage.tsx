import { useState } from 'react';
import { Sparkles, Package, RotateCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useProjects } from '@/hooks/useProjects';
import { useAnalyseScOrder, useAgenticDecisions, useProcessOrder } from '@/hooks/useSupplyChain';
import type { AnalyseOrderResult } from '@/hooks/useSupplyChain';
import type { AgenticDecision } from '@/types';
import { useToast } from '@/store/toast';
import { Button, Card, Skeleton, Textarea, Input, Badge } from '@/components/ui';

export default function ScNlpPage() {
  const { data: projects } = useProjects();
  const { toast } = useToast();
  const navigate = useNavigate();
  const defaultProject = projects?.[0];
  const [projectId] = useState(defaultProject?.id ?? null);
  const [text, setText] = useState('');
  const [orderId, setOrderId] = useState('');
  const [analyseResult, setAnalyseResult] = useState<AnalyseOrderResult | null>(null);

  const analyse = useAnalyseScOrder();
  const process = useProcessOrder();
  const { data: decisions, isLoading: decisionsLoading, refetch } = useAgenticDecisions(projectId ?? undefined);

  const handleAnalyse = async () => {
    if (!text.trim()) { toast('error', 'Vui lòng nhập văn bản'); return; }
    try {
      const result = await analyse.mutateAsync({ text, projectId, orderId: orderId || undefined });
      setAnalyseResult(result);
      toast('success', 'Đã phân tích');
    } catch { toast('error', 'Phân tích thất bại'); }
  };

  const handleProcessOrder = async () => {
    if (!orderId) { toast('error', 'Vui lòng nhập Order ID'); return; }
    try {
      const result = await process.mutateAsync({ orderId, projectId: projectId as string });
      setAnalyseResult(result as unknown as AnalyseOrderResult);
      toast('success', 'Agentic engine đã xử lý');
      refetch();
    } catch { toast('error', 'Xử lý thất bại'); }
  };

  if (!projectId) {
    return (
      <div className="p-6"><Card className="p-8 text-center">
        <Package className="mx-auto h-12 w-12 text-ink-muted" />
        <h3 className="mt-4 text-lg font-semibold text-ink">Chưa có dự án</h3>
        <Button className="mt-4" onClick={() => navigate('/dashboard')}>Đi tới Dashboard</Button>
      </Card></div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <div>
        <h1 className="type-headline-m3 font-medium text-ink">Phân tích cung ứng (SC NLP)</h1>
        <p className="text-sm text-ink-secondary">Phân loại tài liệu order + Agentic decision engine</p>
      </div>

      <Card className="p-4">
        <h3 className="mb-2 text-sm font-semibold text-ink">Nhập văn bản để phân loại</h3>
        <Textarea
          rows={4}
          placeholder="VD: Yêu cầu mua hàng PO số 123..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Input
          className="mt-3"
          placeholder="Order ID (tuỳ chọn)"
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
        />
        <div className="mt-3 flex gap-2">
          <Button variant="primary" onClick={handleAnalyse} disabled={analyse.isPending}>
            <Sparkles className="h-4 w-4" />
            {analyse.isPending ? 'Đang phân tích...' : 'Phân tích NLP'}
          </Button>
          <Button variant="secondary" onClick={handleProcessOrder} disabled={process.isPending}>
            <RotateCw className="h-4 w-4" /> Agentic engine
          </Button>
        </div>
      </Card>

      {analyseResult && (
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-semibold text-ink">Kết quả phân tích</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <ResultRow label="Phân loại" value={analyseResult.classification} />
            <ResultRow label="Độ tin cậy" value={`${(analyseResult.confidence * 100).toFixed(0)}%`} />
            <ResultRow label="Hành động gợi ý" value={analyseResult.suggestedAction} />
            <ResultRow label="Trigger workflow" value={analyseResult.workflowTrigger} />
            <ResultRow label="Nguồn" value={analyseResult.llmUsed ? 'LLM' : 'Rule-based'} />
          </div>
        </Card>
      )}
<section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-ink-muted">
          Lịch sử quyết định (Agentic)
        </h2>
        {decisionsLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : !decisions || decisions.length === 0 ? (
          <Card className="p-4 text-center text-sm text-ink-muted">Chưa có quyết định nào.</Card>
        ) : (
          <Card className="overflow-hidden"><div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line bg-surfaceContainerHigh">
                  <th className="pb-2.5 pl-4 font-medium text-ink-muted">Order</th>
                  <th className="pb-2.5 px-2 font-medium text-ink-muted">Phân loại</th>
                  <th className="pb-2.5 px-2 font-medium text-ink-muted">Quyết định</th>
                  <th className="pb-2.5 px-2 font-medium text-ink-muted">Hành động</th>
                  <th className="pb-2.5 pr-4 font-medium text-ink-muted">Ngày</th>
                </tr>
              </thead>
              <tbody>
                {decisions.map((d: AgenticDecision) => (
                  <tr key={d.id} className="border-b border-line/30">
                    <td className="py-2.5 pl-4">{d.order?.orderNumber ?? '—'}</td>
                    <td className="py-2.5 px-2">{d.classification}</td>
                    <td className="py-2.5 px-2"><Badge tone="info">{d.decision}</Badge></td>
                    <td className="py-2.5 px-2 text-xs">{d.action}</td>
                    <td className="py-2.5 pr-4 text-ink-muted">
                      {d.createdAt ? new Date(d.createdAt).toLocaleString('vi-VN') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div></Card>
        )}
      </section>
    </div>
  );
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 rounded-lg bg-surfaceContainer px-3 py-2">
      <span className="text-ink-muted">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  );
}