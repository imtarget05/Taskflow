import {
  evaluateDecision,
  isHighRiskAction,
  isLowRiskAction,
  ruleBasedFallbackForAgent,
} from '../agentic.service';

describe('agentic decision engine — evaluateDecision (Multi-Agent orchestrator)', () => {
  describe('high-risk guardrails ALWAYS require a human task', () => {
    it.each([
      ['invoice_verify → approve_payment', 'INVOICE', 0.99, 'invoice_verify'],
      ['invoice_verify → approve_payment even at low confidence', 'INVOICE', 0.1, 'invoice_verify'],
    ])('%s', (_name, classification, confidence, trigger) => {
      const d = evaluateDecision(classification, confidence, 'gửi cho bộ phận kế toán', trigger, 'order-1');
      expect(d.decision).toBe('human_task');
      expect(d.action.type).toBe('approve_payment');
      expect((d.action as { orderId: string }).orderId).toBe('order-1');
    });
  });

  describe('low-risk actions auto-run only at high confidence', () => {
    it.each([
      ['approve_po → create_task', 'PO_NEW', 0.9, 'approve_po', 'Phê duyệt PO: ', 'phê duyệt PO'],
      ['update_po → create_task', 'PO_UPDATE', 0.85, 'update_po', 'Xác nhận điều chỉnh PO: ', 'xác nhận điều chỉnh PO'],
      ['asn_check → create_task', 'ASN', 0.8, 'asn_check', 'Kiểm tra hàng nhập (ASN): ', 'kiểm tra hàng nhập'],
      ['default trigger → create_task', 'UNKNOWN', 0.9, 'manual_review', 'Xử lý: ', 'xử lý'],
    ])('%s → auto', (_name, classification, confidence, trigger, titlePrefix, suggested) => {
      const d = evaluateDecision(classification, confidence, suggested, trigger);
      expect(d.decision).toBe('auto');
      expect(d.action.type).toBe('create_task');
      expect((d.action as { taskTitle: string }).taskTitle).toContain(titlePrefix);
    });
  });

  describe('low confidence (< 0.7) maps a low-risk suggestion to manual_review', () => {
    it('goes to manual_review', () => {
      const d = evaluateDecision('PO_NEW', 0.3, 'phê duyệt PO', 'approve_po');
      expect(d.decision).toBe('manual_review');
      expect(d.action.type).toBe('manual_review');
    });
  });

  describe('confidence boundary at 0.70', () => {
    it('0.69 → manual_review, 0.70 → auto', () => {
      const below = evaluateDecision('PO_NEW', 0.69, 'phê duyệt PO', 'approve_po');
      expect(below.decision).toBe('manual_review');

      const at = evaluateDecision('PO_NEW', 0.7, 'phê duyệt PO', 'approve_po');
      expect(at.decision).toBe('auto');
    });
  });

  describe('risk classifiers', () => {
    it('flags approve_payment / update_quantity / ship_order as high-risk', () => {
      expect(isHighRiskAction({ type: 'approve_payment', orderId: 'o1' })).toBe(true);
      expect(isHighRiskAction({ type: 'update_quantity', orderId: 'o1', newQuantity: 5 })).toBe(true);
      expect(isHighRiskAction({ type: 'ship_order', orderId: 'o1' })).toBe(true);
    });

    it('create_task / move_task / notify are low-risk', () => {
      expect(isLowRiskAction({ type: 'create_task', taskTitle: 'x' })).toBe(true);
      expect(isLowRiskAction({ type: 'move_task', taskId: 't', targetColumnId: 'c' })).toBe(true);
      expect(isLowRiskAction({ type: 'notify', message: 'm' })).toBe(true);
    });

    it('manual_review is neither high- nor low-risk', () => {
      expect(isHighRiskAction({ type: 'manual_review', reason: 'r' })).toBe(false);
      expect(isLowRiskAction({ type: 'manual_review', reason: 'r' })).toBe(false);
    });
  });
});

describe('agentic rule-based fallback (tiếng Việt, no LLM)', () => {
  it('detects PO_NEW from "đặt hàng"', () => {
    const r = ruleBasedFallbackForAgent('Đặt hàng 1000 linh kiện cho nhà cung cấp A');
    expect(r.classification).toBe('PO_NEW');
    expect(r.workflowTrigger).toBe('approve_po');
    expect(r.llmUsed).toBe(false);
    expect(r.confidence).toBe(0.8);
  });

  it('detects INVOICE from "hóa đơn"', () => {
    const r = ruleBasedFallbackForAgent('Hóa đơn số INV-123 cần thanh toán');
    expect(r.classification).toBe('INVOICE');
    expect(r.workflowTrigger).toBe('invoice_verify');
  });

  it('detects ASN from "asn" shipment notice', () => {
    const r = ruleBasedFallbackForAgent('ASN-9 đang giao hàng');
    expect(r.classification).toBe('ASN');
    expect(r.workflowTrigger).toBe('asn_check');
  });

  it('falls back to UNKNOWN + manual_review when nothing matches', () => {
    const r = ruleBasedFallbackForAgent('Xin chào');
    expect(r.classification).toBe('UNKNOWN');
    expect(r.workflowTrigger).toBe('manual_review');
    expect(r.confidence).toBe(0.5);
  });
});