import { Prisma, OrderStatus } from '@prisma/client';
import { RequestHandler } from 'express';
import { StatusCodes } from 'http-status-codes';
import * as supplychainService from './supplychain.service';
import { createSupplierSchema, createOrderSchema, updateOrderStatusSchema, createLineItemSchema, adjustInventorySchema, createInventoryItemSchema, updateInventoryItemSchema } from './supplychain.schema';
import { AppError } from '../../utils/errors';

// ---------------------------------------------------------------------------
// Supplier handlers
// ---------------------------------------------------------------------------

export const getSuppliers: RequestHandler = async (req, res) => {
  const { id, code, name } = req.query;
  const where: { id?: string; code?: string; name?: string } = {};
  if (id) where.id = id as string;
  if (code) where.code = code as string;
  if (name) where.name = name as string;
  const suppliers = await supplychainService.getSuppliers(where);
  res.json({ data: suppliers, count: suppliers.length });
};

export const getSupplier: RequestHandler = async (req, res) => {
  const supplier = await supplychainService.getSupplierById(req.params.id as string);
  res.json({ data: supplier });
};

export const createSupplier: RequestHandler = async (req, res) => {
  const data = createSupplierSchema.parse(req.body);
  const supplier = await supplychainService.createSupplier(data);
  res.status(201).json({ data: supplier });
};

export const updateSupplier: RequestHandler = async (req, res) => {
  const data = createSupplierSchema.partial().parse(req.body);
  const supplier = await supplychainService.updateSupplier(req.params.id as string, data);
  res.json({ data: supplier });
};

export const deleteSupplier: RequestHandler = async (req, res) => {
  await supplychainService.deleteSupplier(req.params.id as string);
  res.status(204).send();
};

// ---------------------------------------------------------------------------
// Order handlers
// ---------------------------------------------------------------------------

export const getOrders: RequestHandler = async (req, res) => {
  const { id, orderNumber, projectId, supplierId, status } = req.query;
  const where: { id?: string; orderNumber?: string; projectId?: string; supplierId?: string; status?: string } = {};
  if (id) where.id = id as string;
  if (orderNumber) where.orderNumber = orderNumber as string;
  if (projectId) where.projectId = projectId as string;
  if (supplierId) where.supplierId = supplierId as string;
  if (status) where.status = status as string;
  const orders = await supplychainService.getOrders(where, req.user!.id);
  res.json({ data: orders, count: orders.length });
};

export const getOrder: RequestHandler = async (req, res) => {
  const order = await supplychainService.getOrderById(req.params.id as string, req.user!.id);
  res.json({ data: order });
};

export const createOrder: RequestHandler = async (req, res) => {
  const raw = createOrderSchema.parse(req.body);
  const data: Prisma.OrderCreateInput = {
    project: { connect: { id: raw.projectId } },
    supplier: { connect: { id: raw.supplierId } },
    orderNumber: raw.orderNumber,
    status: raw.status,
    requestDate: raw.requestDate ? new Date(raw.requestDate) : null,
    deliveryDate: raw.deliveryDate ? new Date(raw.deliveryDate) : null,
    totalAmount: raw.totalAmount,
    currency: raw.currency ?? 'VND',
    notes: raw.notes,
  };
  const order = await supplychainService.createOrder(data, req.user!.id);
  res.status(201).json({ data: order });
};

export const updateOrderStatus: RequestHandler = async (req, res) => {
  const { id } = req.params;
  const { status } = updateOrderStatusSchema.parse(req.body);
  // Enforce the order status state machine (rejects illegal jumps).
  const order = await supplychainService.transitionOrderStatus(id as string, status as OrderStatus, req.user!.id);
  res.json({ data: order });
};

export const deleteOrder: RequestHandler = async (req, res) => {
  await supplychainService.deleteOrder(req.params.id as string, req.user!.id);
  res.status(204).send();
};

// ---------------------------------------------------------------------------
// Line Item handlers
// ---------------------------------------------------------------------------

export const getLineItems: RequestHandler = async (req, res) => {
  const { orderId } = req.query;
  if (!orderId || typeof orderId !== 'string') {
    throw new AppError('orderId query parameter is required', StatusCodes.BAD_REQUEST);
  }
  const lineItems = await supplychainService.getLineItemsByOrder(orderId, req.user!.id);
  res.json({ data: lineItems, count: lineItems.length });
};

export const createLineItem: RequestHandler = async (req, res) => {
  const data = createLineItemSchema.parse(req.body);
  const lineItem = await supplychainService.createLineItem({
    order: { connect: { id: data.orderId } },
    sku: data.sku,
    description: data.description,
    quantity: data.quantity,
    unitPrice: data.unitPrice,
    amount: data.amount,
  }, req.user!.id);
  res.status(201).json({ data: lineItem });
};

export const updateLineItem: RequestHandler = async (req, res) => {
  const data = createLineItemSchema.partial().parse(req.body);
  const lineItem = await supplychainService.updateLineItem(req.params.id as string, {
    ...(data.sku && { sku: data.sku }),
    ...(data.description !== undefined && { description: data.description }),
    ...(data.quantity && { quantity: data.quantity }),
    ...(data.unitPrice && { unitPrice: data.unitPrice }),
    ...(data.amount !== undefined && { amount: data.amount }),
  }, req.user!.id);
  res.json({ data: lineItem });
};

export const deleteLineItem: RequestHandler = async (req, res) => {
  await supplychainService.deleteLineItem(req.params.id as string, req.user!.id);
  res.status(204).send();
};

// ---------------------------------------------------------------------------
// Inventory handlers
// ---------------------------------------------------------------------------

export const getInventory: RequestHandler = async (req, res) => {
  const { projectId } = req.query;
  const items = await supplychainService.getInventoryItems(
    projectId ? String(projectId) : undefined,
    req.user!.id
  );
  res.json({ data: items, count: items.length });
};

export const getInventoryItem: RequestHandler = async (req, res) => {
  const item = await supplychainService.getInventoryItemById(req.params.id as string, req.user!.id);
  res.json({ data: item });
};

export const createInventoryItem: RequestHandler = async (req, res) => {
  const data = createInventoryItemSchema.parse(req.body);
  const item = await supplychainService.createInventoryItem({
    project: { connect: { id: data.projectId } },
    sku: data.sku,
    name: data.name,
    quantity: data.quantity,
    unit: data.unit || 'Cái',
    location: data.location || null,
    minStock: data.minStock ?? 0,
  }, req.user!.id);
  res.status(201).json({ data: item });
};

export const updateInventoryItem: RequestHandler = async (req, res) => {
  const { id } = req.params;
  // Strict schema: rejects unknown fields (mass-assignment) + negative quantity.
  const patch = updateInventoryItemSchema.parse(req.body);
  const item = await supplychainService.updateInventoryItem(id as string, patch, req.user!.id);
  res.json({ data: item });
};

export const adjustInventory: RequestHandler = async (req, res) => {
  const { id } = req.params;
  const { quantity, reason } = adjustInventorySchema.parse(req.body);
  const item = await supplychainService.adjustInventoryQuantity(
    id as string,
    quantity,
    req.user!.id,
    reason
  );
  res.json({ data: item });
};

export const deleteInventoryItem: RequestHandler = async (req, res) => {
  await supplychainService.deleteInventoryItem(req.params.id as string, req.user!.id);
  res.status(204).send();
};
