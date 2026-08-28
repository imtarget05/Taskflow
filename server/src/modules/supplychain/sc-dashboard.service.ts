import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/errors';

export type SCDashboardMetrics = {
  totalPO: number;
  pendingApproval: number;
  approved: number;
  inFulfillment: number;
  shipped: number;
  cancelled: number;
  closed: number;
  fulfillmentRate: number;
  inventory: {
    totalItems: number;
    totalQuantity: number;
    lowStockItems: number;
    lowStockQuantity: number;
    bySku: { sku: string; name: string; quantity: number; minStock: number }[];
  };
  recentOrders: {
    id: string;
    orderNumber: string | null;
    status: string;
    supplier: { name: string } | null;
    createdAt: string;
  }[];
};

export async function getSCDashboard(projectId: string, userId: string): Promise<SCDashboardMetrics> {
  // Kiểm tra membership
  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!membership) throw new AppError('Not a member of this project', 403);

  // Order metrics
  const orderMetrics = await prisma.order.groupBy({
    by: ['status'],
    where: { projectId },
    _count: { id: true },
  });

  const totalPO = orderMetrics.reduce((sum, m) => sum + m._count.id, 0);
  const pendingApproval = orderMetrics.find(m => m.status === 'PENDING_APPROVAL')?._count.id ?? 0;
  const approved = orderMetrics.find(m => m.status === 'APPROVED')?._count.id ?? 0;
  const inFulfillment = orderMetrics.find(m => m.status === 'IN_FULFILLMENT')?._count.id ?? 0;
  const shipped = orderMetrics.find(m => m.status === 'SHIPPED')?._count.id ?? 0;
  const cancelled = orderMetrics.find(m => m.status === 'CANCELLED')?._count.id ?? 0;
  const closed = orderMetrics.find(m => m.status === 'CLOSED')?._count.id ?? 0;

  const fulfilledOrShipped = shipped + inFulfillment;
  const fulfillmentRate = totalPO > 0
    ? Math.round((fulfilledOrShipped / totalPO) * 100)
    : 0;

  // Inventory metrics
  const inventoryItems = await prisma.inventoryItem.findMany({
    where: { projectId },
    orderBy: { quantity: 'asc' },
  });

  const totalItems = inventoryItems.length;
  const totalQuantity = inventoryItems.reduce((sum, item) => sum + item.quantity, 0);
  const lowStockItems = inventoryItems.filter(item => item.quantity < (item.minStock ?? 0)).length;
  const lowStockQuantity = inventoryItems
    .filter(item => item.quantity < (item.minStock ?? 0))
    .reduce((sum, item) => sum + item.quantity, 0);

  const bySku = inventoryItems.map(item => ({
    sku: item.sku,
    name: item.name,
    quantity: item.quantity,
    minStock: item.minStock ?? 0,
  }));

  // Recent orders (5 most recent)
  const recentOrders = await prisma.order.findMany({
    where: { projectId },
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: {
      supplier: { select: { name: true } },
    },
  });

  return {
    totalPO,
    pendingApproval,
    approved,
    inFulfillment,
    shipped,
    cancelled,
    closed,
    fulfillmentRate,
    inventory: {
      totalItems,
      totalQuantity,
      lowStockItems,
      lowStockQuantity,
      bySku,
    },
    recentOrders: recentOrders.map(o => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      supplier: o.supplier ? { name: o.supplier.name } : null,
      createdAt: o.createdAt.toISOString(),
    })),
  };
}

export function scDashboardToCsv(metrics: SCDashboardMetrics): { filename: string; csv: string } {
  const rows = [
    ['Metric', 'Value'],
    ['Tổng PO', String(metrics.totalPO)],
    ['Đang chờ duyệt', String(metrics.pendingApproval)],
    ['Đã phê duyệt', String(metrics.approved)],
    ['Đang fulfillment', String(metrics.inFulfillment)],
    ['Đã giao', String(metrics.shipped)],
    ['Đã hủy', String(metrics.cancelled)],
    ['Đã đóng', String(metrics.closed)],
    ['Tỷ lệ fulfillment (%)', String(metrics.fulfillmentRate)],
    ['Tổng inventory items', String(metrics.inventory.totalItems)],
    ['Tổng quantity', String(metrics.inventory.totalQuantity)],
    ['Low stock items', String(metrics.inventory.lowStockItems)],
    ['Low stock quantity', String(metrics.inventory.lowStockQuantity)],
    ['Generated', new Date().toLocaleString('vi-VN')],
  ];

  // Add inventory detail rows
  rows.push([]);
  rows.push(['Chi tiết inventory']);
  rows.push(['SKU', 'Tên', 'Số lượng', 'Ngưỡng thấp']);
  for (const item of metrics.inventory.bySku) {
    rows.push([item.sku, item.name, String(item.quantity), String(item.minStock)]);
  }

  const csv = rows.map(row => row.map(cell => {
    const text = cell == null ? '' : String(cell);
    if (/[",\n\r]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }).join(',')).join('\r\n');

  const filename = `sc_dashboard_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
  return { filename, csv };
}

export function scDashboardToTxt(metrics: SCDashboardMetrics): { filename: string; text: string } {
  const lines = [
    'BÁO CÁO DASHBOARD SUPPLY CHAIN',
    `Xuất lúc: ${new Date().toLocaleString('vi-VN')}`,
    '',
    '== TỔNG QUAN PO ==',
    `Tổng số PO              : ${metrics.totalPO}`,
    `Đang chờ phê duyệt      : ${metrics.pendingApproval}`,
    `Đã phê duyệt            : ${metrics.approved}`,
    `Đang fulfillment        : ${metrics.inFulfillment}`,
    `Đã giao                 : ${metrics.shipped}`,
    `Đã hủy                  : ${metrics.cancelled}`,
    `Đã đóng                 : ${metrics.closed}`,
    `Tỷ lệ fulfillment       : ${metrics.fulfillmentRate}%`,
    '',
    '== TỔNG QUAN INVENTORY ==',
    `Tổng số items           : ${metrics.inventory.totalItems}`,
    `Tổng quantity           : ${metrics.inventory.totalQuantity}`,
    `Low stock items         : ${metrics.inventory.lowStockItems}`,
    `Low stock quantity      : ${metrics.inventory.lowStockQuantity}`,
    '',
    '== CHI TIẾT INVENTORY (low stock đầu tiên) ==',
  ];

  const lowStockSorted = [...metrics.inventory.bySku]
    .sort((a, b) => (a.quantity - a.minStock) - (b.quantity - b.minStock));

  for (const item of lowStockSorted.slice(0, 10)) {
    const status = item.quantity < item.minStock ? '⚠️ LOW STOCK' : 'OK';
    lines.push(`- ${item.sku} (${item.name}): ${item.quantity} / ${item.minStock} ${status}`);
  }

  if (metrics.inventory.bySku.length > 10) {
    lines.push(`... và ${metrics.inventory.bySku.length - 10} item khác`);
  }

  lines.push('', '== PO GỐC (5 mới nhất) ==');
  if (metrics.recentOrders.length === 0) {
    lines.push('(chưa có PO nào)');
  } else {
    for (const order of metrics.recentOrders) {
      const supplier = order.supplier?.name ?? '—';
      lines.push(`- ${order.orderNumber ?? order.id} | ${order.status} | ${supplier} | ${new Date(order.createdAt).toLocaleDateString('vi-VN')}`);
    }
  }

  return {
    filename: `sc_dashboard_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`,
    text: lines.join('\r\n') + '\r\n',
  };
}
