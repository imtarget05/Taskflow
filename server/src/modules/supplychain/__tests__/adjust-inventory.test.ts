const inventoryFind = jest.fn();
const projectMemberFind = jest.fn();
const txUpdateMany = jest.fn();
const txFindUnique = jest.fn();
const txActivityCreate = jest.fn();
const transactionFn = jest.fn(
  (fn: (tx: any) => Promise<unknown>) => fn(mockTx)
);

const mockTx = {
  inventoryItem: {
    updateMany: (...a: unknown[]) => txUpdateMany(...a),
    findUnique: (...a: unknown[]) => txFindUnique(...a),
  },
  activity: { create: (...a: unknown[]) => txActivityCreate(...a) },
};

jest.mock('../../../lib/prisma', () => ({
  prisma: {
    inventoryItem: {
      findUnique: (...a: unknown[]) => inventoryFind(...a),
    },
    projectMember: { findUnique: (...a: unknown[]) => projectMemberFind(...a) },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => transactionFn(fn),
  },
}));

jest.mock('../../integrations/n8n', () => ({
  dispatchToN8n: jest.fn().mockResolvedValue(false),
}));

import { adjustInventoryQuantity } from '../supplychain.service';

describe('adjustInventoryQuantity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    projectMemberFind.mockResolvedValue({ role: 'OWNER' });
    inventoryFind.mockResolvedValue({
      id: 'i1',
      projectId: 'p1',
      sku: 'SKU-1',
      quantity: 5,
    });
    txUpdateMany.mockResolvedValue({ count: 1 });
    txFindUnique.mockResolvedValue({ id: 'i1', projectId: 'p1', sku: 'SKU-1', quantity: 8 });
    txActivityCreate.mockResolvedValue({ id: 'act1' });
  });

  it('applies the delta via a DB-side atomic increment (no read-then-write)', async () => {
    await adjustInventoryQuantity('i1', 3, 'u1', 'nhập thêm');
    expect(txUpdateMany).toHaveBeenCalledWith({
      where: { id: 'i1', quantity: { gte: 0 } },
      data: { quantity: { increment: 3 } },
    });
  });

  it('guards decrements against negative stock (gte |delta|)', async () => {
    await adjustInventoryQuantity('i1', -2, 'u1', 'xuất kho');
    expect(txUpdateMany).toHaveBeenCalledWith({
      where: { id: 'i1', quantity: { gte: 2 } },
      data: { quantity: { increment: -2 } },
    });
  });

  it('rejects a decrement that would take stock below zero', async () => {
    txUpdateMany.mockResolvedValue({ count: 0 });
    await expect(adjustInventoryQuantity('i1', -100, 'u1')).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(txActivityCreate).not.toHaveBeenCalled();
  });

  it('writes an audit Activity with the reason + delta', async () => {
    await adjustInventoryQuantity('i1', 3, 'u1', 'nhập thêm');

    expect(txActivityCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: 'p1',
        userId: 'u1',
        action: 'INVENTORY_ADJUSTED',
        metadata: expect.objectContaining({
          inventoryItemId: 'i1',
          sku: 'SKU-1',
          delta: 3,
          from: 5,
          to: 8,
          direction: 'INCREASE',
          reason: 'nhập thêm',
        }),
      }),
    });
  });

  it('commits update + audit inside a single transaction', async () => {
    await adjustInventoryQuantity('i1', 3, 'u1');
    expect(transactionFn).toHaveBeenCalled();
  });

  it('throws 404 when the item does not exist', async () => {
    inventoryFind.mockResolvedValue(null);
    await expect(adjustInventoryQuantity('missing', 1, 'u1')).rejects.toThrow();
  });

  it('throws 403 when the actor is not a project member (IDOR)', async () => {
    projectMemberFind.mockResolvedValue(null);
    await expect(adjustInventoryQuantity('i1', 1, 'u1')).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(txUpdateMany).not.toHaveBeenCalled();
  });
});
