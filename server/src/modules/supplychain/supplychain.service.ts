import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/errors';
import { StatusCodes } from 'http-status-codes';

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
  const supplier = await prisma.supplier.create({ data });
  return supplier;
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
  const order = await prisma.order.create({ data });
  return order;
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
  return prisma.inventoryItem.create({ data });
}

export async function updateInventoryItem(id: string, data: Prisma.InventoryItemUpdateInput) {
  const item = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!item) throw new AppError('Inventory item not found', StatusCodes.NOT_FOUND);
  return prisma.inventoryItem.update({ where: { id }, data });
}

export async function adjustInventoryQuantity(id: string, quantity: number, reason?: string) {
  const item = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!item) throw new AppError('Inventory item not found', StatusCodes.NOT_FOUND);

  // Ensure quantity doesn't go below 0
  const newQuantity = Math.max(0, item.quantity + quantity);

  return prisma.inventoryItem.update({
    where: { id },
    data: {
      quantity: newQuantity,
      ...(reason && { /* note metadata if needed */ }),
    },
  });
}

export async function deleteInventoryItem(id: string): Promise<void> {
  const item = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!item) throw new AppError('Inventory item not found', StatusCodes.NOT_FOUND);
  await prisma.inventoryItem.delete({ where: { id } });
}
