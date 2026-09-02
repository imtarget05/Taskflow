import { StatusCodes } from 'http-status-codes';
import { Prisma } from '@prisma/client';

jest.mock('../../../lib/prisma', () => ({
  prisma: {
    supplier: { create: jest.fn(), findUnique: jest.fn() },
    inventoryItem: { create: jest.fn(), findUnique: jest.fn() },
    project: { findUnique: jest.fn() },
    order: { create: jest.fn() },
  },
}));

jest.mock('../../integrations/n8n', () => ({
  dispatchToN8n: jest.fn().mockResolvedValue(true),
  isN8nConfigured: () => false,
}));

import { prisma } from '../../../lib/prisma';
import * as scService from '../supplychain.service';

const mockedPrisma = prisma as unknown as {
  supplier: { create: jest.Mock; findUnique: jest.Mock };
  inventoryItem: { create: jest.Mock; findUnique: jest.Mock };
};

function uniqueErr(target: string[]) {
  return new Prisma.PrismaClientKnownRequestError('unique', {
    code: 'P2002',
    clientVersion: '5.22.0',
    meta: { target },
  });
}

describe('supplychain.service unique-constraint handling', () => {
  beforeEach(() => jest.clearAllMocks());

  it('createSupplier returns 409 on duplicate code (no 500)', async () => {
    mockedPrisma.supplier.create.mockRejectedValue(uniqueErr(['code']));
    await expect(
      scService.createSupplier({ code: 'DUP', name: 'X' } as Prisma.SupplierCreateInput)
    ).rejects.toMatchObject({ statusCode: StatusCodes.CONFLICT });
  });

  it('createInventoryItem returns 409 on duplicate sku (no 500)', async () => {
    mockedPrisma.inventoryItem.create.mockRejectedValue(uniqueErr(['sku']));
    await expect(
      scService.createInventoryItem({ sku: 'DUP', name: 'X' } as Prisma.InventoryItemCreateInput, 'user-1')
    ).rejects.toMatchObject({ statusCode: StatusCodes.CONFLICT });
  });

  it('createSupplier rethrows non-unique Prisma errors', async () => {
    const other = new Prisma.PrismaClientKnownRequestError('db', { code: 'P2010', clientVersion: '5.22.0' });
    mockedPrisma.supplier.create.mockRejectedValue(other);
    await expect(
      scService.createSupplier({ code: 'X', name: 'Y' } as Prisma.SupplierCreateInput)
    ).rejects.toBe(other);
  });
});
