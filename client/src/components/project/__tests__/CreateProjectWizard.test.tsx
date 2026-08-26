import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CreateProjectWizard from '../CreateProjectWizard';

vi.mock('@/lib/api', () => ({
  default: { post: vi.fn().mockResolvedValue({ data: { id: 'p1' } }) },
}));

vi.mock('@/store/auth', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Tester' } }),
}));

function renderWizard(onClose = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <CreateProjectWizard onClose={onClose} />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('CreateProjectWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts on the basics step with Next disabled until a name is typed', async () => {
    const user = userEvent.setup();
    renderWizard();

    expect(screen.getByText(/thông tin cơ bản/i)).toBeInTheDocument();
    const next = screen.getByRole('button', { name: /tiếp tục/i });
    expect(next).toBeDisabled();

    await user.type(screen.getByLabelText(/tên project/i), 'Website launch');
    expect(next).toBeEnabled();
  });

  it('walks through columns and review steps then submits with columnNames', async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.type(screen.getByLabelText(/tên project/i), 'Website launch');
    await user.click(screen.getByRole('button', { name: /tiếp tục/i }));

    // Columns step: default names prefilled; edit the first one.
    expect(screen.getByText(/cột mặc định/i)).toBeInTheDocument();
    const firstColumn = screen.getAllByLabelText(/tên cột/i)[0];
    expect(firstColumn).toHaveValue('To Do');
    await user.clear(firstColumn);
    await user.type(firstColumn, 'Backlog');
    await user.click(screen.getByRole('button', { name: /tiếp tục/i }));

    // Members step → skip to review.
    expect(screen.getAllByText(/mời thành viên/i).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: /tiếp tục/i }));

    // Review step shows the summary.
    expect(screen.getAllByText(/xác nhận/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Website launch')).toBeInTheDocument();
    expect(screen.getByText('Backlog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /tạo project/i }));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const api = (await import('@/lib/api')).default;
    expect(api.post).toHaveBeenCalledWith(
      '/projects',
      expect.objectContaining({ name: 'Website launch' })
    );
    const payload = vi.mocked((await import('@/lib/api')).default.post).mock.calls[0][1] as {
      columnNames?: string[];
    };
    expect(payload.columnNames).toEqual(['Backlog', 'In Progress', 'Done']);
  });

  it('can go back without losing entered data', async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.type(screen.getByLabelText(/tên project/i), 'My board');
    await user.click(screen.getByRole('button', { name: /tiếp tục/i }));
    await user.click(screen.getByRole('button', { name: /quay lại/i }));

    expect(screen.getByLabelText(/tên project/i)).toHaveValue('My board');
  });
});
