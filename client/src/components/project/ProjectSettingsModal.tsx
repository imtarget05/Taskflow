import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Project } from '@/types';
import { useDeleteProject, useUpdateProject } from '@/hooks/useProjects';
import { useToast } from '@/store/toast';
import { Button, ColorPicker, PRESET_COLORS, ConfirmDialog, Input, Modal, Textarea } from '@/components/ui';

interface ProjectSettingsModalProps {
  project: Project;
  canDelete: boolean;
  onClose: () => void;
}

export default function ProjectSettingsModal({ project, canDelete, onClose }: ProjectSettingsModalProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const updateProject = useUpdateProject(project.id);
  const deleteProject = useDeleteProject();

  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [color, setColor] = useState(project.color ?? PRESET_COLORS[0]);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Project name is required.');
      return;
    }
    try {
      await updateProject.mutateAsync({
        name: name.trim(),
        description: description.trim() || null,
        color,
      });
      toast('success', 'Project updated');
      onClose();
    } catch {
      setError('Unable to save project settings.');
    }
  }

  async function handleDelete() {
    try {
      await deleteProject.mutateAsync(project.id);
      toast('success', 'Project deleted');
      navigate('/dashboard');
    } catch {
      toast('error', 'Unable to delete project');
    }
  }

  return (
    <>
      <Modal open onClose={onClose} title="Project settings" size="sm">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="rounded-xl border border-line bg-surface-2 p-4">
            <div className="flex items-center gap-3">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
                style={{ backgroundColor: color }}
                aria-hidden="true"
              >
                {name.trim().charAt(0).toUpperCase() || 'P'}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold" style={{ color }}>
                  {name.trim() || 'Project name'}
                </p>
                <p className="text-xs text-ink-muted">Live preview</p>
              </div>
            </div>
          </div>
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
            autoFocus
          />
          <Textarea
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this project about?"
            rows={3}
          />
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-ink">Color</legend>
            <ColorPicker value={color} onChange={setColor} ariaLabel="Project color" />
          </fieldset>

          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={updateProject.isPending}>
              Save changes
            </Button>
          </div>
        </form>

        {canDelete && (
          <div className="mt-6 border-t border-line pt-4">
            <h3 className="text-sm font-semibold text-danger">Danger zone</h3>
            <p className="mt-1 text-xs text-ink-muted">
              Deleting this project removes all columns, tasks, comments and activity. This cannot be undone.
            </p>
            <Button
              variant="danger"
              size="sm"
              className="mt-3"
              onClick={() => setConfirmDelete(true)}
              loading={deleteProject.isPending}
            >
              Delete project
            </Button>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void handleDelete()}
        title={`Delete "${project.name}"?`}
        message="All columns, tasks, comments and activity will be permanently deleted. This cannot be undone."
        confirmLabel="Delete project"
        loading={deleteProject.isPending}
      />
    </>
  );
}