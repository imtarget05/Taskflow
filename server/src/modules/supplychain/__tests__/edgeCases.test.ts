import { StatusCodes } from 'http-status-codes';
import { createInventoryItemSchema } from '../supplychain.schema';

describe('createInventoryItemSchema (edge cases)', () => {
  const base = { projectId: 'proj1', sku: 'SKU1', name: 'Item', quantity: 10 };

  it('accepts valid payload', () => {
    const r = createInventoryItemSchema.safeParse(base);
    expect(r.success).toBe(true);
  });

  it('rejects negative quantity', () => {
    const r = createInventoryItemSchema.safeParse({ ...base, quantity: -5 });
    expect(r.success).toBe(false);
  });

  it('rejects non-integer quantity', () => {
    const r = createInventoryItemSchema.safeParse({ ...base, quantity: 1.5 });
    expect(r.success).toBe(false);
  });

  it('rejects string quantity (type confusion)', () => {
    const r = createInventoryItemSchema.safeParse({ ...base, quantity: 'abc' as any });
    expect(r.success).toBe(false);
  });

  it('rejects missing projectId', () => {
    const r = createInventoryItemSchema.safeParse({ sku: 'S', name: 'N', quantity: 1 });
    expect(r.success).toBe(false);
  });

  it('allows zero quantity', () => {
    const r = createInventoryItemSchema.safeParse({ ...base, quantity: 0 });
    expect(r.success).toBe(true);
  });

  it('rejects oversized name', () => {
    const r = createInventoryItemSchema.safeParse({ ...base, name: 'A'.repeat(201) });
    expect(r.success).toBe(false);
  });
});

describe('getLineItems validation', () => {
  // placeholder — controller throw AppError 400 tested below
});

// Controller-level: simulate getLineItems missing orderId returns 400 (not 500)
jest.mock('../supplychain.service', () => ({
  getLineItemsByOrder: jest.fn(),
}));
import { getLineItems } from '../supplychain.controller';
import { AppError } from '../../../utils/errors';

function mockReqRes(query: any) {
  const req: any = { query, params: {}, user: { id: 'u1' } };
  const res: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };
  const next: any = jest.fn();
  return { req, res, next };
}

describe('getLineItems controller', () => {
  it('throws AppError 400 when orderId missing (no 500 crash)', async () => {
    const { req, res, next } = mockReqRes({});
    await expect(getLineItems(req, res, next)).rejects.toBeInstanceOf(AppError);
    try {
      await getLineItems(req, res, next);
    } catch (e: any) {
      expect(e.statusCode).toBe(StatusCodes.BAD_REQUEST);
    }
  });
});
