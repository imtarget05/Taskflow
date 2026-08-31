import { useState } from 'react';
import { Plus, Save, Star, Trash2 } from 'lucide-react';
import { Button, Card, Input } from '@/components/ui';
import type { UserSkill } from '@/types';

interface SkillEditorProps {
  skills?: UserSkill[];
  isLoading?: boolean;
  isSaving?: boolean;
  onSave: (skills: { skill: string; level: number }[]) => void;
}

export default function SkillEditor({ skills = [], isLoading, isSaving, onSave }: SkillEditorProps) {
  const [localSkills, setLocalSkills] = useState<{ skill: string; level: number }[]>(
    skills.map((s) => ({ skill: s.skill, level: s.level }))
  );
  const [newSkill, setNewSkill] = useState('');
  const [newLevel, setNewLevel] = useState(3);

  const dirty = JSON.stringify(localSkills) !== JSON.stringify(skills.map((s) => ({ skill: s.skill, level: s.level })));

  function addSkill() {
    const trimmed = newSkill.trim();
    if (!trimmed) return;
    if (localSkills.some((s) => s.skill.toLowerCase() === trimmed.toLowerCase())) return;
    setLocalSkills([...localSkills, { skill: trimmed, level: newLevel }]);
    setNewSkill('');
    setNewLevel(3);
  }

  function removeSkill(index: number) {
    setLocalSkills(localSkills.filter((_, i) => i !== index));
  }

  function updateLevel(index: number, level: number) {
    setLocalSkills(localSkills.map((s, i) => (i === index ? { ...s, level } : s)));
  }

  function handleSave() {
    onSave(localSkills);
  }

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold text-ink">Kỹ năng của bạn</h3>
      <p className="mt-0.5 text-xs text-ink-muted">Thêm kỹ năng để nhận đề xuất phù hợp hơn.</p>

      {isLoading ? (
        <div className="mt-4 space-y-2">
          <div className="h-8 w-full animate-pulse rounded-lg bg-surface-muted" />
          <div className="h-8 w-full animate-pulse rounded-lg bg-surface-muted" />
        </div>
      ) : (
        <>
          <div className="mt-4 space-y-2">
            {localSkills.map((s, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
                <span className="flex-1 truncate text-sm text-ink">{s.skill}</span>
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => updateLevel(i, level)}
                      className="p-0.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                      aria-label={`Đặt cấp ${level}`}
                    >
                      <Star
                        className={`h-3.5 w-3.5 ${
                          level <= s.level ? 'fill-warning text-warning' : 'text-ink-muted'
                        }`}
                        aria-hidden="true"
                      />
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => removeSkill(i)}
                  className="rounded p-1 text-ink-muted transition-colors hover:bg-surface-muted hover:text-danger focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                  aria-label={`Xóa ${s.skill}`}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-end gap-2">
            <Input
              placeholder="Thêm kỹ năng..."
              value={newSkill}
              onChange={(e) => setNewSkill(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addSkill()}
              className="flex-1"
            />
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setNewLevel(level)}
                  className="p-0.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                  aria-label={`Cấp ${level}`}
                >
                  <Star
                    className={`h-4 w-4 ${
                      level <= newLevel ? 'fill-warning text-warning' : 'text-ink-muted'
                    }`}
                    aria-hidden="true"
                  />
                </button>
              ))}
            </div>
            <Button size="sm" variant="secondary" onClick={addSkill} disabled={!newSkill.trim()}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>

          {dirty && (
            <div className="mt-3 flex justify-end">
              <Button size="sm" onClick={handleSave} loading={isSaving}>
                <Save className="h-3.5 w-3.5" aria-hidden="true" />
                Lưu thay đổi
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
