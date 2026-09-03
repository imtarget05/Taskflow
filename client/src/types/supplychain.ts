/**
 * Supply Chain types — mirrors the backend Prisma models and API schemas.
 * Used by the SC Dashboard, Order, Supplier, Inventory, and NLP features.
 */

export type OrderStatus =
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'IN_FULFILLMENT'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'CLOSED';

export interface Supplier {
  id: string;
  name: string;
  code: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Order {
  id: string;
  projectId: string;
  supplierId: string;
  orderNumber: string;
  status: OrderStatus;
  requestDate: string | null;
  deliveryDate: string | null;
  totalAmount: number | null;
  currency: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  supplier?: Supplier;
  lineItems?: LineItem[];
}

export interface LineItem {
  id: string;
  orderId: string;
  sku: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
  amount: number | null;
  createdAt: string;
}

export interface InventoryItem {
  id: string;
  projectId: string;
  sku: string;
  name: string;
  quantity: number;
  unit: string;
  location?: string | null;
  minStock: number;
  createdAt: string;
  updatedAt: string;
}

export interface ScOrderAnalysis {
  id: string;
  userId: string;
  projectId?: string | null;
  orderId?: string | null;
  sourceText: string;
  classification: 'PO_NEW' | 'PO_UPDATE' | 'INVOICE' | 'ASN' | 'UNKNOWN';
  confidence: number;
  suggestedAction: string;
  workflowTrigger: string;
  llmUsed: boolean;
  createdAt: string;
}

export interface AgenticDecision {
  id: string;
  orderId: string;
  projectId: string;
  userId: string;
  classification: string;
  confidence: number;
  decision: string;
  action: string;
  taskId?: string | null;
  humanTaskId?: string | null;
  createdAt: string;
  order?: { id: string; orderNumber: string | null; status: OrderStatus };
  user?: { id: string; name: string };
}

export interface SCDashboardMetrics {
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
}

// Helper: human-readable labels for order status (Vietnamese)
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_APPROVAL: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  IN_FULFILLMENT: 'Đang xử lý',
  SHIPPED: 'Đã giao',
  DELIVERED: 'Đã nhận',
  CANCELLED: 'Đã hủy',
  CLOSED: 'Đã đóng',
};

// Helper: badge tone per status
export const ORDER_STATUS_TONES: Record<OrderStatus, 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent'> = {
  PENDING_APPROVAL: 'warning',
  APPROVED: 'info',
  IN_FULFILLMENT: 'info',
  SHIPPED: 'success',
  DELIVERED: 'success',
  CANCELLED: 'danger',
  CLOSED: 'neutral',
};

// Valid next statuses per current status (mirrors backend state machine)
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_APPROVAL: ['APPROVED', 'CANCELLED'],
  APPROVED: ['IN_FULFILLMENT', 'CANCELLED'],
  IN_FULFILLMENT: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'CANCELLED'],
  DELIVERED: ['CLOSED', 'CANCELLED'],
  CANCELLED: [],
  CLOSED: [],
};