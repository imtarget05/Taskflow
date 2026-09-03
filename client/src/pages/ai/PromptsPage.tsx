import { useState } from 'react';
import { Plus, FileCode, Play, CheckCircle2 } from 'lucide-react';
import { usePrompts, useCreatePrompt, useActivatePrompt, usePromptExperiments, useCreatePromptExperiment, useAnalyzePromptExperiment } from '@/hooks/usePromptsMlops';
import type { PromptTemplate } from '@/hooks/usePromptsMlops';
import { useToast } from '@/store/toast';
import { Button, Card, Badge, Input, Textarea, Modal, Skeleton, EmptyState } from '@/components/ui';
import AiPageNav from './AiPageNav';

export default function PromptsPage() {
  const { toast } = useToast();
  const { data: prompts, isLoading, refetch } = usePrompts();
  const { data: experiments } = usePromptExperiments();
  const createPrompt = useCreatePrompt();
  const activate = useActivatePrompt();
  const createExp = useCreatePromptExperiment();
  const analyze = useAnalyzePromptExperiment();

  const [showNew, setShowNew] = useState(false);
  const [showExp, setShowExp] = useState(false);

  // Group prompts by name; only one version is active per name.
  const grouped = new Map<string, PromptTemplate[]>();
  for (const p of prompts ?? []) {
    const list = grouped.get(p.name) ?? [];
    list.push(p);
    grouped.set(p.name, list);
  }

  const handleActivate = async (p: PromptTemplate) => {
    try {
      await activate.mutateAsync({ name: p.name, version: p.version });
      toast('success', `Đã kích hoạt ${p.name} v${p.version}`);
      refetch();
    } catch { toast('error', 'Kích hoạt thất bại'); }
  };
return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="type-headline-m3 font-medium text-ink">Prompt Templates</h1>
          <p className="text-sm text-ink-secondary">Quản lý phiên bản prompt + A/B experiments</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowExp(true)}>
            <Play className="h-4 w-4" /> Tạo A/B test
          </Button>
          <Button variant="primary" size="sm" onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4" /> Thêm prompt
          </Button>
        </div>
      </div>

      <AiPageNav />

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : !prompts || prompts.length === 0 ? (
        <EmptyState icon={<FileCode className="h-6 w-6" />} title="Chưa có prompt nào" description="Thêm prompt template đầu tiên." />
      ) : (
        <div className="space-y-4">
          {[...grouped.entries()].map(([name, versions]) => (
            <Card key={name} className="p-4">
              <h3 className="mb-2 text-sm font-semibold text-ink">{name}</h3>
              <div className="space-y-2">
                {versions.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg bg-surfaceContainerLow px-3 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-ink-muted">v{p.version}</span>
                        {p.isActive && <Badge tone="success"><CheckCircle2 className="h-3 w-3" /> Active</Badge>}
                      </div>
                      <p className="mt-1 line-clamp-1 text-xs text-ink-secondary">{p.content}</p>
                    </div>
                    {!p.isActive && (
                      <Button variant="ghost" size="sm" onClick={() => handleActivate(p)} disabled={activate.isPending}>
                        Kích hoạt
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-ink-muted">A/B Experiments</h2>
        {!experiments || experiments.length === 0 ? (
          <Card className="p-4 text-center text-sm text-ink-muted">Chưa có experiment nào.</Card>
        ) : (
          <div className="space-y-2">
            {experiments.map((e) => (
              <Card key={e.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-medium text-ink">{e.name}</h3>
                    <Badge tone={e.status === 'completed' ? 'success' : 'info'}>{e.status}</Badge>
                    {e.winner && <Badge tone="accent">Winner: {e.winner}</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">
                    {e.promptName} · A: v{e.variantA} vs B: v{e.variantB} · traffic {(e.trafficSplit * 100).toFixed(0)}%
                  </p>
                </div>
                {e.status === 'running' && (
                  <Button variant="ghost" size="sm" onClick={async () => {
                    try { await analyze.mutateAsync(e.id); toast('success', 'Đã phân tích'); }
                    catch { toast('error', 'Phân tích thất bại'); }
                  }} disabled={analyze.isPending}>
                    Phân tích
                  </Button>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>

      {showNew && (
        <NewPromptModal
          onClose={() => setShowNew(false)}
          onSubmit={async (data) => {
            try { await createPrompt.mutateAsync(data); toast('success', 'Đã tạo prompt'); setShowNew(false); refetch(); }
            catch { toast('error', 'Tạo thất bại (trùng name+version?)'); }
          }}
        />
      )}

      {showExp && (
        <NewExperimentModal
          prompts={prompts ?? []}
          onClose={() => setShowExp(false)}
          onSubmit={async (data) => {
            try { await createExp.mutateAsync(data); toast('success', 'Đã tạo experiment'); setShowExp(false); }
            catch { toast('error', 'Tạo experiment thất bại'); }
          }}
        />
      )}
    </div>
  );
function NewPromptModal({ onClose, onSubmit }: {
  onClose: () => void;
  onSubmit: (d: { name: string; version: string; content: string; variables?: string[] }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [version, setVersion] = useState('v1');
  const [content, setContent] = useState('');
  const [variables, setVariables] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      title="Thêm prompt template"
      open={true}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button variant="primary" disabled={busy} onClick={async () => {
            if (!name || !content) { alert('Vui lòng nhập name và content'); return; }
            setBusy(true);
            await onSubmit({
              name, version, content,
              variables: variables.split(',').map((v) => v.trim()).filter(Boolean),
            });
            setBusy(false);
          }}>
            {busy ? 'Đang lưu...' : 'Tạo'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Version" value={version} onChange={(e) => setVersion(e.target.value)} />
        <Textarea label="Content" rows={6} placeholder="Nội dung prompt, dùng {variable}..." value={content} onChange={(e) => setContent(e.target.value)} />
        <Input label="Variables (phân tách phẩy)" value={variables} onChange={(e) => setVariables(e.target.value)} />
      </div>
    </Modal>
  );
}

function NewExperimentModal({ prompts, onClose, onSubmit }: {
  prompts: PromptTemplate[];
  onClose: () => void;
  onSubmit: (d: { name: string; promptName: string; variantA: string; variantB: string }) => Promise<void>;
}) {
  const names = [...new Set(prompts.map((p) => p.name))];
  const [name, setName] = useState('');
  const [promptName, setPromptName] = useState(names[0] ?? '');
  const [variantA, setVariantA] = useState('');
  const [variantB, setVariantB] = useState('');
  const [busy, setBusy] = useState(false);

  const versionsOf = prompts.filter((p) => p.name === promptName).map((p) => p.version);

  return (
    <Modal
      title="Tạo A/B experiment"
      open={true}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button variant="primary" disabled={busy} onClick={async () => {
            if (!name || !promptName || !variantA || !variantB) { alert('Vui lòng điền đủ thông tin'); return; }
            setBusy(true);
            await onSubmit({ name, promptName, variantA, variantB });
            setBusy(false);
          }}>
            {busy ? 'Đang tạo...' : 'Tạo'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Tên experiment" value={name} onChange={(e) => setName(e.target.value)} />
        <SelectBox label="Prompt" value={promptName} onChange={setPromptName} options={names.map((n) => ({ value: n, label: n }))} />
        <div className="grid grid-cols-2 gap-4">
          <SelectBox label="Variant A (version)" value={variantA} onChange={setVariantA} options={versionsOf.map((v) => ({ value: v, label: v }))} />
          <SelectBox label="Variant B (version)" value={variantB} onChange={setVariantB} options={versionsOf.map((v) => ({ value: v, label: v }))} />
        </div>
      </div>
    </Modal>
  );
}

function SelectBox({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-ink">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
      >
        <option value="">Chọn...</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
}