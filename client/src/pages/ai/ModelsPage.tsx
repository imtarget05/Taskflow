import { useState } from 'react';
import { Server, Trash2, Plus, CheckCircle2 } from 'lucide-react';
import { useListModels, useModelStatus, usePullModel, useDeleteModel } from '@/hooks/useRagModels';
import { useToast } from '@/store/toast';
import { Button, Card, Input, Badge, EmptyState, Skeleton } from '@/components/ui';
import AiPageNav from './AiPageNav';

function fmtSize(bytes: number): string {
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} GB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} TB`;
}

export default function ModelsPage() {
  const { toast } = useToast();
  const { data: status } = useModelStatus();
  const { data: models, isLoading } = useListModels();
  const pull = usePullModel();
  const del = useDeleteModel();
  const [name, setName] = useState('');

  const handlePull = async () => {
    if (!name.trim()) { toast('error', 'Vui lòng nhập tên model'); return; }
    try {
      await pull.mutateAsync(name.trim());
      toast('success', `Đã pull model '${name.trim()}'`);
      setName('');
    } catch { toast('error', 'Pull thất bại — kiểm tra Ollama'); }
  };

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="type-headline-m3 font-medium text-ink">AI Models</h1>
          <p className="text-sm text-ink-secondary">Quản lý model Ollama cục bộ</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => window.location.reload()}>
          <Server className="h-4 w-4" /> Làm mới
        </Button>
      </div>

      <AiPageNav />

      <Card className="p-4">
        <div className="flex items-center gap-3">
          <Badge tone={status?.running ? 'success' : 'danger'}>
            {status?.running ? '● Ollama đang chạy' : '● Ollama chưa chạy'}
          </Badge>
          {status?.activeModel && (
            <span className="text-sm text-ink-secondary">
              Active: <strong className="text-ink">{status.activeModel}</strong>
              {status.modelValid ? ' (hợp lệ)' : ' (chưa có locally)'}
            </span>
          )}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-2 text-sm font-semibold text-ink">Pull model mới</h2>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input placeholder="VD: qwen2.5:7b" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handlePull()} />
          <Button variant="primary" onClick={handlePull} disabled={pull.isPending}>
            <Plus className="h-4 w-4" />
            {pull.isPending ? 'Đang pull...' : 'Pull'}
          </Button>
        </div>
      </Card>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : !models || models.length === 0 ? (
        <EmptyState icon={<Server className="h-6 w-6" />} title="Chưa có model nào" description="Pull một model ở trên hoặc mở Ollama." />
      ) : (
        <Card className="overflow-hidden"><div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-surfaceContainerHigh">
                <th className="pb-2.5 pl-4 font-medium text-ink-muted">Model</th>
                <th className="pb-2.5 px-2 text-right font-medium text-ink-muted">Kích thước</th>
                <th className="pb-2.5 pr-4 text-center font-medium text-ink-muted">Active</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => {
                const isActive = m.name === status?.activeModel;
                return (
                  <tr key={m.digest} className="border-b border-line/30 last:border-0">
                    <td className="py-2.5 pl-4 font-medium">{m.name}</td>
                    <td className="py-2.5 px-2 text-right">{fmtSize(m.size)}</td>
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center justify-center gap-2">
                        {isActive ? (
                          <Badge tone="success"><CheckCircle2 className="h-3.5 w-3.5" /> Active</Badge>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={async () => {
                            if (!confirm(`Xóa model ${m.name}?`)) return;
                            try { await del.mutateAsync(m.name); toast('success', 'Đã xóa'); }
                            catch { toast('error', 'Xóa thất bại'); }
                          }}>
                            <Trash2 className="h-4 w-4 text-danger" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div></Card>
      )}
    </div>
  );
}