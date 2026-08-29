import { StatusCodes } from 'http-status-codes';
import * as scService from '../supplychain.service';
import { Prisma } from '@prisma/client';

jest.mock('../../../lib/prisma', () => ({
  prisma: {
    project: { findUnique: jest.fn() },
    supplier: { findUnique: jest.fn() },
    order: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  },
}));

jest.mock('../../integrations/n8n', () => ({
  dispatchToN8n: jest.fn().mockResolvedValue(true),
  isN8nConfigured: () => false,
}));

import { prisma } from '../../../lib/prisma';

const mockedPrisma = prisma as unknown as {
  project: { findUnique: jest.Mock };
  supplier: { findUnique: jest.Mock };
  order: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
};

describe('supplychain.service.createOrder validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.project.findUnique.mockResolvedValue({ id: 'proj-real' });
    mockedPrisma.supplier.findUnique.mockResolvedValue({ id: 'sup-real' });
    mockedPrisma.order.create.mockResolvedValue({ id: 'order-1' });
  });

  it('rejects a non-existent projectId with 400 (no P2025 FK crash)', async () => {
    mockedPrisma.project.findUnique.mockResolvedValue(null);
    await expect(
      scService.createOrder({
        orderNumber: 'PO-1',
        project: { connect: { id: 'proj-ghost' } },
        supplier: { connect: { id: 'sup-real' } },
        status: 'PENDING_APPROVAL',
      } as unknown as Prisma.OrderCreateInput)
    ).rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
  });

  it('rejects a non-existent supplierId with 400', async () => {
    mockedPrisma.supplier.findUnique.mockResolvedValue(null);
    await expect(
      scService.createOrder({
        orderNumber: 'PO-1',
        project: { connect: { id: 'proj-real' } },
        supplier: { connect: { id: 'sup-ghost' } },
        status: 'PENDING_APPROVAL',
      } as unknown as Prisma.OrderCreateInput)
    ).rejects.toMatchObject({ statusCode: StatusCodes.BAD_REQUEST });
  });

  it('creates order when project + supplier exist', async () => {
    const result = await scService.createOrder({
      orderNumber: 'PO-1',
      project: { connect: { id: 'proj-real' } },
      supplier: { connect: { id: 'sup-real' } },
      status: 'PENDING_APPROVAL',
    } as unknown as Prisma.OrderCreateInput);
    expect(result).toBeDefined();
    expect(mockedPrisma.order.create).toHaveBeenCalledTimes(1);
  });

  it('does not swallow Prisma errors unrelated to FK (rethrows)', async () => {
    // Simulate a non-FK Prisma error; should still throw (not silently pass)
    const otherErr = new Prisma.PrismaClientKnownRequestError('db down', {
      code: 'P2010',
      clientVersion: '5.22.0',
    });
    mockedPrisma.order.create.mockRejectedValue(otherErr);
    await expect(
      scService.createOrder({
        orderNumber: 'PO-1',
        project: { connect: { id: 'proj-real' } },
        supplier: { connect: { id: 'sup-real' } },
        status: 'PENDING_APPROVAL',
      } as unknown as Prisma.OrderCreateInput)
    ).rejects.toBe(otherErr);
  });
});
