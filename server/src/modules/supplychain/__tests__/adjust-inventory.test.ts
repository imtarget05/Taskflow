import { describe, it, expect, vi, beforeEach } from 'vitest';

const activityCreate = vi.fn().mockResolvedValue({ id: 'act1' });
const inventoryUpdate = vi.fn().mockResolvedValue({ id: 'i1', quantity: 10 });
const inventoryFind = vi.fn();

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    inventoryItem: {
      findUnique: (...a: unknown[]) => inventoryFind(...a),
      update: (...a: unknown[]) => inventoryUpdate(...a),
    },
    activity: { create: (...a: unknown[]) => activityCreate(...a) },
  },
}));

vi.mock('../../integrations/n8n', () => ({
  dispatchToN8n: vi.fn().mockResolvedValue(false),
}));

import { adjustInventoryQuantity } from '../supplychain.service';
import { prisma } from '../../../lib/prisma';

const mockedPrisma = prisma as unknown as {
  inventoryItem: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  activity: { create: ReturnType<typeof vi.fn> };
};

describe('adjustInventoryQuantity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(mockedPrisma.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: 'i1' },
      data: { quantity: 0 },
    });
  });

  it('writes an audit Activity with the reason + delta', async () => {
    inventoryUpdate.mockResolvedValue({ id: 'i1', quantity: 8 });
    await adjustInventoryQuantity('i1', 3, 'u1', 'nhập thêm');

    expect(mockedPrisma.activity.create).toHaveBeenCalledWith({
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
