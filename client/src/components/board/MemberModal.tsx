import { useState } from 'react';
import axios from 'axios';
import { Mail, Trash2, UserPlus } from 'lucide-react';
import type { ProjectMember, Role } from '@/types';
import { useAddMember, useRemoveMember } from '@/hooks/useProjects';
import { Avatar, Button, ConfirmDialog, Input, Modal, useToast } from '@/components/ui';

interface MemberModalProps {
  projectId: string;
  role: Role;
  members: ProjectMember[];
  ownerId: string;
  onClose: () => void;
}

export default function MemberModal({ projectId, role, members, ownerId, onClose }: MemberModalProps) {
  const addMember = useAddMember(projectId);
  const removeMember = useRemoveMember(projectId);
  const { toast } = useToast();

  const [email, setEmail] = useState('');
  const [newRole, setNewRole] = useState<Role>('MEMBER');
  const [error, setError] = useState('');
  const [removeTarget, setRemoveTarget] = useState<ProjectMember | null>(null);

  const isOwner = role === 'OWNER';

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!email.trim()) return;
    try {
      await addMember.mutateAsync({ email: email.trim(), role: newRole });
      setEmail('');
      toast('success', 'Member added');
    } catch (err: unknown) {
      const message = axios.isAxiosError<{ message?: string }>(err)
        ? err.response?.data?.message ?? 'Failed to add member'
        : 'Failed to add member';
      setError(message);
    }
  }

  async function handleRemove(userId: string) {
    setRemoveTarget(null);
    try {
      await removeMember.mutateAsync(userId);
      toast('success', 'Member removed');
    } catch (err: unknown) {
      const message = axios.isAxiosError<{ message?: string }>(err)
        ? err.response?.data?.message ?? 'Failed to remove member'
        : 'Failed to remove member';
      toast('error', message);
    }
  }

  return (
    <Modal open onClose={onClose} title="Manage Members" size="md">
      {isOwner && (
        <form onSubmit={handleAdd} className="space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Mail className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="member@example.com"
                aria-label="Member email"
                className="pl-8"
              />
            </div>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as Role)}
              aria-label="New member role"
              className="rounded-lg border border-line bg-surface px-2 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="MEMBER">Member</option>
              <option value="VIEWER">Viewer</option>
            </select>
          </div>
          <Button type="submit" size="sm" loading={addMember.isPending} className="w-full">
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Add member
          </Button>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}

      <div className="mt-5">
        <h3 className="mb-2 text-sm font-semibold text-ink">Members</h3>
        <ul className="space-y-2">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <Avatar name={m.user.name} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {m.user.name}
                    {m.user.id === ownerId && (
                      <span className="ml-1.5 text-xs font-semibold text-warning">(Owner)</span>
                    )}
                  </p>
                  <p className="text-xs text-ink-muted">{m.role}</p>
                </div>
              </div>
              {isOwner && m.user.id !== ownerId && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRemoveTarget(m)}
                  aria-label={`Remove ${m.user.name}`}
                  className="shrink-0 text-ink-muted hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              )}
            </li>
          ))}
        </ul>
        {members.length === 0 && <p className="text-sm text-ink-muted">No members yet.</p>}
      </div>

      <ConfirmDialog
        open={removeTarget !== null}
        onClose={() => setRemoveTarget(null)}
        onConfirm={() => removeTarget && void handleRemove(removeTarget.user.id)}
        title={`Remove ${removeTarget?.user.name ?? 'member'}?`}
        message="They will lose access to this project and its boards."
        confirmLabel="Remove"
        loading={removeMember.isPending}
      />
    </Modal>
  );
}