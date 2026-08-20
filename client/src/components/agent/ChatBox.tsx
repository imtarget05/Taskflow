import { FormEvent, useEffect, useRef, useState } from 'react';
import { Send, Sparkles, X, Trash2 } from 'lucide-react';
import { useAgent } from '@/store/agent';
import { Button } from '@/components/ui';

export default function ChatBox() {
  const { open, setOpen, messages, isTyping, send, clear, canUseAgent, projectId } = useAgent();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [open, messages, isTyping]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await send(draft);
    setDraft('');
  }

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className={`fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full shadow-modal transition-colors ${
          open ? 'bg-surface-2 text-ink' : 'bg-accent text-white hover:bg-accent-ink'
        }`}
        aria-label={open ? 'Close AI assistant' : 'Open AI assistant'}
      >
        {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Sparkles className="h-5 w-5" aria-hidden="true" />}
      </button>

      {open && (
        <div className="fixed bottom-20 right-4 z-50 flex w-[min(92vw,360px)] flex-col overflow-hidden rounded-xl border border-line bg-card shadow-modal">
          <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold">AI Assistant</p>
                <p className="text-[11px] text-ink-muted">
                  {projectId ? 'Context: project board' : 'Context: workspace'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={clear}
                className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
                aria-label="Clear conversation"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
                aria-label="Close AI assistant"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {canUseAgent === false && (
            <p className="border-b border-line bg-warning-soft px-4 py-2 text-xs text-ink-secondary">
              AI assistant is not configured on the server yet.
            </p>
          )}

          <div ref={scrollRef} className="h-80 overflow-y-auto px-4 py-3 space-y-2">
            {messages.length === 0 && (
              <p className="pt-8 text-center text-xs text-ink-muted">
                Ask me anything about your workspace —
                e.g. plan a sprint, organize tasks, or draft an update.
              </p>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                  m.role === 'user'
                    ? 'ml-auto bg-accent-soft text-accent-ink'
                    : 'bg-surface-2 text-ink'
                }`}
              >
                {m.content}
              </div>
            ))}
            {isTyping && (
              <div className="max-w-[85%] rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink-muted">
                Thinking…
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-line bg-surface p-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask the assistant…"
              className="min-w-0 flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none focus:border-accent"
              disabled={isTyping}
            />
            <Button type="submit" size="sm" className="shrink-0" disabled={isTyping || !draft.trim()}>
              <Send className="h-4 w-4" aria-hidden="true" />
            </Button>
          </form>
        </div>
      )}
    </>
  );
}