import { Prisma, OrderStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/errors';
import { StatusCodes } from 'http-status-codes';
import { dispatchToN8n } from '../integrations/n8n';

// ---------------------------------------------------------------------------
// Supplier CRUD
// ---------------------------------------------------------------------------

export interface SupplierWhere {
  id?: string;
  code?: string;
  name?: string;
}

export async function getSuppliers(where?: SupplierWhere) {
  return prisma.supplier.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });
}

export async function getSupplierById(id: string) {
  const supplier = await prisma.supplier.findUnique({ where: { id } });
  if (!supplier) throw new AppError('Supplier not found', StatusCodes.NOT_FOUND);
  return supplier;
}

export async function createSupplier(data: Prisma.SupplierCreateInput) {
  try {
    return await prisma.supplier.create({ data });
  } catch (err) {
    // Unique constraint (e.g. duplicate supplier code) → 409 instead of 500.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined)?.join(', ') ?? 'field';
      throw new AppError(`Supplier đã tồn tại (trùng ${target})`, StatusCodes.CONFLICT);
    }
    throw err;
  }
}

export async function updateSupplier(id: string, data: Prisma.SupplierUpdateInput) {
  const supplier = await prisma.supplier.findUnique({ where: { id } });
  if (!supplier) throw new AppError('Supplier not found', StatusCodes.NOT_FOUND);
  return prisma.supplier.update({ where: { id }, data });
}

export async function deleteSupplier(id: string): Promise<void> {
  const supplier = await prisma.supplier.findUnique({ where: { id } });
  if (!supplier) throw new AppError('Supplier not found', StatusCodes.NOT_FOUND);
  await prisma.supplier.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Order CRUD
// ---------------------------------------------------------------------------

export interface OrderWhere {
  id?: string;
  orderNumber?: string;
  projectId?: string;
  supplierId?: string;
  status?: string;
}

export async function getOrders(where?: OrderWhere) {
  return prisma.order.findMany({
    where: {
      ...(where?.id && { id: where.id }),
      ...(where?.orderNumber && { orderNumber: where.orderNumber }),
      ...(where?.projectId && { projectId: where.projectId }),
      ...(where?.supplierId && { supplierId: where.supplierId }),
      ...(where?.status && { status: where.status as Prisma.EnumOrderStatusFilter['equals'] }),
    },
    include: {
      supplier: true,
      lineItems: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getOrderById(id: string) {
  const order = await prisma.order.findUnique({
    where: { id },
    include: { supplier: true, lineItems: true },
  });
  if (!order) throw new AppError('Order not found', StatusCodes.NOT_FOUND);
  return order;
}

export async function createOrder(data: Prisma.OrderCreateInput) {
  // Resolve the referenced project/supplier ids (nested connect shape) so we can
  // return a clean 400 instead of letting Prisma throw P2025 → 500.
  const projectId =
    typeof data.project === 'object' && data.project && 'connect' in data.project
      ? (data.project.connect as { id?: string })?.id
      : undefined;
  const supplierId =
    typeof data.supplier === 'object' && data.supplier && 'connect' in data.supplier
      ? (data.supplier.connect as { id?: string })?.id
      : undefined;

  if (projectId) {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new AppError(`Project ${projectId} not found`, StatusCodes.BAD_REQUEST);
  }
  if (supplierId) {
    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) throw new AppError(`Supplier ${supplierId} not found`, StatusCodes.BAD_REQUEST);
  }

  try {
    return await prisma.order.create({ data });
  } catch (err) {
    // Foreign-key / required-record errors → 400 instead of 500.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      throw new AppError('Referenced project or supplier not found', StatusCodes.BAD_REQUEST);
    }
    throw err;
  }
}

export async function updateOrderStatus(id: string, status: Prisma.EnumOrderStatusFilter['equals']) {
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) throw new AppError('Order not found', StatusCodes.NOT_FOUND);
  return prisma.order.update({
    where: { id },
    data: { status },
    include: { supplier: true, lineItems: true },
  });
}

export async function deleteOrder(id: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) throw new AppError('Order not found', StatusCodes.NOT_FOUND);
  await prisma.order.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Order status state machine
// ---------------------------------------------------------------------------

/**
 * Allowed forward (and limited backward) transitions for OrderStatus.
 * Guards against illegal jumps (e.g. PENDING_APPROVAL -> CLOSED) so the
 * supply-chain workflow stays consistent.
 */
const ORDER_TRANSITIONS: Record<string, string[]> = {
  PENDING_APPROVAL: ['APPROVED', 'CANCELLED'],
  APPROVED: ['IN_FULFILLMENT', 'CANCELLED'],
  IN_FULFILLMENT: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'CANCELLED'],
  DELIVERED: ['CLOSED'],
  CANCELLED: [],
  CLOSED: [],
};

export function canTransitionOrderStatus(from: string, to: string): boolean {
  if (from === to) return true; // idempotent
  return (ORDER_TRANSITIONS[from] ?? []).includes(to);
}

export async function transitionOrderStatus(
  id: string,
  to: OrderStatus
) {
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) throw new AppError('Order not found', StatusCodes.NOT_FOUND);
  if (!canTransitionOrderStatus(order.status, to)) {
    throw new AppError(
      `Không thể chuyển trạng thái đơn hàng từ ${order.status} sang ${to}`,
      StatusCodes.BAD_REQUEST
    );
  }
  const updated = await prisma.order.update({
    where: { id },
    data: { status: to },
    include: { supplier: true, lineItems: true },
  });

  // Best-effort integration hook (n8n) — does not block or fail the transition.
  void notifyOrderTransition(id, order.status, to);

  return updated;
}

// Dispatch a best-effort n8n webhook on a successful status transition.
async function notifyOrderTransition(
  orderId: string,
  from: string,
  to: OrderStatus
): Promise<void> {
  const ok = await dispatchToN8n({
    path: process.env.N8N_WEBHOOK_PATH ?? '/webhook/taskflow-order',
    event: 'order.transition',
    eventId: `${orderId}:${from}->${to}`,
    payload: { orderId, from, to },
  });
  if (!ok) {
    // best effort — already logged inside dispatchToN8n
  }
}

// ---------------------------------------------------------------------------
// Line Item CRUD
// ---------------------------------------------------------------------------

export async function getLineItemsByOrder(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError('Order not found', StatusCodes.NOT_FOUND);
  return prisma.lineItem.findMany({
    where: { orderId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createLineItem(data: Prisma.LineItemCreateInput) {
  const orderId = typeof data.order === 'object' && data.order !== null
    ? data.order.connect!.id
    : data.order as string;
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError('Order not found', StatusCodes.NOT_FOUND);
  const lineItem = await prisma.lineItem.create({ data });
  // Auto-calculate amount if not provided
  if (!data.amount) {
    await prisma.lineItem.update({
      where: { id: lineItem.id },
      data: { amount: data.quantity * data.unitPrice },
    });
  }
  return lineItem;
}

export async function updateLineItem(id: string, data: Prisma.LineItemUpdateInput) {
  const lineItem = await prisma.lineItem.findUnique({ where: { id } });
  if (!lineItem) throw new AppError('Line item not found', StatusCodes.NOT_FOUND);
  return prisma.lineItem.update({ where: { id }, data });
}

export async function deleteLineItem(id: string): Promise<void> {
  const lineItem = await prisma.lineItem.findUnique({ where: { id } });
  if (!lineItem) throw new AppError('Line item not found', StatusCodes.NOT_FOUND);
  await prisma.lineItem.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Inventory CRUD
// ---------------------------------------------------------------------------

export async function getInventoryItems(projectId?: string) {
  return prisma.inventoryItem.findMany({
    where: projectId ? { projectId } : {},
    orderBy: { name: 'asc' },
  });
}

export async function getInventoryItemById(id: string) {
  const item = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!item) throw new AppError('Inventory item not found', StatusCodes.NOT_FOUND);
  return item;
}

export async function createInventoryItem(data: Prisma.InventoryItemCreateInput) {
  try {
    return await prisma.inventoryItem.create({ data });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined)?.join(', ') ?? 'field';
      throw new AppError(`Inventory item đã tồn tại (trùng ${target})`, StatusCodes.CONFLICT);
    }
    throw err;
  }
}


export async function updateInventoryItem(id: string, data: Prisma.InventoryItemUpdateInput) {
  const item = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!item) throw new AppError('Inventory item not found', StatusCodes.NOT_FOUND);
  return prisma.inventoryItem.update({ where: { id }, data });
}

// Best-effort n8n hook for inventory adjustments.
async function notifyInventoryAdjust(
  itemId: string,
  sku: string,
  delta: number,
  to: number,
  reason?: string
): Promise<void> {
  await dispatchToN8n({
    path: process.env.N8N_WEBHOOK_PATH ?? '/webhook/taskflow-inventory',
    event: 'inventory.adjust',
    eventId: `${itemId}:${delta}:${Date.now()}`,
    payload: { inventoryItemId: itemId, sku, delta, to, reason: reason ?? null },
  });
}

export async function adjustInventoryQuantity(
  id: string,
  quantity: number,
  userId: string,
  reason?: string
) {
  const item = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!item) throw new AppError('Inventory item not found', StatusCodes.NOT_FOUND);

  // Ensure quantity doesn't go below 0
  const newQuantity = Math.max(0, item.quantity + quantity);
  const direction = quantity >= 0 ? 'INCREASE' : 'DECREASE';

  const updated = await prisma.inventoryItem.update({
    where: { id },
    data: { quantity: newQuantity },
  });

  // Audit trail: every inventory adjustment is recorded as an Activity so the
  // reason + actor + delta are traceable (inventory has no metadata column of
  // its own, so we reuse the existing Activity feed scoped to the project).
  await prisma.activity
    .create({
      data: {
        projectId: item.projectId,
        userId,
        action: 'INVENTORY_ADJUSTED',
        metadata: {
          inventoryItemId: id,
          sku: item.sku,
          delta: quantity,
          from: item.quantity,
          to: newQuantity,
          direction,
          reason: reason ?? null,
        },
      },
    })
    .catch(() => {
      // Best-effort: a failed audit write must not roll back the adjustment.
    });

  // Best-effort n8n hook for inventory adjustments (does not block the response).
  void notifyInventoryAdjust(id, item.sku, quantity, newQuantity, reason);

  return updated;
}

export async function deleteInventoryItem(id: string): Promise<void> {
  const item = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!item) throw new AppError('Inventory item not found', StatusCodes.NOT_FOUND);
  await prisma.inventoryItem.delete({ where: { id } });
}
