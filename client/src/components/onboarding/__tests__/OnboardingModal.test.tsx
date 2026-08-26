import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OnboardingModal from '../OnboardingModal';

describe('OnboardingModal', () => {
  beforeEach(() => {
    window.localStorage.removeItem('taskflow-onboarding-dismissed');
  });

  it('renders three onboarding steps', () => {
    render(<OnboardingModal open onClose={vi.fn()} onCreateProject={vi.fn()} />);
    expect(screen.getByText(/chào mừng đến taskflow/i)).toBeInTheDocument();
    // Step 1 and the CTA share the same wording — both must be present.
    expect(screen.getAllByText(/tạo project đầu tiên/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/mời thành viên/i)).toBeInTheDocument();
    expect(screen.getByText(/kéo thẻ trên kanban/i)).toBeInTheDocument();
  });

  it('calls onCreateProject from the primary CTA', async () => {
    const user = userEvent.setup();
    const onCreateProject = vi.fn();
    render(<OnboardingModal open onClose={vi.fn()} onCreateProject={onCreateProject} />);

    await user.click(screen.getByRole('button', { name: /tạo project đầu tiên/i }));
    expect(onCreateProject).toHaveBeenCalledTimes(1);
  });

  it('persists dismissal so it never shows again for this browser', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<OnboardingModal open onClose={onClose} onCreateProject={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /bỏ qua/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem('taskflow-onboarding-dismissed')).toBe('1');
  });
});
