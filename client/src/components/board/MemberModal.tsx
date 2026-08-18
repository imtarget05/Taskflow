import { useState } from 'react';
import axios from 'axios';
import type { ProjectMember, Role } from '@/types';
import { useAddMember, useRemoveMember } from '@/hooks/useProjects';

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

  const [email, setEmail] = useState('');
  const [newRole, setNewRole] = useState<Role>('MEMBER');
  const [error, setError] = useState('');

  const isOwner = role === 'OWNER';

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!email.trim()) return;
    try {
      await addMember.mutateAsync({ email: email.trim(), role: newRole });
      setEmail('');
    } catch (err: unknown) {
      setError(axios.isAxiosError<{ message?: string }>(err) ? err.response?.data?.message ?? 'Failed to add member' : 'Failed to add member');
    }
  }

  async function handleRemove(userId: string) {
    if (!window.confirm('Remove this member from the project?')) return;
    try {
      await removeMember.mutateAsync(userId);
    } catch (err: unknown) {
      setError(axios.isAxiosError<{ message?: string }>(err) ? err.response?.data?.message ?? 'Failed to remove member' : 'Failed to remove member');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="card w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Manage Members</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <div className="mt-4 space-y-4">
          {isOwner && (
            <form onSubmit={handleAdd} className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Member email"
                  className="input flex-1"
                />
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as Role)}
                  className="input w-32"
                >
                  <option value="MEMBER">Member</option>
                  <option value="VIEWER">Viewer</option>
                </select>
              </div>
              <button type="submit" className="btn-primary w-full text-sm">Add member</button>
            </form>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Members</h3>
            <ul className="space-y-2">
              {members.map((m) => (
                <li key={m.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-200 text-xs font-semibold text-brand-800">
                      {m.user.name.charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-slate-700">
                        {m.user.name}
                        {m.user.id === ownerId && <span className="ml-1 text-xs text-amber-600">(Owner)</span>}
                      </p>
                      <p className="text-xs text-slate-400">{m.role}</p>
                    </div>
                  </div>
                  {isOwner && m.user.id !== ownerId && (
                    <button
                      onClick={() => void handleRemove(m.user.id)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
