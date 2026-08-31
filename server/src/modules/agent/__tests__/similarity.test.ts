import { cosineSimilarity, dotProduct, l2Norm, tokenize, tokenRelevance } from '../similarity';

describe('cosineSimilarity (accuracy measurement primitive)', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it('returns exactly 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 1], [-1, -1])).toBeCloseTo(-1);
  });

  it('returns 0 (not NaN) when either vector is zero-length', () => {
    expect(cosineSimilarity([], [1, 2])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });

  it('is scale-invariant (normalised)', () => {
    expect(cosineSimilarity([2, 4, 6], [1, 2, 3])).toBeCloseTo(1);
  });

  it('handles different-length vectors over the shortest common width', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0])).toBeCloseTo(1);
  });
});

describe('l2Norm & dotProduct', () => {
  it('computes the L2 norm', () => {
    expect(l2Norm([3, 4])).toBeCloseTo(5);
    expect(l2Norm([])).toBe(0);
  });

  it('computes the dot product over the common prefix', () => {
    expect(dotProduct([1, 2, 3], [4, 5, 6])).toBe(32); // 1*4 + 2*5 + 3*6
    expect(dotProduct([1, 0], [0, 1])).toBe(0);
  });
});

describe('tokenize & tokenRelevance (offline relevance stand-in)', () => {
  it('tokenizes Vietnamese diacritics as single tokens', () => {
    expect(tokenize('Đặt hàng mới')).toEqual(['đặt', 'hàng', 'mới']);
  });

  it('returns 1 for identical text', () => {
    expect(tokenRelevance('tạo task Viết trang chủ', 'tạo task Viết trang chủ')).toBeCloseTo(1);
  });

  it('returns 0 for disjoint text', () => {
    expect(tokenRelevance('mua phở', 'gửi email ngân hàng')).toBe(0);
  });

  it('returns a partial positive score for shared vocabulary', () => {
    const s = tokenRelevance(
      'thêm task Viết bài blog tháng 9',
      'create_task Viết bài blog tháng 9'
    );
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(1);
  });
});