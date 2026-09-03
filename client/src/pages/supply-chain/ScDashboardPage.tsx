import { useState } from 'react';
import { Plus, FileSpreadsheet, FileText, Package } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useProjects } from '@/hooks/useProjects';
import { useSCDashboard, useSCDashboardExport } from '@/hooks/useSupplyChain';
import { useToast } from '@/store/toast';
import { Button, Card, ErrorState, Skeleton } from '@/components/ui';
import ProgressBar from '@/components/ui/ProgressBar';

function downloadText(text: string, filename: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ScDashboardPage() {
  const { data: projects } = useProjects();
  const { toast } = useToast();
  const navigate = useNavigate();

  const defaultProject = projects?.[0];
  const [projectId] = useState<string | null>(defaultProject?.id ?? null);

  const { data: metrics, isLoading, error } = useSCDashboard(projectId ?? undefined);
  const exportCsv = useSCDashboardExport(projectId ?? '');
  const exportTxt = useSCDashboardExport(projectId ?? '');

  const handleExport = async (type: 'csv' | 'txt') => {
    try {
      const fn = type === 'csv' ? exportCsv.mutateAsync : exportTxt.mutateAsync;
      const result = await fn({ type });
      downloadText(result.content, result.filename, type === 'csv' ? 'text/csv' : 'text/plain');
      toast('success', `Đã tải xuống ${type.toUpperCase()}`);
    } catch {
      toast('error', `Xuất ${type.toUpperCase()} thất bại`);
    }
  };

  if (!projectId) {
    return (
      <div className="p-6">
        <Card className="p-8 text-center">
          <Package className="mx-auto h-12 w-12 text-ink-muted" />
          <h3 className="mt-4 text-lg font-semibold text-ink">Chưa có dự án</h3>
          <p className="mt-2 text-sm text-ink-secondary">
            Supply Chain yêu cầu bạn tham gia ít nhất một dự án.
          </p>
          <Button className="mt-4" onClick={() => navigate('/dashboard')}>
            Đi tới Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <ErrorState
        title="Không thể tải dashboard"
        message="Có thể bạn chưa là thành viên của dự án này."
        onRetry={() => window.location.reload()}
        className="h-full"
      />
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="type-headline-m3 font-medium text-ink">Supply Chain</h1>
          <p className="text-sm text-ink-secondary">
            Dự án: {defaultProject?.name ?? 'Chưa chọn'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => handleExport('csv')} disabled={exportCsv.isPending}>
            <FileSpreadsheet className="h-4 w-4" />
            CSV
          </Button>
          <Button variant="secondary" size="sm" onClick={() => handleExport('txt')} disabled={exportTxt.isPending}>
            <FileText className="h-4 w-4" />
            TXT
          </Button>
          <Button variant="primary" size="sm" onClick={() => navigate('/supply-chain/orders')}>
            <Plus className="h-4 w-4" />
            Đơn hàng mới
          </Button>
        </div>
      </div>

      {/* Order Stats */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-ink-muted">
          Đơn hàng (PO)
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'Tổng PO', value: metrics.totalPO },
            { label: 'Chờ phê duyệt', value: metrics.pendingApproval },
            { label: 'Đã duyệt', value: metrics.approved },
            { label: 'Đã giao', value: metrics.shipped },
          ].map((stat) => (
            <Card key={stat.label} className="p-4 text-center">
              <div className="text-2xl font-bold text-ink">{stat.value}</div>
              <div className="text-xs text-ink-muted">{stat.label}</div>
            </Card>
          ))}
          <Card className="col-span-2 sm:col-span-4 p-4">
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span>Tỷ lệ fulfillment</span>
                <span className="font-medium">{metrics.fulfillmentRate}%</span>
              </div>
              <ProgressBar value={metrics.fulfillmentRate} tone="success" size="sm" />
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
