import { FolderKanban, KanbanSquare, Users } from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import { dismissOnboarding } from '@/lib/onboarding';

interface OnboardingModalProps {
  open: boolean;
  onClose: () => void;
  /** Opens the "New project" flow the CTA points at. */
  onCreateProject: () => void;
}

const STEPS: { icon: React.ReactNode; title: string; body: string }[] = [
  {
    icon: <FolderKanban className="h-5 w-5 text-accent" aria-hidden="true" />,
    title: 'Tạo project đầu tiên',
    body: 'Mỗi project là một board kanban — nơi chứa các cột và công việc của bạn.',
  },
  {
    icon: <Users className="h-5 w-5 text-accent" aria-hidden="true" />,
    title: 'Mời thành viên',
    body: 'Thêm đồng đội vào board để cùng theo dõi, bình luận và cập nhật task realtime.',
  },
  {
    icon: <KanbanSquare className="h-5 w-5 text-accent" aria-hidden="true" />,
    title: 'Kéo thẻ trên kanban',
    body: 'Kéo task giữa các cột để đổi trạng thái, mở task để mô tả, hạn chót và ưu tiên.',
  },
];

/**
 * First-run onboarding for brand-new users: three short cards explaining
 * project → members → kanban, with a direct "create project" CTA. Dismissal is
 * persisted via lib/onboarding so returning users never see it again.
 */
export default function OnboardingModal({ open, onClose, onCreateProject }: OnboardingModalProps) {
  function dismiss() {
    dismissOnboarding();
    onClose();
  }

  function handleCreate() {
    dismiss();
    onCreateProject();
  }

  return (
    <Modal
      open={open}
      onClose={dismiss}
      title="Chào mừng đến TaskFlow"
      footer={
        <>
          <Button variant="ghost" onClick={dismiss} aria-label="Bỏ qua">
            Bỏ qua
          </Button>
          <Button onClick={handleCreate} aria-label="Tạo project đầu tiên">
            Tạo project đầu tiên
          </Button>
        </>
      }
    >
      <ol className="space-y-4">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft">
              {step.icon}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">
                {i + 1}. {step.title}
              </p>
              <p className="mt-0.5 text-xs text-ink-secondary">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </Modal>
  );
}
