import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Project } from '@/types';
import { useDeleteProject, useUpdateProject } from '@/hooks/useProjects';
import { Button, ConfirmDialog, Input, Modal, Textarea, useToast } from '@/components/ui';

const COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b'];

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
  const [color, setColor] = useState(project.color ?? COLORS[0]);
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
      navigate('/');
    } catch {
      toast('error', 'Unable to delete project');
    }
  }

  return (
    <>
      <Modal open onClose={onClose} title="Project settings" size="sm">
        <form onSubmit={handleSave} className="space-y-4">
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
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Project color">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  aria-label={`Color ${c}`}
                  onClick={() => setColor(c)}
                  className={`h-8 w-8 rounded-full transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                    color === c ? 'scale-110 ring-2 ring-accent ring-offset-2 ring-offset-surface' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
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