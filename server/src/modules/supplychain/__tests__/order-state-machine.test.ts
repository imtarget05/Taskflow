import { canTransitionOrderStatus } from '../supplychain.service';

describe('order status state machine', () => {
  it('allows valid forward transitions', () => {
    expect(canTransitionOrderStatus('PENDING_APPROVAL', 'APPROVED')).toBe(true);
    expect(canTransitionOrderStatus('APPROVED', 'IN_FULFILLMENT')).toBe(true);
    expect(canTransitionOrderStatus('IN_FULFILLMENT', 'SHIPPED')).toBe(true);
    expect(canTransitionOrderStatus('SHIPPED', 'DELIVERED')).toBe(true);
    expect(canTransitionOrderStatus('DELIVERED', 'CLOSED')).toBe(true);
  });

  it('allows cancellation from any active state', () => {
    expect(canTransitionOrderStatus('PENDING_APPROVAL', 'CANCELLED')).toBe(true);
    expect(canTransitionOrderStatus('IN_FULFILLMENT', 'CANCELLED')).toBe(true);
    expect(canTransitionOrderStatus('SHIPPED', 'CANCELLED')).toBe(true);
  });

  it('rejects illegal jumps', () => {
    expect(canTransitionOrderStatus('PENDING_APPROVAL', 'CLOSED')).toBe(false);
    expect(canTransitionOrderStatus('PENDING_APPROVAL', 'SHIPPED')).toBe(false);
    expect(canTransitionOrderStatus('CLOSED', 'APPROVED')).toBe(false);
    expect(canTransitionOrderStatus('CANCELLED', 'APPROVED')).toBe(false);
  });

  it('treats same-status as idempotent', () => {
    expect(canTransitionOrderStatus('APPROVED', 'APPROVED')).toBe(true);
  });

  it('rejects unknown source states', () => {
    expect(canTransitionOrderStatus('NONSENSE', 'APPROVED')).toBe(false);
  });
});
