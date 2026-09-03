import { useState } from 'react';
import { Plus, Package, Trash2, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useProjects } from '@/hooks/useProjects';
import {
  useOrders,
  useCreateOrder,
  useDeleteOrder,
  useSuppliers,
} from '@/hooks/useSupplyChain';
import { ORDER_STATUS_LABELS, ORDER_STATUS_TONES } from '@/types/supplychain';
import type { Order, Supplier } from '@/types';
import { useToast } from '@/store/toast';
import { Button, Card, Badge, Input, Modal, Select } from '@/components/ui';
import OrderDetailModal from '@/components/supply-chain/OrderDetailModal';

const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả' },
  { value: 'PENDING_APPROVAL', label: 'Chờ duyệt' },
  { value: 'APPROVED', label: 'Đã duyệt' },
  { value: 'IN_FULFILLMENT', label: 'Đang xử lý' },
  { value: 'SHIPPED', label: 'Đã giao' },
  { value: 'DELIVERED', label: 'Đã nhận' },
  { value: 'CANCELLED', label: 'Đã hủy' },
  { value: 'CLOSED', label: 'Đã đóng' },
];

export default function OrdersPage() {
  const { data: projects } = useProjects();
  const { toast } = useToast();
  const navigate = useNavigate();

  const defaultProject = projects?.[0];
  const [projectId] = useState<string | null>(defaultProject?.id ?? null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const { data: orders } = useOrders(projectId ?? undefined);
  const { data: suppliers } = useSuppliers();
  const deleteOrder = useDeleteOrder();

  const filtered = (orders ?? []).filter((o) => {
    const matchesSearch = o.orderNumber?.toLowerCase().includes(search.toLowerCase()) ?? false;
    const matchesStatus = !statusFilter || o.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleDelete = async (order: Order) => {
    if (!confirm(`Xóa đơn hàng ${order.orderNumber ?? order.id}?`)) return;
    try {
      await deleteOrder.mutateAsync({ id: order.id, projectId: order.projectId });
      toast('success', 'Đã xóa đơn hàng');
    } catch {
      toast('error', 'Xóa thất bại');
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

  return (
    <OrdersListView
      orders={filtered}
      suppliers={suppliers ?? []}
      projectId={projectId}
      onSearchChange={setSearch}
      onStatusFilterChange={setStatusFilter}
      statusFilter={statusFilter}
      onEye={setSelectedOrder}
      onDelete={handleDelete}
      isDeleting={deleteOrder.isPending}
      showNewModal={showNewModal}
      setShowNewModal={setShowNewModal}
      selectedOrder={selectedOrder}
      setSelectedOrder={setSelectedOrder}
    />
  );
}

interface OrdersListViewProps {
  orders: Order[];
  suppliers: Supplier[];
  projectId: string;
  onSearchChange: (v: string) => void;
  onStatusFilterChange: (v: string) => void;
  statusFilter: string;
  onEye: (o: Order) => void;
  onDelete: (o: Order) => void;
  isDeleting: boolean;
  showNewModal: boolean;
  setShowNewModal: (v: boolean) => void;
  selectedOrder: Order | null;
  setSelectedOrder: (o: Order | null) => void;
}

function OrdersListView(props: OrdersListViewProps) {
  const { orders, suppliers, projectId, statusFilter, onEye, onDelete, isDeleting, showNewModal, setShowNewModal, selectedOrder, setSelectedOrder } = props;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="type-headline-m3 font-medium text-ink">Đơn hàng</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowNewModal(true)}>
            <Plus className="h-4 w-4" />
            Đơn hàng mới
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Input placeholder="Tìm kiếm số PO..." onChange={(e) => props.onSearchChange(e.target.value)} />
        </div>
        <div className="w-full sm:w-64">
          <Select
            value={statusFilter}
            onChange={(e) => props.onStatusFilterChange(e.target.value)}
            options={STATUS_OPTIONS}
            placeholder="Lọc trạng thái"
          />
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-surfaceContainerHigh">
                <th className="pb-2.5 pl-4 pr-2 font-medium text-ink-muted">Mã PO</th>
                <th className="pb-2.5 px-2 font-medium text-ink-muted">Nhà cung cấp</th>
                <th className="pb-2.5 px-2 font-medium text-ink-muted">Số tiền</th>
                <th className="pb-2.5 px-2 font-medium text-ink-muted">Trạng thái</th>
                <th className="pb-2.5 px-2 font-medium text-ink-muted">Ngày tạo</th>
                <th className="pb-2.5 pl-2 pr-4 text-center font-medium text-ink-muted">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-ink-muted">
                    Không có đơn hàng nào.
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id} className="border-b border-line/30 last:border-0">
                    <td className="py-2.5 pl-4 pr-2 font-medium">
                      {order.orderNumber ?? order.id.slice(0, 8)}
                    </td>
                    <td className="py-2.5 px-2">{order.supplier?.name ?? '—'}</td>
                    <td className="py-2.5 px-2">
                      {order.totalAmount
                        ? `${order.totalAmount.toLocaleString('vi-VN')} ${order.currency}`
                        : '—'}
                    </td>
                    <td className="py-2.5 px-2">
                      <Badge tone={ORDER_STATUS_TONES[order.status]}>
                        {ORDER_STATUS_LABELS[order.status]}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-2 text-ink-muted">
                      {order.createdAt
                        ? new Date(order.createdAt).toLocaleDateString('vi-VN')
                        : '—'}
                    </td>
                    <td className="py-2.5 pl-2 pr-4">
                      <div className="flex justify-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => onEye(order)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => onDelete(order)} disabled={isDeleting}>
                          <Trash2 className="h-4 w-4 text-danger" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {showNewModal && (
        <CreateOrderModal
          projectId={projectId}
          suppliers={suppliers}
          onClose={() => setShowNewModal(false)}
          onCreate={() => setShowNewModal(false)}
        />
      )}

      {selectedOrder && (
        <OrderDetailModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />
      )}
    </div>
  );
}

function CreateOrderModal({
  projectId,
  suppliers,
  onClose,
  onCreate,
}: {
  projectId: string;
  suppliers: Supplier[];
  onClose: () => void;
  onCreate: () => void;
}) {
  const [orderNumber, setOrderNumber] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [currency] = useState('VND');
  const [notes, setNotes] = useState('');
  const createOrder = useCreateOrder();
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!orderNumber || !supplierId) {
      alert('Vui lòng nhập số PO và chọn nhà cung cấp');
      return;
    }
    try {
      await createOrder.mutateAsync({
        projectId,
        supplierId,
        orderNumber,
        totalAmount: totalAmount ? parseFloat(totalAmount) : undefined,
        currency,
        notes: notes || undefined,
      });
      toast('success', 'Đã tạo đơn hàng');
      onCreate();
    } catch {
      toast('error', 'Tạo đơn hàng thất bại');
    }
  };

  const supplierOptions = suppliers.map((s) => ({ value: s.id, label: s.name }));

  return (
    <Modal
      title="Tạo đơn hàng mới"
      open={true}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={createOrder.isPending}>
            {createOrder.isPending ? 'Đang tạo...' : 'Tạo'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Số PO" placeholder="PO-001" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
        <Select label="Nhà cung cấp" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} options={supplierOptions} placeholder="Chọn nhà cung cấp" />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Số tiền" type="number" placeholder="0" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} />
          <Input label="Đơn vị tiền" value={currency} readOnly />
        </div>
        <Input label="Ghi chú" placeholder="Nhập ghi chú..." value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Modal>
  );
}