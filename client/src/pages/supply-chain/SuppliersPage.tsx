import { useState } from 'react';
import { Plus, Building2, Trash2, Edit } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useProjects } from '@/hooks/useProjects';
import { useSuppliers, useDeleteSupplier, useCreateSupplier, useUpdateSupplier } from '@/hooks/useSupplyChain';
import type { Supplier } from '@/types';
import { useToast } from '@/store/toast';
import { Button, Card, ErrorState, Skeleton, Input, Modal } from '@/components/ui';

export default function SuppliersPage() {
  const { data: projects } = useProjects();
  const { toast } = useToast();
  const navigate = useNavigate();
  const defaultProject = projects?.[0];
  const [projectId] = useState(defaultProject?.id ?? null);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  const { data: suppliers, isLoading, error, refetch } = useSuppliers();
  const deleteSupplier = useDeleteSupplier();
  const createSupplier = useCreateSupplier();
  const updateSupplier = useUpdateSupplier();

  const filtered = (suppliers ?? []).filter(
    (s) => s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.code.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async (id: string) => {
    if (!confirm('Xóa nhà cung cấp?')) return;
    try { await deleteSupplier.mutateAsync(id); toast('success', 'Đã xóa'); }
    catch { toast('error', 'Lỗi xóa'); }
  };

  const handleSubmit = async (data: {
    name: string; code: string; contactName?: string; email?: string;
    phone?: string; address?: string; notes?: string;
  }) => {
    try {
      if (editingSupplier) await updateSupplier.mutateAsync({ id: editingSupplier.id, ...data });
      else await createSupplier.mutateAsync(data);
      toast('success', editingSupplier ? 'Đã cập nhật' : 'Đã tạo');
      setShowModal(false); setEditingSupplier(null); refetch();
    } catch { toast('error', 'Lỗi khi lưu'); }
  };

  if (!projectId) {
    return (
      <div className="p-6"><Card className="p-8 text-center">
        <Building2 className="mx-auto h-12 w-12 text-ink-muted" />
        <h3 className="mt-4 text-lg font-semibold text-ink">Chưa có dự án</h3>
        <Button className="mt-4" onClick={() => navigate('/dashboard')}>Đi tới Dashboard</Button>
      </Card></div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="type-headline-m3 font-medium text-ink">Nhà cung cấp</h1>
          <p className="text-sm text-ink-secondary">Dự án: {defaultProject?.name ?? ''}</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowModal(true)}>
          <Plus className="h-4 w-4" /> Thêm
        </Button>
      </div>

      <Input placeholder="Tìm kiếm..." value={search} onChange={(e) => setSearch(e.target.value)} />

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : error ? (
        <ErrorState title="Lỗi tải dữ liệu" onRetry={() => refetch()} />
      ) : (
        <Card className="overflow-hidden"><div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-surfaceContainerHigh">
                <th className="pb-2.5 pl-4 font-medium text-ink-muted">Tên</th>
                <th className="pb-2.5 px-2 font-medium text-ink-muted">Mã</th>
                <th className="pb-2.5 px-2 font-medium text-ink-muted">Liên hệ</th>
                <th className="pb-2.5 px-2 font-medium text-ink-muted">Email</th>
                <th className="pb-2.5 px-2 font-medium text-ink-muted">ĐT</th>
                <th className="pb-2.5 pr-4 text-center font-medium text-ink-muted">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-sm text-ink-muted">Không có nhà cung cấp.</td></tr>
              ) : filtered.map((s) => (
                <tr key={s.id} className="border-b border-line/30 last:border-0">
                  <td className="py-2.5 pl-4 font-medium">{s.name}</td>
                  <td className="py-2.5 px-2 font-mono text-xs">{s.code}</td>
                  <td className="py-2.5 px-2">{s.contactName ?? '—'}</td>
                  <td className="py-2.5 px-2">{s.email ?? '—'}</td>
                  <td className="py-2.5 px-2">{s.phone ?? '—'}</td>
                  <td className="py-2.5 pr-4">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditingSupplier(s)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(s.id)}>
                        <Trash2 className="h-4 w-4 text-danger" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></Card>
      )}

      {showModal && (
        <SupplierFormModal
          supplier={editingSupplier ?? undefined}
          onClose={() => { setShowModal(false); setEditingSupplier(null); }}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
function SupplierFormModal({
  supplier, onClose, onSubmit,
}: {
  supplier?: Supplier;
  onClose: () => void;
  onSubmit: (data: {
    name: string; code: string; contactName?: string; email?: string;
    phone?: string; address?: string; notes?: string;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(supplier?.name ?? '');
  const [code, setCode] = useState(supplier?.code ?? '');
  const [contactName, setContactName] = useState(supplier?.contactName ?? '');
  const [email, setEmail] = useState(supplier?.email ?? '');
  const [phone, setPhone] = useState(supplier?.phone ?? '');
  const [address, setAddress] = useState(supplier?.address ?? '');
  const [notes, setNotes] = useState(supplier?.notes ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <Modal
      title={supplier ? 'Sửa nhà cung cấp' : 'Thêm nhà cung cấp'}
      open={true}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button
            variant="primary"
            onClick={async () => {
              if (!name || !code) { alert('Vui lòng nhập tên và mã'); return; }
              setIsSubmitting(true);
              await onSubmit({ name, code, contactName, email, phone, address, notes });
              setIsSubmitting(false);
            }}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Đang lưu...' : supplier ? 'Cập nhật' : 'Tạo'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Tên" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Mã" value={code} onChange={(e) => setCode(e.target.value)} />
        <Input label="Liên hệ" value={contactName} onChange={(e) => setContactName(e.target.value)} />
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input label="ĐT" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Input label="Địa chỉ" value={address} onChange={(e) => setAddress(e.target.value)} />
        <Input label="Ghi chú" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Modal>
  );
}