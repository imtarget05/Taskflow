import { useState } from 'react';
import { Plus, Package, RotateCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useProjects } from '@/hooks/useProjects';
import { useInventory, useAdjustInventory, useCreateInventoryItem } from '@/hooks/useSupplyChain';
import type { InventoryItem } from '@/types';
import { useToast } from '@/store/toast';
import { Button, Card, ErrorState, Skeleton, Badge, Input, Modal } from '@/components/ui';

export default function InventoryPage() {
  const { data: projects } = useProjects();
  const { toast } = useToast();
  const navigate = useNavigate();
  const defaultProject = projects?.[0];
  const [projectId] = useState(defaultProject?.id ?? null);
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [adjusting, setAdjusting] = useState<InventoryItem | null>(null);

  const { data: items, isLoading, error, refetch } = useInventory(projectId ?? undefined);
  const adjust = useAdjustInventory();
  const createItem = useCreateInventoryItem();

  const filtered = (items ?? []).filter(
    (i) => i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.sku.toLowerCase().includes(search.toLowerCase())
  );

  const stockTone = (q: number, min: number): 'danger' | 'warning' | 'success' => {
    if (q === 0) return 'danger';
    if (q < min) return 'warning';
    return 'success';
  };
  const stockLabel = (q: number, min: number) => {
    if (q === 0) return 'Hết hàng';
    if (q < min) return 'Sắp hết';
    return 'Còn hàng';
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="type-headline-m3 font-medium text-ink">Tồn kho</h1>
          <p className="text-sm text-ink-secondary">Dự án: {defaultProject?.name ?? ''}</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowNew(true)}>
          <Plus className="h-4 w-4" /> Thêm item
        </Button>
      </div>

      <Input placeholder="Tìm kiếm theo tên / SKU..." value={search} onChange={(e) => setSearch(e.target.value)} />

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : error ? (
        <ErrorState title="Lỗi tải dữ liệu" onRetry={() => refetch()} />
      ) : (
        <Card className="overflow-hidden"><div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-surfaceContainerHigh">
                <th className="pb-2.5 pl-4 font-medium text-ink-muted">SKU</th>
                <th className="pb-2.5 px-2 font-medium text-ink-muted">Tên</th>
                <th className="pb-2.5 px-2 font-medium text-ink-muted">Vị trí</th>
                <th className="pb-2.5 px-2 text-right font-medium text-ink-muted">Số lượng</th>
                <th className="pb-2.5 px-2 text-right font-medium text-ink-muted">Ngưỡng</th>
                <th className="pb-2.5 px-2 font-medium text-ink-muted">Trạng thái</th>
                <th className="pb-2.5 pr-4 text-center font-medium text-ink-muted">Điều chỉnh</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-sm text-ink-muted">Không có sản phẩm.</td></tr>
              ) : filtered.map((i) => (
                <tr key={i.id} className="border-b border-line/30 last:border-0">
                  <td className="py-2.5 pl-4 font-mono text-xs">{i.sku}</td>
                  <td className="py-2.5 px-2 font-medium">{i.name}</td>
                  <td className="py-2.5 px-2 text-ink-secondary">{i.location ?? '—'}</td>
                  <td className="py-2.5 px-2 text-right font-medium">{i.quantity}</td>
                  <td className="py-2.5 px-2 text-right">{i.minStock}</td>
                  <td className="py-2.5 px-2">
                    <Badge tone={stockTone(i.quantity, i.minStock)}>{stockLabel(i.quantity, i.minStock)}</Badge>
                  </td>
                  <td className="py-2.5 pr-4">
                    <div className="flex justify-end">
                      <Button variant="ghost" size="sm" onClick={() => setAdjusting(i)}>
                        <RotateCw className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></Card>
      )}

      {showNew && projectId && (
        <NewItemModal
          projectId={projectId}
          onClose={() => setShowNew(false)}
          onCreate={async (data) => {
            try {
              await createItem.mutateAsync(data);
              toast('success', 'Đã tạo item');
              setShowNew(false);
              refetch();
            } catch { toast('error', 'Tạo thất bại'); }
          }}
        />
      )}

      {adjusting && (
        <AdjustModal
          item={adjusting}
          onClose={() => setAdjusting(null)}
          onAdjust={async (quantity, reason) => {
            try {
              await adjust.mutateAsync({ id: adjusting.id, quantity, reason });
              toast('success', 'Đã điều chỉnh tồn kho');
              setAdjusting(null);
              refetch();
            } catch { toast('error', 'Điều chỉnh thất bại'); }
          }}
        />
      )}
    </div>
  );
}
function NewItemModal({ projectId, onClose, onCreate }: {
  projectId: string; onClose: () => void;
  onCreate: (data: {
    projectId: string; sku: string; name: string; quantity: number;
    unit?: string; location?: string; minStock?: number;
  }) => Promise<void>;
}) {
  const [sku, setSku] = useState(''); const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('0'); const [location, setLocation] = useState('');
  const [minStock, setMinStock] = useState('0'); const [submitting, setSubmitting] = useState(false);

  return (
    <Modal
      title="Thêm sản phẩm tồn kho"
      open={true}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button variant="primary" disabled={submitting} onClick={async () => {
            if (!sku || !name) { alert('Vui lòng nhập SKU và tên'); return; }
            setSubmitting(true);
            await onCreate({ projectId, sku, name, quantity: parseFloat(quantity) || 0, unit: 'Cái', location: location || undefined, minStock: parseFloat(minStock) || 0 });
            setSubmitting(false);
          }}>
            {submitting ? 'Đang lưu...' : 'Tạo'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="SKU" value={sku} onChange={(e) => setSku(e.target.value)} />
        <Input label="Tên" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Số lượng" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          <Input label="Ngưỡng" type="number" value={minStock} onChange={(e) => setMinStock(e.target.value)} />
        </div>
        <Input label="Vị trí" value={location} onChange={(e) => setLocation(e.target.value)} />
      </div>
    </Modal>
  );
}

function AdjustModal({ item, onClose, onAdjust }: {
  item: InventoryItem; onClose: () => void;
  onAdjust: (q: number, reason?: string) => Promise<void>;
}) {
  const [delta, setDelta] = useState('0');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const qty = parseFloat(delta) || 0;
  const newQty = item.quantity + qty;

  return (
    <Modal
      title={`Điều chỉnh: ${item.name}`}
      open={true}
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button variant="primary" disabled={submitting || newQty < 0} onClick={async () => {
            if (qty === 0) return;
            setSubmitting(true);
            await onAdjust(qty, reason || undefined);
            setSubmitting(false);
          }}>
            {submitting ? 'Đang xử lý...' : 'Xác nhận'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-ink-secondary">
          Số lượng hiện tại: <strong className="text-ink">{item.quantity}</strong>
        </p>
        <Input
          label="Điều chỉnh (+ thêm / − bớt)"
          type="number"
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
          hint={newQty >= 0 ? `Số lượng mới: ${newQty}` : 'Không đủ số lượng tồn kho.'}
        />
        <Input label="Lý do" placeholder="VD: nhập lại, kiểm kê..." value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
    </Modal>
  );
}