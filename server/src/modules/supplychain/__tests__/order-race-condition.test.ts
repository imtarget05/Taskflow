/**
 * Concurrency tests for transitionOrderStatus.
 *
 * Goal: prove the transition is atomic and refuses to silently overwrite
 * a state another caller has already moved.
 *
 * The original implementation:
 *   1) findUnique
 *   2) canTransition check (in JS, on the snapshot)
 *   3) prisma.order.update({ where: { id }, data: { status: to } })
 *
 * Step (3) has NO status guard, so two concurrent requests can both pass
 * step (2) and both succeed — the second one silently overwrites whatever
 * the first one wrote. We fix it by using a `where: { id, status: from }`
 * guard. If zero rows are affected, we throw 409.
 */
import { StatusCodes } from 'http-status-codes';

// Hoist-friendly mock for prisma so we can swap implementations per test.
const prismaMock: any = {
  order: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};
jest.mock('../../../lib/prisma', () => ({ prisma: prismaMock }));

import { transitionOrderStatus } from '../supplychain.service';
import { AppError } from '../../../utils/errors';
import { OrderStatus } from '@prisma/client';

const orderId = 'order_123';

function snapshot(status: OrderStatus) {
  return {
    id: orderId,
    status,
    projectId: 'p1',
    supplierId: 's1',
    orderNumber: 'PO-1',
    requestDate: null,
    deliveryDate: null,
    totalAmount: null,
    currency: 'VND',
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('transitionOrderStatus — atomic state guard', () => {
  it('updates when current status matches the expected snapshot', async () => {
    prismaMock.order.findUnique.mockResolvedValue(snapshot('PENDING_APPROVAL'));
    prismaMock.order.update.mockResolvedValue({ ...snapshot('PENDING_APPROVAL'), status: 'APPROVED' });
    const out = await transitionOrderStatus(orderId, 'APPROVED' as OrderStatus);
    expect(out.status).toBe('APPROVED');
    // The fix requires passing the snapshot's status into the where clause.
    expect(prismaMock.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: orderId, status: 'PENDING_APPROVAL' },
        data: { status: 'APPROVED' },
      })
    );
  });

  it('rejects with 409 when another caller already changed the status (race)', async () => {
    // Snapshot says PENDING, but the atomic update with where status=PENDING
    // finds zero rows because the other caller already moved it to APPROVED.
    prismaMock.order.findUnique.mockResolvedValue(snapshot('PENDING_APPROVAL'));
    prismaMock.order.update.mockResolvedValue(null); // updateMany-style: no row matched
    await expect(transitionOrderStatus(orderId, 'APPROVED' as OrderStatus)).rejects.toBeInstanceOf(AppError);
    try {
      await transitionOrderStatus(orderId, 'APPROVED' as OrderStatus);
    } catch (e: any) {
      expect(e.statusCode).toBe(StatusCodes.CONFLICT);
    }
  });

  it('still rejects illegal transitions with 400 (not 500)', async () => {
    prismaMock.order.findUnique.mockResolvedValue(snapshot('CLOSED'));
    await expect(transitionOrderStatus(orderId, 'APPROVED' as OrderStatus)).rejects.toMatchObject({
      statusCode: StatusCodes.BAD_REQUEST,
    });
  });

  it('returns 404 when order does not exist', async () => {
    prismaMock.order.findUnique.mockResolvedValue(null);
    await expect(transitionOrderStatus(orderId, 'APPROVED' as OrderStatus)).rejects.toMatchObject({
      statusCode: StatusCodes.NOT_FOUND,
    });
  });
});
