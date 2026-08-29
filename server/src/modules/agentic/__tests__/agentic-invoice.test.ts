import { describe, it, expect } from 'vitest';
import { evaluateDecision } from '../agentic.service';

describe('agentic evaluateDecision — invoice_verify', () => {
  it('passes the real orderId into the approve_payment action', () => {
    const decision = evaluateDecision(
      'INVOICE',
      0.8,
      'gửi cho bộ phận kế toán',
      'invoice_verify',
      'order-abc-123'
    );
    // INVOICE → invoice_verify → high-risk approve_payment → human_task
    expect(decision.decision).toBe('human_task');
    expect(decision.action.type).toBe('approve_payment');
    expect((decision.action as { orderId: string }).orderId).toBe('order-abc-123');
  });

  it('falls back to empty orderId when none provided (no crash)', () => {
    const decision = evaluateDecision('INVOICE', 0.8, 'x', 'invoice_verify');
    expect((decision.action as { orderId: string }).orderId).toBe('');
  });
});
