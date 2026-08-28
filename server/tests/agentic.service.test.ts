import { evaluateDecision, ruleBasedFallbackForAgent, isHighRiskAction, isLowRiskAction } from '../src/modules/agentic/agentic.service';

describe('agentic.service — decision engine', () => {
  describe('evaluateDecision', () => {
    it('high-risk action (approve_payment từ invoice_verify) luôn trả về human_task', () => {
      const decision = evaluateDecision('INVOICE', 0.95, 'gửi cho bộ phận kế toán', 'invoice_verify');
      expect(decision.decision).toBe('human_task');
      expect(decision.action.type).toBe('approve_payment');
      expect(isHighRiskAction(decision.action)).toBe(true);
    });

    it('confidence < 0.7 → manual_review', () => {
      const decision = evaluateDecision('UNKNOWN', 0.5, 'xác định loại tài liệu', 'manual_review');
      expect(decision.decision).toBe('manual_review');
    });

    it('confidence >= 0.7 + low-risk action → auto', () => {
      const decision = evaluateDecision('PO_NEW', 0.8, 'phê duyệt PO', 'approve_po');
      expect(decision.decision).toBe('auto');
      expect(isLowRiskAction(decision.action)).toBe(true);
      expect(decision.action.type).toBe('create_task');
    });
  });

  describe('ruleBasedFallbackForAgent', () => {
    it('nhận diện PO mới', () => {
      const result = ruleBasedFallbackForAgent('PO số 123 - đặt hàng 100 units');
      expect(result.classification).toBe('PO_NEW');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
      expect(result.llmUsed).toBe(false);
    });

    it('nhận diện hóa đơn', () => {
      const result = ruleBasedFallbackForAgent('Invoice tổng thanh toán 5,000,000 VND VAT 10%');
      expect(result.classification).toBe('INVOICE');
      expect(result.workflowTrigger).toBe('invoice_verify');
    });

    it('nhận diện ASN', () => {
      const result = ruleBasedFallbackForAgent('ASN shipping notice ETA 2026-09-01');
      expect(result.classification).toBe('ASN');
    });

    it('fallback UNKNOWN với confidence thấp cho văn bản không khớp rule', () => {
      const result = ruleBasedFallbackForAgent('Xin chào buổi sáng');
      expect(result.classification).toBe('UNKNOWN');
      expect(result.confidence).toBeLessThan(0.7);
    });
  });
});
