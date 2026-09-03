import { useState } from 'react';
import { Search, Database, Zap, Cable } from 'lucide-react';
import { useProjects } from '@/hooks/useProjects';
import { useRagSearch, useRagIndex } from '@/hooks/useRagModels';
import { useToast } from '@/store/toast';
import { Button, Card, Input, Badge, EmptyState, Skeleton } from '@/components/ui';

export default function IntegrationsPage() {
  const { data: projects } = useProjects();
  const { toast } = useToast();
  const defaultProject = projects?.[0];
  const [projectId] = useState(defaultProject?.id ?? null);
  const [q, setQ] = useState('');
  const [searched, setSearched] = useState(false);

  const { data: results, isFetching } = useRagSearch(q, projectId ?? undefined, searched);
  const index = useRagIndex();

  const handleSearch = () => {
    if (!q.trim()) { toast('error', 'Vui lòng nhập truy vấn'); return; }
    setSearched(true);
  };

  const handleIndex = async () => {
    if (!projectId) return;
    try {
      const res = await index.mutateAsync(projectId);
      toast('success', `Đã index ${res.indexed} chunk`);
    } catch {
      toast('error', 'Không thể index — LLM có thể chưa cấu hình hoặc chưa có task.');
    }
  };

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <div>
        <h1 className="type-headline-m3 font-medium text-ink">Tích hợp</h1>
        <p className="text-sm text-ink-secondary">RAG tìm kiếm lịch sử task + n8n workflow + MCP tools</p>
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <TypeCard icon={<Search className="h-5 w-5" />} title="RAG Search" desc="Tìm kiếm ngữ nghĩa + từ khoá qua lịch sử task dự án." />
        <TypeCard icon={<Zap className="h-5 w-5" />} title="n8n Workflows" desc="10-node order automation — webhook đã cấu hình." />
        <TypeCard icon={<Cable className="h-5 w-5" />} title="MCP Tools" desc="5 tools (list_projects, search_tasks, rag_search…." />
      </section>

      <Card className="p-4">
        <h2 className="mb-2 text-sm font-semibold text-ink">Tìm kiếm RAG</h2>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            placeholder="Tìm kiếm lịch sử task..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <Button variant="primary" onClick={handleSearch} disabled={isFetching}>
            <Search className="h-4 w-4" />
            {isFetching ? 'Đang tìm...' : 'Tìm'}
          </Button>
          <Button variant="secondary" onClick={handleIndex} disabled={index.isPending || !projectId}>
            <Database className="h-4 w-4" />
            Index dự án
          </Button>
        </div>
        <p className="mt-3 text-xs text-ink-muted">
          Dự án: {defaultProject?.name ?? 'Chưa chọn'} — Index là hàm embedding dùng LLM đã cấu hình.
        </p>
      </Card>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-ink-muted">
          Kết quả
        </h2>
        {!searched ? (
          <EmptyState
            icon={<Search className="h-6 w-6" />}
            title="Nhập truy vấn"
            description="Tìm kiếm task, ghi chú và lịch sử dự án theo ngữ nghĩa."
          />
        ) : isFetching ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
        ) : !results || results.length === 0 ? (
          <Card className="p-4 text-center text-sm text-ink-muted">Không có kết quả nào.</Card>
        ) : (
          <div className="space-y-2">
            {results.map((r) => (
              <Card key={r.id} className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge tone="accent">{r.sourceType}</Badge>
                    <h3 className="truncate text-sm font-medium text-ink">{r.title ?? r.id}</h3>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-ink-secondary">{r.content}</p>
                </div>
                <Badge tone="success">{Math.round(r.score * 1000) / 10}%</Badge>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function TypeCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <Card variant="elevated" className="flex items-start gap-3 p-4">
      <span className="mt-0.5 rounded-xl bg-primaryContainer p-2.5 text-onPrimaryContainer">{icon}</span>
      <div>
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <p className="mt-1 text-xs text-ink-secondary">{desc}</p>
      </div>
    </Card>
  );
}