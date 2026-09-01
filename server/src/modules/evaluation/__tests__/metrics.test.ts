import {
  computeFaithfulness,
  computeAnswerRelevancy,
  computeContextRecall,
  computeContextPrecision,
  computeRagasMetrics,
  clampMetric,
  tokenize,
} from '../metrics';

describe('Ragas-like evaluation metrics', () => {
  // ------------------------------------------------------------------
  // Faithfulness
  // ------------------------------------------------------------------
  describe('computeFaithfulness', () => {
    it('returns 1.0 when answer is fully supported by context', () => {
      const answer = 'Điều 15 quy định về hợp đồng lao động';
      const context = ['Điều 15 quy định về hợp đồng lao động và trách nhiệm'];
      expect(computeFaithfulness(answer, context)).toBe(1.0);
    });

    it('returns lower score when answer contains hallucinated tokens', () => {
      const answer = 'Điều 99 quy định về cryptocurrency';
      const context = ['Điều 15 quy định về hợp đồng lao động'];
      const score = computeFaithfulness(answer, context);
      expect(score).toBeLessThan(0.7);
      expect(score).toBeGreaterThan(0);
    });

    it('returns 1.0 for empty answer (nothing to verify)', () => {
      expect(computeFaithfulness('', ['some context'])).toBe(1.0);
    });

    it('returns 0 when no answer tokens appear in context', () => {
      const answer = 'xyz abc';
      const context = ['def ghi jkl'];
      expect(computeFaithfulness(answer, context)).toBe(0);
    });
  });

  // ------------------------------------------------------------------
  // Answer relevancy
  // ------------------------------------------------------------------
  describe('computeAnswerRelevancy', () => {
    it('returns high score when answer is relevant to question', () => {
      const question = 'thời hạn hợp đồng lao động là bao lâu';
      const answer = 'thời hạn hợp đồng lao động tối đa 36 tháng';
      const score = computeAnswerRelevancy(answer, question);
      expect(score).toBeGreaterThan(0.5);
    });

    it('returns low score when answer is off-topic', () => {
      const question = 'thời hạn hợp đồng lao động';
      const answer = 'thủ tục đăng ký kết hôn theo pháp luật';
      const score = computeAnswerRelevancy(answer, question);
      expect(score).toBeLessThan(0.3);
    });

    it('returns 0 for empty answer', () => {
      expect(computeAnswerRelevancy('', 'some question')).toBe(0);
    });
  });

  // ------------------------------------------------------------------
  // Context recall
  // ------------------------------------------------------------------
  describe('computeContextRecall', () => {
    it('returns 1.0 when all question tokens are in context', () => {
      const question = 'Điều 15 hợp đồng lao động';
      const context = ['Điều 15 quy định chi tiết về hợp đồng lao động'];
      expect(computeContextRecall(question, context)).toBe(1.0);
    });

    it('returns lower score when context misses question tokens', () => {
      const question = 'Điều 15 hợp đồng lao động thời hạn';
      const context = ['Điều 15 quy định chung'];
      const score = computeContextRecall(question, context);
      expect(score).toBeLessThan(1.0);
      expect(score).toBeGreaterThan(0);
    });

    it('returns 1.0 for empty question', () => {
      expect(computeContextRecall('', ['context'])).toBe(1.0);
    });
  });

  // ------------------------------------------------------------------
  // Context precision
  // ------------------------------------------------------------------
  describe('computeContextPrecision', () => {
    it('returns 1.0 when all context tokens are question-relevant', () => {
      const context = ['hợp đồng lao động'];
      const question = 'hợp đồng lao động Điều 15';
      expect(computeContextPrecision(context, question)).toBe(1.0);
    });

    it('returns lower score when context contains irrelevant tokens', () => {
      const context = ['hợp đồng lao động và thủ tục đăng ký doanh nghiệp'];
      const question = 'hợp đồng lao động';
      const score = computeContextPrecision(context, question);
      expect(score).toBeLessThan(1.0);
      expect(score).toBeGreaterThan(0);
    });

    it('returns 0 for empty context', () => {
      expect(computeContextPrecision([], 'question')).toBe(0);
    });
  });

  // ------------------------------------------------------------------
  // Combined metrics
  // ------------------------------------------------------------------
  describe('computeRagasMetrics', () => {
    it('returns all four metrics in [0, 1]', () => {
      const metrics = computeRagasMetrics(
        'thời hạn hợp đồng lao động',
        'thời hạn tối đa 36 tháng theo Điều 15',
        ['Điều 15 quy định thời hạn hợp đồng lao động tối đa 36 tháng'],
      );
      for (const [_key, value] of Object.entries(metrics)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    });
  });

  // ------------------------------------------------------------------
  // Edge cases
  // ------------------------------------------------------------------
  describe('edge cases', () => {
    it('handles special characters gracefully', () => {
      expect(() => computeFaithfulness('!@#$%^&*()', ['context'])).not.toThrow();
      expect(() => computeAnswerRelevancy('answer', '???!!!')).not.toThrow();
    });

    it('handles Vietnamese diacritics correctly', () => {
      const tokens = tokenize('Điều 15 hợp đồng lao động');
      expect(tokens).toContain('điều');
      expect(tokens).toContain('hợp');
      expect(tokens).toContain('đồng');
    });

    it('clampMetric guards against NaN and out-of-range', () => {
      expect(clampMetric(NaN)).toBe(0);
      expect(clampMetric(-0.5)).toBe(0);
      expect(clampMetric(1.5)).toBe(1);
      expect(clampMetric(0.5)).toBe(0.5);
    });
  });
});
