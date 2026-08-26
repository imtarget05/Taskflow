import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import NlpStatsPanel from '../NlpStatsPanel';

const stats = {
  byCategory: [
    { category: 'kỹ thuật / lỗi hệ thống', total: 3, applied: 2, ignored: 1, applyRate: 0.667 },
    { category: 'thanh toán / hoàn tiền', total: 1, applied: 1, ignored: 0, applyRate: 1 },
  ],
  confidenceBuckets: [
    { bucket: 'low(<0.5)', count: 1 },
    { bucket: '0.5-0.7', count: 0 },
    { bucket: '0.7-0.85', count: 2 },
    { bucket: '0.85-0.95', count: 0 },
    { bucket: 'high(>=0.95)', count: 1 },
  ],
  totalFeedback: 4,
  overallApplyRate: 0.75,
};

vi.mock('@/hooks/useNlp', () => ({
  useNlpStats: vi.fn(),
}));

import { useNlpStats } from '@/hooks/useNlp';

describe('NlpStatsPanel', () => {
  it('shows empty state when there is no feedback yet', () => {
    (useNlpStats as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { byCategory: [], confidenceBuckets: [], totalFeedback: 0, overallApplyRate: 0 },
      isLoading: false,
      isError: false,
    });
    render(<NlpStatsPanel />);
    expect(screen.getByText(/Chưa có dữ liệu/)).toBeInTheDocument();
  });

  it('renders overall apply rate and per-category bars', () => {
    (useNlpStats as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ data: stats, isLoading: false, isError: false });
    render(<NlpStatsPanel />);
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('kỹ thuật / lỗi hệ thống')).toBeInTheDocument();
    expect(screen.getByText('thanh toán / hoàn tiền')).toBeInTheDocument();
    // confidence buckets render as "bucket: count" labels
    expect(screen.getByText('low(<0.5): 1')).toBeInTheDocument();
    expect(screen.getByText('high(>=0.95): 1')).toBeInTheDocument();
  });
});
