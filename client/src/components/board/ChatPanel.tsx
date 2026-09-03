import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MessageSquare, Send, X } from 'lucide-react';
import { useProjectChat, useSendChatMessage } from '@/hooks/useProjects';
import { Avatar, Button, EmptyState, Skeleton } from '@/components/ui';
import { timeAgo } from '@/lib/time';
import type { Role, User } from '@/types';

interface ChatPanelProps {
  projectId: string;
  name: string;
  members: { id: string; user: User }[];
  currentUser: User | null;
  role: Role;
  onClose: () => void;
}

export default function ChatPanel({ projectId, name, members, currentUser, role, onClose }: ChatPanelProps) {
  const { data: group, isLoading, isError } = useProjectChat(projectId);
  const send = useSendChatMessage(projectId, currentUser);
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const canChat = (role === 'OWNER' || role === 'MEMBER') && !!group;

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [group?.messages.length]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !canChat || send.isPending) return;
    setDraft('');
    send.mutate(body);
  }

  return (
    <aside
      aria-label="Project chat"
      className="flex h-full w-full flex-col border-l border-line bg-surface lg:w-80"
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <MessageSquare className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{group?.name ?? `#${name}`}</h2>
          <div className="flex items-center gap-1.5">
            <span className="flex -space-x-1">
              {(members.length === 0 ? [] : members).slice(0, 4).map((m) => (
                <Avatar key={m.id} name={m.user.name} size="xs" className="border border-surface" />
              ))}
            </span>
            <span className="text-[10px] text-ink-muted">{members.length} members</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
          aria-label="Close chat"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden px-4 py-3">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-3/4" />
            <Skeleton className="h-12 w-1/2" />
            <Skeleton className="h-12 w-2/3" />
          </div>
        ) : isError || !group ? (
          <EmptyState
            icon={<MessageSquare className="h-6 w-6" aria-hidden="true" />}
            title={members.length < 2 ? 'Chat opens with 2+ members' : 'Chat unavailable'}
            description={
              members.length < 2
                ? 'Invite a teammate to this project and the group chat is created automatically.'
                : 'The chat could not be loaded.'
            }
            className="py-8"
          />
        ) : group.messages.length === 0 ? (
          <EmptyState
            icon={<MessageSquare className="h-6 w-6" aria-hidden="true" />}
            title="No messages yet"
            description="Say hello to your teammates."
            className="py-8"
          />
        ) : (
          group.messages.map((m) => {
            const mine = m.senderId === currentUser?.id;
            const isTemp = m.id.startsWith('tmp-');
            return (
              <div key={m.id} className={`flex gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                {!mine && <Avatar name={m.sender.name} size="sm" className="mt-0.5 shrink-0" />}
                <div className={`max-w-[80%] min-w-0 ${mine ? 'items-end' : ''}`}>
                  <div
                    className={`rounded-2xl px-3 py-2 text-sm ${
                      mine
                        ? `rounded-br-sm ${isTemp ? 'bg-accent/60' : 'bg-accent text-white'}`
                        : 'rounded-bl-sm bg-surface-2 text-ink'
                    }`}
                  >
                    {!mine && <div className="mb-0.5 text-[10px] font-semibold text-ink-muted">{m.sender.name}</div>}
                    <p className="break-words whitespace-pre-wrap">{m.body}</p>
                  </div>
                  <span className={`mt-0.5 block text-[10px] text-ink-muted ${mine ? 'text-right' : ''}`}>
                    {timeAgo(m.createdAt)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      <form onSubmit={submit} className="shrink-0 border-t border-line p-3">
        <label htmlFor="chat-input" className="sr-only">
          Message
        </label>
        <div className="flex items-end gap-2">
          <textarea
            id="chat-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit(e);
              }
            }}
            rows={1}
            disabled={!canChat}
            placeholder={canChat ? 'Write a message…' : 'You can only view this chat'}
            className="min-h-[38px] flex-1 resize-none rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
          />
          <Button type="submit" size="sm" disabled={!canChat || !draft.trim() || send.isPending}>
            <Send className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Send</span>
          </Button>
        </div>
        {send.isError && <p className="mt-1 text-xs text-danger">Failed to send. Try again.</p>}
      </form>
    </aside>
  );
}