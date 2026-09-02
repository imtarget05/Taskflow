import { Prisma, OrderStatus, Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/errors';
import { StatusCodes } from 'http-status-codes';
import { dispatchToN8n } from '../integrations/n8n';
import { assertRole } from '../project/project.service';

/**
 * Accounts a user is a member of. Used to fail-closed when no explicit
 * project scope is given (e.g. GET /api/sc/orders without projectId) so a
 * caller can never list another project's records.
 */
async function accessibleProjects(userId: string): Promise<string[]> {
  const memberships = await prisma.projectMember.findMany({
    where: { userId },
    select: { projectId: true },
  });
  return memberships.map((m) => m.projectId);
}

/** Resolve the projectId out of an (assumed connect) relation input. */
function connectId(rel: unknown): string | undefined {
  if (typeof rel === 'object' && rel !== null && 'connect' in rel) {
    return (rel.connect as { id?: string } | undefined)?.id;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Supplier CRUD
// ---------------------------------------------------------------------------
// NOTE: Suppliers are a shared catalog with no project ownership, so read
// access is intentionally open. Order/inventory/line-item rows below are all
// project-scoped and enforce membership.

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

export async function getOrders(where: OrderWhere | undefined, userId: string) {
  const allowed = await accessibleProjects(userId);
  const effectiveProjectId = where?.projectId;

  // Fail closed when an explicit project is requested but the user has no access.
  if (effectiveProjectId && !allowed.includes(effectiveProjectId)) {
    throw new AppError('Not a member of this project', StatusCodes.FORBIDDEN);
  }

  // Scope to the requested project, or to the union of the user's own projects.
  const projectScope = effectiveProjectId ? [effectiveProjectId] : allowed;
  if (projectScope.length === 0) return [];

  return prisma.order.findMany({
    where: {
      ...(where?.id && { id: where.id }),
      ...(where?.orderNumber && { orderNumber: where.orderNumber }),
      ...(where?.supplierId && { supplierId: where.supplierId }),
      ...(where?.status && { status: where.status as Prisma.EnumOrderStatusFilter['equals'] }),
      projectId: { in: projectScope },
    },
    include: {
      supplier: true,
      lineItems: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getOrderById(id: string, userId: string) {
  const order = await prisma.order.findUnique({
    where: { id },
    include: { supplier: true, lineItems: true },
  });
  if (!order) throw new AppError('Order not found', StatusCodes.NOT_FOUND);
  await assertRole(order.projectId, userId, Role.VIEWER);
  return order;
}

export async function createOrder(data: Prisma.OrderCreateInput, userId: string) {
  // Resolve the referenced project/supplier ids (nested connect shape) so we can
  // return a clean 400 instead of letting Prisma throw P2025 → 500.
  const projectId = connectId(data.project);
  const supplierId = connectId(data.supplier);

  if (projectId) {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new AppError(`Project ${projectId} not found`, StatusCodes.BAD_REQUEST);
    await assertRole(projectId, userId, Role.MEMBER);
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

export async function updateOrderStatus(id: string, status: Prisma.EnumOrderStatusFilter['equals'], userId: string) {
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) throw new AppError('Order not found', StatusCodes.NOT_FOUND);
  await assertRole(order.projectId, userId, Role.MEMBER);
  return prisma.order.update({
    where: { id },
    data: { status },
    include: { supplier: true, lineItems: true },
  });
}

export async function deleteOrder(id: string, userId: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) throw new AppError('Order not found', StatusCodes.NOT_FOUND);
  await assertRole(order.projectId, userId, Role.MEMBER);
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
  DELIVERED: ['CLOSED', 'CANCELLED'],
  CANCELLED: [],
  CLOSED: [],
};

export function canTransitionOrderStatus(from: string, to: string): boolean {
  if (from === to) return true; // idempotent
  return (ORDER_TRANSITIONS[from] ?? []).includes(to);
}

export async function transitionOrderStatus(
  id: string,
  to: OrderStatus,
  userId: string
) {
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) throw new AppError('Order not found', StatusCodes.NOT_FOUND);
  await assertRole(order.projectId, userId, Role.MEMBER);
  if (!canTransitionOrderStatus(order.status, to)) {
    throw new AppError(
      `Không thể chuyển trạng thái đơn hàng từ ${order.status} sang ${to}`,
      StatusCodes.BAD_REQUEST
    );
  }
  // Atomic guard: the update only succeeds if the row's status is still
  // what we read. If another caller already moved it (e.g. a parallel
  // PENDING→APPROVED vs PENDING→CANCELLED race) Prisma throws P2025
  // (record not found) or the update returns null — both surface 409 so the
  // client can refetch.
  let updated;
  try {
    updated = await prisma.order.update({
      where: { id, status: order.status },
      data: { status: to },
      include: { supplier: true, lineItems: true },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      throw new AppError(
        'Order status changed concurrently; please retry',
        StatusCodes.CONFLICT
      );
    }
    throw err;
  }
  if (!updated) {
    throw new AppError(
      'Order status changed concurrently; please retry',
      StatusCodes.CONFLICT
    );
  }

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

export async function getLineItemsByOrder(orderId: string, userId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError('Order not found', StatusCodes.NOT_FOUND);
  await assertRole(order.projectId, userId, Role.VIEWER);
  return prisma.lineItem.findMany({
    where: { orderId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createLineItem(data: Prisma.LineItemCreateInput, userId: string) {
  const orderId = typeof data.order === 'object' && data.order !== null
    ? data.order.connect!.id
    : data.order as string;
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError('Order not found', StatusCodes.NOT_FOUND);
  await assertRole(order.projectId, userId, Role.MEMBER);
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

export async function updateLineItem(id: string, data: Prisma.LineItemUpdateInput, userId: string) {
  const lineItem = await prisma.lineItem.findUnique({ where: { id } });
  if (!lineItem) throw new AppError('Line item not found', StatusCodes.NOT_FOUND);
  await assertProjectAccessForOrder(lineItem.orderId, userId);
  return prisma.lineItem.update({ where: { id }, data });
}

export async function deleteLineItem(id: string, userId: string): Promise<void> {
  const lineItem = await prisma.lineItem.findUnique({ where: { id } });
  if (!lineItem) throw new AppError('Line item not found', StatusCodes.NOT_FOUND);
  await assertProjectAccessForOrder(lineItem.orderId, userId);
  await prisma.lineItem.delete({ where: { id } });
}

/** Assert the user is a MEMBER of the project that owns the given order. */
async function assertProjectAccessForOrder(orderId: string, userId: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { projectId: true } });
  if (!order) throw new AppError('Order not found', StatusCodes.NOT_FOUND);
  await assertRole(order.projectId, userId, Role.MEMBER);
}

// ---------------------------------------------------------------------------
// Inventory CRUD
// ---------------------------------------------------------------------------

export async function getInventoryItems(projectId: string | undefined, userId: string) {
  const allowed = await accessibleProjects(userId);
  if (projectId && !allowed.includes(projectId)) {
    throw new AppError('Not a member of this project', StatusCodes.FORBIDDEN);
  }
  const projectScope = projectId ? [projectId] : allowed;
  if (projectScope.length === 0) return [];
  return prisma.inventoryItem.findMany({
    where: { projectId: { in: projectScope } },
    orderBy: { name: 'asc' },
  });
}

export async function getInventoryItemById(id: string, userId: string) {
  const item = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!item) throw new AppError('Inventory item not found', StatusCodes.NOT_FOUND);
  await assertRole(item.projectId, userId, Role.VIEWER);
  return item;
}

export async function createInventoryItem(data: Prisma.InventoryItemCreateInput, userId: string) {
  const projectId = connectId(data.project);
  if (projectId) {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new AppError(`Project ${projectId} not found`, StatusCodes.BAD_REQUEST);
    await assertRole(projectId, userId, Role.MEMBER);
  }
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

export async function updateInventoryItem(id: string, data: Prisma.InventoryItemUpdateInput, userId: string) {
  const item = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!item) throw new AppError('Inventory item not found', StatusCodes.NOT_FOUND);
  await assertRole(item.projectId, userId, Role.MEMBER);
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
  await assertRole(item.projectId, userId, Role.MEMBER);

  const direction = quantity >= 0 ? 'INCREASE' : 'DECREASE';
  // Guard: a decrement must not push stock below 0. For increments the guard is
  // always satisfied (gte 0).
  const minRequired = quantity < 0 ? -quantity : 0;

  // Atomic increment (applied by the DB as `quantity + $1`) so two concurrent
  // adjustments can NEVER lose an update. The `updateMany` WHERE guard together
  // with the transaction guarantee: same committed base + non-negative stock.
  // The audit trail commits in the same transaction so it can't diverge.
  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.inventoryItem.updateMany({
      where: { id, quantity: { gte: minRequired } },
      data: { quantity: { increment: quantity } },
    });
    if (res.count === 0) {
      throw new AppError('Không đủ số lượng tồn kho để giảm', StatusCodes.CONFLICT);
    }
    const row = await tx.inventoryItem.findUnique({ where: { id } });
    if (!row) throw new AppError('Inventory item not found', StatusCodes.NOT_FOUND);

    await tx.activity.create({
      data: {
        projectId: item.projectId,
        userId,
        action: 'INVENTORY_ADJUSTED',
        metadata: {
          inventoryItemId: id,
          sku: item.sku,
          delta: quantity,
          from: row.quantity - quantity,
          to: row.quantity,
          direction,
          reason: reason ?? null,
        },
      },
    });
    return row;
  });

  // Best-effort n8n hook for inventory adjustments (does not block the response).
  void notifyInventoryAdjust(id, item.sku, quantity, updated.quantity, reason);

  return updated;
}

export async function deleteInventoryItem(id: string, userId: string): Promise<void> {
  const item = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!item) throw new AppError('Inventory item not found', StatusCodes.NOT_FOUND);
  await assertRole(item.projectId, userId, Role.MEMBER);
  await prisma.inventoryItem.delete({ where: { id } });
}
