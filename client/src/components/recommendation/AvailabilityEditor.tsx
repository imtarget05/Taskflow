import { useState } from 'react';
import { Save } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import type { UserAvailability } from '@/types';

interface AvailabilityEditorProps {
  availability?: UserAvailability[];
  isLoading?: boolean;
  isSaving?: boolean;
  onSave: (availability: { dayOfWeek: number; morning: boolean; afternoon: boolean; evening: boolean }[]) => void;
}

const DAYS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
const SLOTS: { key: 'morning' | 'afternoon' | 'evening'; label: string }[] = [
  { key: 'morning', label: 'Sáng' },
  { key: 'afternoon', label: 'Chiều' },
  { key: 'evening', label: 'Tối' },
];

function buildDefault(): { dayOfWeek: number; morning: boolean; afternoon: boolean; evening: boolean }[] {
  return DAYS.map((_, i) => ({ dayOfWeek: i, morning: false, afternoon: false, evening: false }));
}

export default function AvailabilityEditor({
  availability = [],
  isLoading,
  isSaving,
  onSave,
}: AvailabilityEditorProps) {
  const [local, setLocal] = useState(() => {
    if (availability.length === 7) return availability;
    const def = buildDefault();
    availability.forEach((a) => {
      const idx = def.findIndex((d) => d.dayOfWeek === a.dayOfWeek);
      if (idx >= 0) def[idx] = a;
    });
    return def;
  });

  const dirty = JSON.stringify(local) !== JSON.stringify(availability);

  function toggle(dayIndex: number, slot: 'morning' | 'afternoon' | 'evening') {
    setLocal(
      local.map((d, i) => (i === dayIndex ? { ...d, [slot]: !d[slot] } : d))
    );
  }

  function handleSave() {
    onSave(local);
  }

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold text-ink">Lịch rảnh hàng tuần</h3>
      <p className="mt-0.5 text-xs text-ink-muted">Chọn khung giờ bạn có thể làm việc.</p>

      {isLoading ? (
        <div className="mt-4 space-y-2">
          {DAYS.map((_, i) => (
            <div key={i} className="h-10 w-full animate-pulse rounded-lg bg-surface-muted" />
          ))}
        </div>
      ) : (
        <>
          <div className="mt-4 space-y-2">
            {DAYS.map((day, i) => {
              const entry = local.find((d) => d.dayOfWeek === i) ?? {
                dayOfWeek: i,
                morning: false,
                afternoon: false,
                evening: false,
              };
              return (
                <div key={i} className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2">
                  <span className="w-16 shrink-0 text-sm font-medium text-ink">{day}</span>
                  <div className="flex flex-1 gap-2">
                    {SLOTS.map(({ key, label }) => (
                      <label
                        key={key}
                        className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors ${
                          entry[key]
                            ? 'border-accent bg-accent-soft text-accent-ink'
                            : 'border-line text-ink-secondary hover:bg-surface-muted'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={entry[key]}
                          onChange={() => toggle(i, key)}
                          className="sr-only"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {dirty && (
            <div className="mt-3 flex justify-end">
              <Button size="sm" onClick={handleSave} loading={isSaving}>
                <Save className="h-3.5 w-3.5" aria-hidden="true" />
                Lưu lịch
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
