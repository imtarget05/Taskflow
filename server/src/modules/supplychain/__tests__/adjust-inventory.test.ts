const activityCreate = jest.fn().mockResolvedValue({ id: 'act1' });
const inventoryUpdate = jest.fn().mockResolvedValue({ id: 'i1', quantity: 10 });
const inventoryFind = jest.fn();

jest.mock('../../../lib/prisma', () => ({
  prisma: {
    inventoryItem: {
      findUnique: (...a: unknown[]) => inventoryFind(...a),
      update: (...a: unknown[]) => inventoryUpdate(...a),
    },
    activity: { create: (...a: unknown[]) => activityCreate(...a) },
  },
}));

jest.mock('../../integrations/n8n', () => ({
  dispatchToN8n: jest.fn().mockResolvedValue(false),
}));

import { adjustInventoryQuantity } from '../supplychain.service';

describe('adjustInventoryQuantity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    inventoryFind.mockResolvedValue({
      id: 'i1',
      projectId: 'p1',
      sku: 'SKU-1',
      quantity: 5,
    });
  });

  it('clamps quantity to a minimum of 0', async () => {
    inventoryUpdate.mockResolvedValue({ id: 'i1', quantity: 0 });
    await adjustInventoryQuantity('i1', -100, 'u1', 'stocktake');
    expect(inventoryUpdate).toHaveBeenCalledWith({
      where: { id: 'i1' },
      data: { quantity: 0 },
    });
  });

  it('writes an audit Activity with the reason + delta', async () => {
    inventoryUpdate.mockResolvedValue({ id: 'i1', quantity: 8 });
    await adjustInventoryQuantity('i1', 3, 'u1', 'nhập thêm');

    expect(activityCreate).toHaveBeenCalledWith({
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

  it('throws 404 when the item does not exist', async () => {
    inventoryFind.mockResolvedValue(null);
    await expect(adjustInventoryQuantity('missing', 1, 'u1')).rejects.toThrow();
  });
});
