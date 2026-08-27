import { Prisma } from '@prisma/client';
import { RequestHandler } from 'express';
import * as supplychainService from './supplychain.service';
import { createSupplierSchema, createOrderSchema, updateOrderStatusSchema, createLineItemSchema, adjustInventorySchema } from './supplychain.schema';

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
  const orders = await supplychainService.getOrders(where);
  res.json({ data: orders, count: orders.length });
};

export const getOrder: RequestHandler = async (req, res) => {
  const order = await supplychainService.getOrderById(req.params.id as string);
  res.json({ data: order });
};

export const createOrder: RequestHandler = async (req, res) => {
  const raw = createOrderSchema.parse(req.body);
  const data: Prisma.OrderCreateInput = {
    project: { connect: { id: raw.projectId } },
    supplier: { connect: { id: raw.supplierId } },
    orderNumber: raw.orderNumber,
    requestDate: raw.requestDate ? new Date(raw.requestDate) : null,
    deliveryDate: raw.deliveryDate ? new Date(raw.deliveryDate) : null,
    totalAmount: raw.totalAmount,
    currency: raw.currency ?? 'VND',
    notes: raw.notes,
  };
  const order = await supplychainService.createOrder(data);
  res.status(201).json({ data: order });
};

export const updateOrderStatus: RequestHandler = async (req, res) => {
  const { id } = req.params;
  const { status } = updateOrderStatusSchema.parse(req.body);
  const order = await supplychainService.updateOrderStatus(id as string, status);
  res.json({ data: order });
};

export const deleteOrder: RequestHandler = async (req, res) => {
  await supplychainService.deleteOrder(req.params.id as string);
  res.status(204).send();
};

// ---------------------------------------------------------------------------
// Line Item handlers
// ---------------------------------------------------------------------------

export const getLineItems: RequestHandler = async (req, res) => {
  const { orderId } = req.query;
  if (!orderId) throw new Error('orderId query parameter is required');
  const lineItems = await supplychainService.getLineItemsByOrder(orderId as string);
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
  });
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
  });
  res.json({ data: lineItem });
};

export const deleteLineItem: RequestHandler = async (req, res) => {
  await supplychainService.deleteLineItem(req.params.id as string);
  res.status(204).send();
};

// ---------------------------------------------------------------------------
// Inventory handlers
// ---------------------------------------------------------------------------

export const getInventory: RequestHandler = async (req, res) => {
  const { projectId } = req.query;
  const items = await supplychainService.getInventoryItems(projectId ? String(projectId) : undefined);
  res.json({ data: items, count: items.length });
};

export const getInventoryItem: RequestHandler = async (req, res) => {
  const item = await supplychainService.getInventoryItemById(req.params.id as string);
  res.json({ data: item });
};

export const createInventoryItem: RequestHandler = async (req, res) => {
  // Note: full create needs more fields — for now require projectId, sku, name, quantity
  const { projectId, sku, name, quantity, unit, location, minStock } = req.body;
  if (!projectId || !sku || !name || quantity === undefined) {
    throw new Error('projectId, sku, name, and quantity are required');
  }
  const item = await supplychainService.createInventoryItem({
    project: { connect: { id: projectId } },
    sku,
    name,
    quantity: quantity as number,
    unit: unit || 'Cái',
    location: location || null,
    minStock: minStock ?? 0,
  });
  res.status(201).json({ data: item });
};

export const updateInventoryItem: RequestHandler = async (req, res) => {
  const { id } = req.params;
  const { sku, name, quantity, unit, location, minStock } = req.body;
  const patch: Record<string, unknown> = {};
  if (sku !== undefined) patch.sku = sku;
  if (name !== undefined) patch.name = name;
  if (quantity !== undefined) patch.quantity = quantity;
  if (unit !== undefined) patch.unit = unit;
  if (location !== undefined) patch.location = location;
  if (minStock !== undefined) patch.minStock = minStock;

  const item = await supplychainService.updateInventoryItem(id as string, patch);
  res.json({ data: item });
};

export const adjustInventory: RequestHandler = async (req, res) => {
  const { id } = req.params;
  const { quantity, reason } = adjustInventorySchema.parse(req.body);
  const item = await supplychainService.adjustInventoryQuantity(id as string, quantity, reason);
  res.json({ data: item });
};

export const deleteInventoryItem: RequestHandler = async (req, res) => {
  await supplychainService.deleteInventoryItem(req.params.id as string);
  res.status(204).send();
};
