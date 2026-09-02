import { z } from 'zod';

export const createSupplierSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().min(1).max(50),
  contactName: z.string().max(200).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  address: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
});

export const createOrderSchema = z.object({
  projectId: z.string(),
  supplierId: z.string(),
  orderNumber: z.string().min(1).max(100),
  status: z.enum([
    'PENDING_APPROVAL',
    'APPROVED',
    'IN_FULFILLMENT',
    'SHIPPED',
    'DELIVERED',
    'CANCELLED',
    'CLOSED',
  ]).default('PENDING_APPROVAL'),
  requestDate: z.string().datetime().optional(),
  deliveryDate: z.string().datetime().optional(),
  totalAmount: z.number().min(0).optional(),
  currency: z.string().max(10).optional(),
  notes: z.string().max(2000).optional(),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum([
    'PENDING_APPROVAL',
    'APPROVED',
    'IN_FULFILLMENT',
    'SHIPPED',
    'DELIVERED',
    'CANCELLED',
    'CLOSED',
  ]),
});

export const createLineItemSchema = z.object({
  orderId: z.string(),
  sku: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  quantity: z.number().min(1),
  unitPrice: z.number().min(0),
  amount: z.number().min(0).optional(),
});

export const createInventoryItemSchema = z.object({
  projectId: z.string().min(1),
  sku: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  quantity: z.number().int().min(0),
  unit: z.string().max(20).optional(),
  location: z.string().max(200).optional(),
  minStock: z.number().int().min(0).optional(),
});

// Strict-by-default update guard: rejects any unknown field (mass-assignment)
// and enforces quantity/minStock >= 0 so a client can never corrupt stock.
export const updateInventoryItemSchema = z
  .object({
    sku: z.string().min(1).max(100).optional(),
    name: z.string().min(1).max(200).optional(),
    quantity: z.number().int().min(0).optional(),
    unit: z.string().max(20).optional(),
    location: z.string().max(200).nullable().optional(),
    minStock: z.number().int().min(0).optional(),
  })
  .strict();

export const adjustInventorySchema = z.object({
  quantity: z.number().int(),
  reason: z.string().max(200).optional(),
});
