import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AiInsightPanel from '../AiInsightPanel';

vi.mock('@/lib/api', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn().mockResolvedValue({ data: { data: [] } }),
  },
}));

import api from '@/lib/api';

const mockedPost = vi.mocked(api.post);

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const ANALYSE_RESPONSE = {
  data: {
    data: {
      id: 'a1',
      category: 'đăng nhập / tài khoản',
      categoryConfidence: 0.92,
      priority: 'URGENT',
      priorityConfidence: 0.88,
      sentiment: 'negative',
      urgency: true,
      language: 'vi',
      keywords: ['mật khẩu', 'OTP'],
      textLength: 120,
      duplicateOf: null,
      duplicateScore: null,
      createdAt: new Date().toISOString(),
    },
  },
};

describe('AiInsightPanel', () => {
  beforeEach(() => {
    mockedPost.mockReset();
  });

  it('renders the analyse button', () => {
    renderWithProviders(
      <AiInsightPanel projectId="p1" taskId="t1" text="Không đăng nhập được" />
    );
    expect(screen.getByRole('button', { name: /phân tích ai/i })).toBeInTheDocument();
  });

  it('shows classification results after analysing', async () => {
    const user = userEvent.setup();
    mockedPost.mockResolvedValueOnce(ANALYSE_RESPONSE);

    renderWithProviders(
      <AiInsightPanel projectId="p1" taskId="t1" text="Không đăng nhập được" />
    );
    await user.click(screen.getByRole('button', { name: /phân tích ai/i }));

    await waitFor(() => {
      expect(screen.getByText('đăng nhập / tài khoản')).toBeInTheDocument();
    });
    // Priority suggestion is rendered as a badge.
    expect(screen.getByText('URGENT')).toBeInTheDocument();
    // Keywords are listed.
    expect(screen.getByText('mật khẩu')).toBeInTheDocument();
    // The API received the task context.
    expect(mockedPost).toHaveBeenCalledWith('/nlp/analyse', expect.objectContaining({
      projectId: 'p1',
      taskId: 't1',
    }));
  });

  it('applies the suggested priority via onApplyPriority', async () => {
    const user = userEvent.setup();
    const onApplyPriority = vi.fn();
    mockedPost.mockResolvedValueOnce(ANALYSE_RESPONSE);

    renderWithProviders(
      <AiInsightPanel
        projectId="p1"
        taskId="t1"
        text="Không đăng nhập được"
        onApplyPriority={onApplyPriority}
      />
    );
    await user.click(screen.getByRole('button', { name: /phân tích ai/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /áp dụng ưu tiên/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /áp dụng ưu tiên/i }));
    expect(onApplyPriority).toHaveBeenCalledWith('URGENT');
  });

  it('shows an error message when analysis fails', async () => {
    const user = userEvent.setup();
    mockedPost.mockRejectedValueOnce(new Error('LLM down'));

    renderWithProviders(
      <AiInsightPanel projectId="p1" taskId="t1" text="text" />
    );
    await user.click(screen.getByRole('button', { name: /phân tích ai/i }));

    await waitFor(() => {
      expect(screen.getByText(/không phân tích được/i)).toBeInTheDocument();
    });
  });
});
