import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/Toast';
import TaskDetail from '../TaskDetail';

const getMock = vi.fn();
vi.mock('@/lib/api', () => ({
  default: {
    get: (...args: unknown[]) => getMock(...args),
    post: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

function apiData(data: unknown) {
  return Promise.resolve({ data: { data } });
}

const TASK = {
  id: 't1',
  title: 'Viết báo cáo',
  description: 'Nội dung mô tả',
  dueDate: null,
  priority: 'MEDIUM',
  assignments: [],
  comments: [
    { id: 'cm1', body: 'Đã xem nhé', createdAt: new Date().toISOString(), author: { id: 'u2', name: 'Long' } },
  ],
  createdBy: { id: 'u1', name: 'Tan' },
  createdAt: new Date().toISOString(),
  columnId: 'c1',
};

beforeEachMock();

function beforeEachMock() {
  beforeEachSetup();
}

function beforeEachSetup() {
  vi.clearAllMocks();
}

function renderDetail() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <TaskDetail
            projectId="p1"
            taskId="t1"
            members={[]}
            onClose={vi.fn()}
            userRole="OWNER"
            currentUserId="u1"
          />
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('TaskDetail tabs', () => {
  it('renders three tabs and shows the detail pane by default', async () => {
    getMock.mockImplementation((url: string) => {
      if (url.includes('/tasks/')) return apiData(TASK);
      if (url.endsWith('/activities')) return apiData([]);
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    renderDetail();

    await waitFor(() => {
      expect(screen.getByText('Nội dung mô tả')).toBeInTheDocument();
    });
    expect(screen.getByRole('tab', { name: /chi tiết/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /bình luận/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /hoạt động/i })).toBeInTheDocument();
  });

  it('shows the comments pane when its tab is selected', async () => {
    const user = userEvent.setup();
    getMock.mockImplementation((url: string) => {
      if (url.includes('/tasks/')) return apiData(TASK);
      if (url.endsWith('/activities')) return apiData([]);
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    renderDetail();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /bình luận/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: /bình luận/i }));
    expect(await screen.findByText('Đã xem nhé')).toBeInTheDocument();
    expect(screen.getByLabelText(/viết bình luận|comment body/i)).toBeInTheDocument();
    // Description lives in the detail tab only.
    expect(screen.queryByText('Nội dung mô tả')).not.toBeInTheDocument();
  });

  it('shows this task\'s activities in the activity tab', async () => {
    const user = userEvent.setup();
    getMock.mockImplementation((url: string) => {
      if (url.includes('/tasks/')) return apiData(TASK);
      if (url.endsWith('/activities')) {
        return apiData([
          {
            id: 'a1',
            action: 'TASK_UPDATED',
            metadata: { title: 'Viết báo cáo' },
            createdAt: new Date().toISOString(),
            user: { id: 'u2', name: 'Long' },
            taskId: 't1',
          },
          {
            id: 'a2',
            action: 'TASK_CREATED',
            metadata: { title: 'Task khác' },
            createdAt: new Date().toISOString(),
            user: { id: 'u2', name: 'Long' },
            taskId: 'other-task',
          },
        ]);
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    renderDetail();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /hoạt động/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: /hoạt động/i }));
    // Only THIS task's activities are shown.
    expect(await screen.findByText(/task updated/i)).toBeInTheDocument();
    expect(screen.queryByText(/task created/i)).not.toBeInTheDocument();
  });
});
