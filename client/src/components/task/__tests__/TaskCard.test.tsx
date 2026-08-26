import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TaskCard from '../TaskCard';
import type { Task } from '@/types';

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn(),
  },
}));

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}));

const TASK: Task = {
  id: 't1',
  projectId: 'p1',
  columnId: 'c1',
  title: 'Viết báo cáo',
  description: null,
  dueDate: null,
  priority: 'MEDIUM',
  completed: false,
  comments: [],
  assignments: [],
  position: 0,
  createdById: 'u1',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function renderCard(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        {ui}
      </QueryClientProvider>
    </MemoryRouter>
  );
}

/** The inline editor input (exact label, so the pencil button never matches). */
function editorInput() {
  return screen.queryByRole('textbox', { name: 'Tiêu đề task' });
}

describe('TaskCard inline edit', () => {
  it('opens the editor via the pencil button and saves on Enter', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const api = (await import('@/lib/api')).default;
    renderCard(<TaskCard task={TASK} onClick={onClick} />);

    await user.click(screen.getByRole('button', { name: /sửa tiêu đề task/i }));
    const input = editorInput();
    expect(input).toBeInTheDocument();

    await user.clear(input!);
    await user.type(input!, 'Viết báo cáo quý 3');
    await user.keyboard('{Enter}');

    // The inline editor closes and the rename is persisted via PATCH.
    await waitFor(() => {
      expect(editorInput()).not.toBeInTheDocument();
    });
    expect(api.patch).toHaveBeenCalledWith(
      '/projects/p1/tasks/t1',
      expect.objectContaining({ title: 'Viết báo cáo quý 3' })
    );
    // Editing must not open the detail drawer.
    expect(onClick).not.toHaveBeenCalled();
  });

  it('keeps the old title when Escape is pressed', async () => {
    const user = userEvent.setup();
    renderCard(<TaskCard task={TASK} onClick={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /sửa tiêu đề task/i }));
    const input = editorInput();
    await user.clear(input!);
    await user.type(input!, 'Nháp');
    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(editorInput()).not.toBeInTheDocument();
    });
    expect(screen.getByText('Viết báo cáo')).toBeInTheDocument();
  });
});
