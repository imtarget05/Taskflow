import { Trash2 } from 'lucide-react';
import type { Order, OrderStatus } from '@/types';
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONES,
  ORDER_TRANSITIONS,
} from '@/types';
import { useToast } from '@/store/toast';
import { Button, Card, Badge, Input, Select, Modal } from '@/components/ui';
import {
  useOrder,
  useUpdateOrderStatus,
  useLineItems,
} from '@/hooks/useSupplyChain';
import api from '@/lib/api';

export default function OrderDetailModal({
  order,
  onClose,
}: {
  order: Order;
  onClose: () => void;
}) {
  const { data: fullOrder, refetch } = useOrder(order.id);
  const { data: lineItems, refetch: refetchLines } = useLineItems(order.id);
  const { toast } = useToast();
  const updateStatus = useUpdateOrderStatus();

  const currentOrder = fullOrder ?? order;
  const validTransitions = ORDER_TRANSITIONS[currentOrder.status] ?? [];
  const supplierOptions = [
    { value: currentOrder.supplierId, label: currentOrder.supplier?.name ?? currentOrder.supplierId },
  ];

  const handleStatusChange = async (newStatus: OrderStatus) => {
    try {
      await updateStatus.mutateAsync({ id: currentOrder.id, status: newStatus });
      toast('success', 'Cập nhật trạng thái');
      refetch();
    } catch {
      toast('error', 'Cập nhật thất bại');
    }
  };

  const handleDeleteLineItem = async (lineItemId: string) => {
    try {
      await api.delete(`/sc/line-items/${lineItemId}`);
      toast('success', 'Đã xóa dòng');
      refetchLines();
    } catch {
      toast('error', 'Xóa thất bại');
    }
  };

  return (
    <Modal
      title={`Đơn hàng ${currentOrder.orderNumber ?? currentOrder.id}`}
      open={true}
      onClose={onClose}
      size="lg"
      footer={<Button variant="secondary" onClick={onClose}>Đóng</Button>}
    >
      <div className="space-y-6">
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Thông tin đơn hàng</h3>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Số PO" value={currentOrder.orderNumber ?? ''} readOnly />
            <Select label="Nhà cung cấp" value={currentOrder.supplierId} options={supplierOptions} />
            <Input
              label="Số tiền"
              value={currentOrder.totalAmount ? `${currentOrder.totalAmount} ${currentOrder.currency}` : '—'}
              readOnly
            />
            <Input
              label="Ngày yêu cầu"
              value={currentOrder.requestDate ? new Date(currentOrder.requestDate).toLocaleDateString('vi-VN') : '—'}
              readOnly
            />
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Trạng thái</h3>
          <div className="flex items-center gap-3">
            <Badge tone={ORDER_STATUS_TONES[currentOrder.status] ?? 'neutral'}>
              {ORDER_STATUS_LABELS[currentOrder.status]}
            </Badge>
            {validTransitions.length > 0 && (
              <>
                <span className="text-ink-muted">→</span>
                <Select
                  value=""
                  onChange={(e) => e.target.value && handleStatusChange(e.target.value as OrderStatus)}
                  options={validTransitions.map((s) => ({ value: s, label: ORDER_STATUS_LABELS[s] }))}
                  placeholder="Chuyển trạng thái..."
                />
              </>
            )}
          </div>
          {validTransitions.length === 0 && (
            <p className="mt-2 text-xs text-ink-muted">Trạng thái cuối — không thể chuyển tiếp.</p>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Dòng đơn hàng</h3>
          {lineItems && lineItems.length === 0 ? (
            <p className="text-sm text-ink-muted">Chưa có dòng sản phẩm.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="pb-2 text-left font-medium text-ink-muted">SKU</th>
                    <th className="pb-2 text-left font-medium text-ink-muted">Mô tả</th>
                    <th className="pb-2 text-right font-medium text-ink-muted">Số lượng</th>
                    <th className="pb-2 text-right font-medium text-ink-muted">Đơn giá</th>
                    <th className="pb-2 text-right font-medium text-ink-muted">Thành tiền</th>
                    <th className="pb-2 text-center font-medium text-ink-muted">Xóa</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems?.map((item) => (
                    <tr key={item.id} className="border-b border-line/30">
                      <td className="py-2 font-mono text-xs">{item.sku}</td>
                      <td className="py-2">{item.description ?? '—'}</td>
                      <td className="py-2 text-right">{item.quantity}</td>
                      <td className="py-2 text-right">{item.unitPrice.toLocaleString('vi-VN')}</td>
                      <td className="py-2 text-right">{item.amount?.toLocaleString('vi-VN') ?? '—'}</td>
                      <td className="py-2 text-center">
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteLineItem(item.id)}>
                          <Trash2 className="h-3 w-3 text-danger" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {currentOrder.notes && (
          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold text-ink">Ghi chú</h3>
            <p className="text-sm text-ink-secondary">{currentOrder.notes}</p>
          </Card>
        )}
      </div>
    </Modal>
  );
}