import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { useCreateProject } from '@/hooks/useProjects';
import { useAuth } from '@/store/auth';
import { Button, Input, Modal, Textarea } from '@/components/ui';

interface CreateProjectWizardProps {
  onClose: () => void;
}

const DEFAULT_COLUMNS = ['To Do', 'In Progress', 'Done'];
const STEPS = ['Thông tin cơ bản', 'Cột mặc định', 'Mời thành viên', 'Xác nhận'] as const;

/**
 * Four-step project creation wizard: basics → default columns → members
 * (invite-by-email lives in the board's Members dialog; this step explains it
 * and offers to open the board) → review. State is kept per step so Back
 * never loses entered data.
 */
export default function CreateProjectWizard({ onClose }: CreateProjectWizardProps) {
  const navigate = useNavigate();
  const createProject = useCreateProject();
  const { user } = useAuth();

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [columns, setColumns] = useState<string[]>([...DEFAULT_COLUMNS]);
  const [submitError, setSubmitError] = useState('');

  function updateColumn(i: number, value: string) {
    setColumns((cols) => cols.map((c, idx) => (idx === i ? value : c)));
  }

  function addColumn() {
    setColumns((cols) => (cols.length < 8 ? [...cols, ''] : cols));
  }

  function removeColumn(i: number) {
    setColumns((cols) => (cols.length > 1 ? cols.filter((_, idx) => idx !== i) : cols));
  }

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    setSubmitError('');
    if (!name.trim()) return;
    try {
      const created = await createProject.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        columnNames: columns.map((c) => c.trim()).filter(Boolean),
      });
      onClose();
      if (created?.id) navigate(`/projects/${created.id}`);
    } catch {
      setSubmitError('Không tạo được project. Vui lòng thử lại.');
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Tạo project mới"
      footer={
        <>
          {step > 0 && (
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)} aria-label="Quay lại">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Quay lại
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
          {step < 3 ? (
            <Button
              onClick={() => setStep((s) => s + 1)}
              disabled={step === 0 && !name.trim()}
              aria-label="Tiếp tục"
            >
              Tiếp tục
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button
              onClick={() => void handleSubmit()}
              disabled={!name.trim()}
              loading={createProject.isPending}
              aria-label="Tạo project"
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              Tạo project
            </Button>
          )}
        </>
      }
    >
      {/* Step indicator */}
      <ol className="mb-5 flex items-center gap-2 text-[11px] font-medium">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full ${
                i <= step ? 'bg-accent text-white' : 'bg-surface-2 text-ink-muted'
              }`}
              aria-current={i === step ? 'step' : undefined}
            >
              {i + 1}
            </span>
            <span className={i === step ? 'text-ink' : 'text-ink-muted'}>{label}</span>
            {i < STEPS.length - 1 && <span className="text-ink-muted">·</span>}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
          <Input
            label="Tên project"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ví dụ: Website launch"
            autoFocus
            required
          />
          <Textarea
            label="Mô tả"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Project này về điều gì? (không bắt buộc)"
            rows={3}
          />
        </form>
      )}

      {step === 1 && (
        <div className="space-y-3">
          <p className="text-sm text-ink-secondary">
            Đặt tên các cột kanban cho board của bạn (tối đa 8 cột).
          </p>
          {columns.map((col, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                label={`Tên cột ${i + 1}`}
                value={col}
                onChange={(e) => updateColumn(i, e.target.value)}
                placeholder={`Cột ${i + 1}`}
                aria-label={`Tên cột ${i + 1}`}
                className="flex-1"
              />
              {columns.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeColumn(i)}
                  aria-label={`Xoá cột ${i + 1}`}
                  className="mt-4 text-ink-muted hover:text-danger"
                >
                  Xoá
                </Button>
              )}
            </div>
          ))}
          {columns.length < 8 && (
            <Button variant="secondary" size="sm" onClick={addColumn}>
              Thêm cột
            </Button>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <p className="text-sm text-ink-secondary">Mời thành viên cùng làm việc trên board.</p>
          <div className="flex items-start gap-3 rounded-lg border border-line bg-surface-2 p-3">
            <Users className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
            <div className="min-w-0 text-xs text-ink-secondary">
              <p className="font-medium text-ink">{user?.name ?? 'Bạn'} sẽ là Owner</p>
              <p className="mt-1">
                Sau khi tạo project, mở board → <strong>Members</strong> để mời đồng đội bằng email.
              </p>
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Xác nhận</p>
          <div className="rounded-lg border border-line p-3">
            <p className="font-semibold text-ink">{name || '—'}</p>
            {description.trim() && <p className="mt-1 text-xs text-ink-secondary">{description}</p>}
          </div>
          <div className="rounded-lg border border-line p-3">
            <p className="text-xs font-medium text-ink-secondary">Các cột sẽ được tạo:</p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {columns
                .map((c) => c.trim())
                .filter(Boolean)
                .map((c) => (
                  <li
                    key={c}
                    className="rounded-md bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent-ink"
                  >
                    {c}
                  </li>
                ))}
            </ul>
          </div>
          {submitError && (
            <p role="alert" className="text-xs text-danger">
              {submitError}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
