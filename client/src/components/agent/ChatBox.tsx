import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  FileUp,
  History,
  Paperclip,
  Plus,
  Send,
  Sparkles,
  Trash2,
  X,
  Languages,
} from 'lucide-react';
import { useAgent, AgentLanguage } from '@/store/agent';
import { Button } from '@/components/ui';
import { timeAgo } from '@/lib/time';

const LANGUAGE_OPTIONS: { value: AgentLanguage; label: string }[] = [
  { value: 'auto', label: 'Auto (ưu tiên Tiếng Việt)' },
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'en', label: 'English' },
  { value: 'zh', label: '中文' },
];

const SUGGESTIONS = [
  'Lập kế hoạch sprint tuần này',
  'Tóm tắt các task chưa hoàn thành',
  'Soạn cập nhật trạng thái cho nhóm',
  'Gợi ý cách ưu tiên công việc',
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ChatBox() {
  const {
    open,
    setOpen,
    messages,
    isTyping,
    isUploading,
    send,
    upload,
    clear,
    canUseAgent,
    provider,
    model,
    projectId,
    language,
    setLanguage,
    conversations,
    historyOpen,
    setHistoryOpen,
    conversationId,
    newConversation,
    loadConversation,
    deleteConversation,
  } = useAgent();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  // Only auto-scroll while the user is already at/near the bottom — scrolling
  // up to re-read history must never be yanked back down.
  const stickToBottom = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  function handleMessagesScroll() {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  }

  useEffect(() => {
    if (!open) return;
    if (!stickToBottom.current) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, messages, isTyping, isUploading]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [draft]);

  async function submitText() {
    const body = draft.trim();
    if (!body || isTyping) return;
    setDraft('');
    await send(body);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void submitText();
  }

  function pickFile() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await upload(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dragDepth.current = 0;
    const file = e.dataTransfer.files?.[0];
    if (file) void upload(file);
  }

  const statusText = canUseAgent === false
    ? 'Chưa cấu hình'
    : model
      ? `${provider ?? 'AI'} · ${model}`
      : 'Sẵn sàng';

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className={`fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full shadow-modal transition-all ${
          open ? 'rotate-90 bg-surface-2 text-ink' : 'bg-accent text-white hover:bg-accent-hover'
        }`}
        aria-label={open ? 'Close AI assistant' : 'Open AI assistant'}
      >
        {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Sparkles className="h-5 w-5" aria-hidden="true" />}
      </button>

      {open && (
        <div
          className="fixed bottom-20 right-4 z-50 flex max-h-[min(80vh,640px)] w-[min(94vw,400px)] flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-modal"
          onDragEnter={(e) => {
            e.preventDefault();
            dragDepth.current += 1;
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={(e) => {
            e.preventDefault();
            dragDepth.current -= 1;
          }}
          onDrop={handleDrop}
        >
          {/* Header */}
          <div className="relative shrink-0 overflow-hidden bg-gradient-to-r from-accent to-info px-4 py-3 text-white">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15">
                  <Sparkles className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-tight">AI Assistant</p>
                  <p className="flex items-center gap-1.5 truncate text-[11px] text-white/80">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-300" aria-hidden="true" />
                    {statusText}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setHistoryOpen(true)}
                  className="rounded-md p-1.5 text-white/80 transition-colors hover:bg-white/15 hover:text-white"
                  aria-label="Conversation history"
                >
                  <History className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={newConversation}
                  className="rounded-md p-1.5 text-white/80 transition-colors hover:bg-white/15 hover:text-white"
                  aria-label="New conversation"
                  title="New conversation"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={clear}
                  className="rounded-md p-1.5 text-white/80 transition-colors hover:bg-white/15 hover:text-white"
                  aria-label="Clear conversation"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md p-1.5 text-white/80 transition-colors hover:bg-white/15 hover:text-white"
                  aria-label="Close AI assistant"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="truncate text-[10px] text-white/70">
                {projectId ? 'Ngữ cảnh: board dự án hiện tại' : 'Ngữ cảnh: toàn bộ workspace'}
              </span>
              <label className="flex shrink-0 items-center gap-1 text-white/80" title="Ngôn ngữ trợ lý">
                <Languages className="h-3 w-3" aria-hidden="true" />
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as AgentLanguage)}
                  aria-label="Assistant language"
                  className="rounded border border-white/20 bg-white/10 px-1 py-0.5 text-[10px] text-white outline-none focus:border-white"
                >
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value} className="text-ink">
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {canUseAgent === false && (
            <p className="border-b border-line bg-warning-soft px-4 py-2 text-xs text-ink-secondary">
              AI assistant is not configured on the server yet.
            </p>
          )}

          {/* Messages */}
          <div
            ref={scrollRef}
            onScroll={handleMessagesScroll}
            className="min-h-[240px] flex-1 space-y-3 overflow-y-auto overscroll-contain bg-bg/40 px-4 py-3"
          >
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 px-2 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                  <Sparkles className="h-6 w-6" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-medium text-ink">Xin chào! Tôi là trợ lý AI của TaskFlow.</p>
                  <p className="mt-1 text-xs text-ink-muted">
                    Hỏi tôi về dự án, task, hoặc tải lên tài liệu để phân tích cùng.
                  </p>
                </div>
                <div className="grid w-full grid-cols-1 gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setDraft(s);
                        textareaRef.current?.focus();
                      }}
                      className="rounded-lg border border-line bg-surface px-3 py-2 text-left text-xs text-ink-secondary transition-colors hover:border-accent hover:text-accent"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  {m.role === 'assistant' && (
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                  )}
                  <div className={`max-w-[82%] ${m.role === 'user' ? 'items-end' : ''}`}>
                    <div
                      className={`whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                        m.role === 'user'
                          ? 'rounded-br-md bg-gradient-to-br from-accent to-info text-white shadow-card'
                          : 'rounded-bl-md border border-line bg-surface text-ink'
                      }`}
                    >
                      {m.attachment && (
                        <span
                          className={`mb-1.5 flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium ${
                            m.role === 'user' ? 'bg-white/15 text-white' : 'bg-surface-2 text-ink-secondary'
                          }`}
                        >
                          {m.attachment.image ? (
                            <img
                              src={m.attachment.image.dataUrl}
                              alt={m.attachment.name}
                              className="h-8 w-8 shrink-0 rounded object-cover"
                            />
                          ) : (
                            <Paperclip className="h-3 w-3 shrink-0" aria-hidden="true" />
                          )}
                          <span className="truncate">{m.attachment.name}</span>
                          <span className="shrink-0 opacity-70">· {formatBytes(m.attachment.size)}</span>
                        </span>
                      )}
                      {m.content}
                    </div>
                    {m.createdAt && (
                      <span className={`mt-1 block text-[10px] text-ink-muted ${m.role === 'user' ? 'text-right' : ''}`}>
                        {timeAgo(m.createdAt)}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}

            {(isTyping || isUploading) && (
              <div className="flex items-end gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-line bg-surface px-3 py-3">
                  {isUploading ? (
                    <span className="flex items-center gap-1.5 text-xs text-ink-muted">
                      <FileUp className="h-3.5 w-3.5" aria-hidden="true" /> Đang đọc file…
                    </span>
                  ) : (
                    <>
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="shrink-0 border-t border-line bg-surface p-2.5">
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={pickFile}
                disabled={isTyping || isUploading || canUseAgent === false}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-ink-secondary transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                aria-label="Attach a file"
                title="Đính kèm txt, md, csv, json, pdf, docx…"
              >
                <Paperclip className="h-4 w-4" aria-hidden="true" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.csv,.json,.xml,.log,.pdf,.docx,.png,.jpg,.jpeg,.webp,.gif,.bmp"
                onChange={(e) => void handleFileChange(e)}
                className="hidden"
                aria-hidden="true"
                tabIndex={-1}
              />
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void submitText();
                  }
                }}
                rows={1}
                disabled={isTyping || isUploading}
                placeholder={isUploading ? 'Đang đọc file…' : 'Hỏi trợ lý AI hoặc tải file…'}
                aria-label="Message the AI assistant"
                className="min-h-[38px] max-h-[120px] min-w-0 flex-1 resize-none rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-accent disabled:opacity-50"
              />
              <Button type="submit" size="sm" className="h-9 shrink-0 px-3" disabled={isTyping || isUploading || !draft.trim()}>
                <Send className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">Send</span>
              </Button>
            </div>
            {/* Resolved-language indicator hidden per UX request; logic kept intact. */}

          </form>

          {/* History drawer */}
          {historyOpen && (
            <div className="absolute inset-0 z-10 flex flex-col bg-card">
              <header className="flex shrink-0 items-center justify-between border-b border-line bg-surface px-4 py-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <History className="h-4 w-4 text-ink-muted" aria-hidden="true" />
                  Lịch sử hội thoại
                </h3>
                <button
                  type="button"
                  onClick={() => setHistoryOpen(false)}
                  className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
                  aria-label="Close history"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {conversations.length === 0 ? (
                  <p className="px-3 py-8 text-center text-xs text-ink-muted">
                    Chưa có cuộc hội thoại nào. Hãy bắt đầu một câu hỏi đầu tiên.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {conversations.map((c) => (
                      <li key={c.id}>
                        <div
                          className={`group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-2 ${
                            conversationId === c.id ? 'bg-accent-soft' : ''
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => void loadConversation(c.id)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <span
                              className={`block truncate text-sm ${
                                conversationId === c.id ? 'font-medium text-accent-ink' : 'text-ink'
                              }`}
                            >
                              {c.title || 'Cuộc trò chuyện'}
                            </span>
                            <span className="block text-[10px] text-ink-muted">
                              {c.projectId ? 'Trong dự án' : 'Workspace'} · {timeAgo(c.updatedAt)}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteConversation(c.id)}
                            className="shrink-0 rounded-md p-1.5 text-ink-muted opacity-0 transition-opacity hover:bg-danger-soft hover:text-danger group-hover:opacity-100"
                            aria-label="Delete conversation"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
