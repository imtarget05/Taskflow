import { FormEvent, useEffect, useRef, useState } from 'react';
import { Bot, FileUp, History, Paperclip, Plus, Send, Trash2, X } from 'lucide-react';
import { useAgent } from '@/store/agent';
import { Button } from '@/components/ui';
import { timeAgo } from '@/lib/time';

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

  // Professional header — never leak raw provider/model id (e.g. @cf/meta/llama...). Show only status.
  const statusText = canUseAgent === false ? 'Chưa cấu hình' : 'Sẵn sàng · TaskFlow AI';

  return (
    <>
      {/* M3 FAB — icon-only, 56×56dp per M3 spec */}
      <button
        onClick={() => setOpen(!open)}
        className={`fab-m3 fixed bottom-5 right-5 z-50 flex items-center justify-center focus-m3 ${
          open
            ? 'h-14 w-14 rounded-xl bg-surfaceContainerHighest text-ink shadow-elevation2'
            : 'h-14 w-14 rounded-xl bg-primaryContainer text-onPrimaryContainer'
        }`}
        aria-label={open ? 'Đóng AI Assistant' : 'Mở AI Assistant'}
        aria-expanded={open}
      >
        {open ? (
          <X className="h-6 w-6" aria-hidden="true" />
        ) : (
          <Bot className="h-6 w-6 shrink-0" aria-hidden="true" />
        )}
      </button>

      {open && (
        <div
          className="fixed bottom-24 right-4 z-50 flex max-h-[min(70vh,560px)] w-[min(94vw,400px)] flex-col overflow-hidden rounded-xl border border-outlineVariant bg-surfaceContainerLow shadow-elevation3 animate-scale-in"
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
          {/* Header — M3 surfaceContainerHigh, no gradient */}
          <div className="relative shrink-0 border-b border-outlineVariant bg-surfaceContainerHigh px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primaryContainer text-onPrimaryContainer">
                  <Bot className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-tight text-ink">AI Assistant</p>
                  <p className="flex items-center gap-1.5 truncate text-xs text-ink-secondary">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" aria-hidden="true" />
                    {statusText}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setHistoryOpen(true)}
                  className="rounded-full p-2 text-ink-secondary transition-colors hover:bg-surfaceContainerHighest hover:text-ink focus-m3-soft"
                  aria-label="Lịch sử hội thoại"
                >
                  <History className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={newConversation}
                  className="rounded-full p-2 text-ink-secondary transition-colors hover:bg-surfaceContainerHighest hover:text-ink focus-m3-soft"
                  aria-label="Cuộc trò chuyện mới"
                  title="Cuộc trò chuyện mới"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={clear}
                  className="rounded-full p-2 text-ink-secondary transition-colors hover:bg-surfaceContainerHighest hover:text-ink focus-m3-soft"
                  aria-label="Xóa cuộc trò chuyện"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-full p-2 text-ink-secondary transition-colors hover:bg-surfaceContainerHighest hover:text-ink focus-m3-soft"
                  aria-label="Đóng AI Assistant"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>

          {canUseAgent === false && (
            <p className="border-b border-outlineVariant bg-warning-soft px-4 py-2 text-xs text-ink-secondary">
              AI assistant is not configured on the server yet.
            </p>
          )}

          {/* Messages — M3 tonal surfaces */}
          <div
            ref={scrollRef}
            onScroll={handleMessagesScroll}
            className="min-h-[260px] flex-1 space-y-3 overflow-y-auto overscroll-contain bg-surfaceContainer px-4 py-4"
          >
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 px-2 py-6 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-primaryContainer text-onPrimaryContainer shadow-elevation1">
                  <Bot className="h-7 w-7" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-display text-sm font-semibold text-ink">Xin chào! Tôi là trợ lý AI của TaskFlow.</p>
                  <p className="mx-auto mt-1 max-w-[28ch] text-xs leading-5 text-ink-secondary">
                    Hỏi tôi về dự án, task, hoặc tải lên tài liệu để phân tích cùng.
                  </p>
                </div>
                <div className="grid w-full grid-cols-1 gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setDraft(s);
                        textareaRef.current?.focus();
                      }}
                      className="rounded-xl border border-outlineVariant bg-surfaceContainerHighest px-3.5 py-2.5 text-left text-xs font-medium text-ink-secondary transition-colors hover:border-primary/40 hover:bg-primaryContainer/30 hover:text-onPrimaryContainer focus-m3-soft"
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
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primaryContainer text-onPrimaryContainer">
                      <Bot className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                  )}
                  <div className={`max-w-[82%] ${m.role === 'user' ? 'items-end' : ''}`}>
                    <div
                      className={`whitespace-pre-wrap px-3.5 py-2.5 text-sm leading-relaxed shadow-elevation1 ${
                        m.role === 'user'
                          ? 'rounded-[16px_4px_16px_16px] bg-primary text-onPrimary'
                          : 'rounded-[4px_16px_16px_16px] border border-outlineVariant bg-surfaceContainerHighest text-ink'
                      }`}
                    >
                      {m.attachment && (
                        <span
                          className={`mb-2 flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium ${
                            m.role === 'user'
                              ? 'bg-white/15 text-white'
                              : 'bg-surfaceContainer text-ink-secondary'
                          }`}
                        >
                          {m.attachment.image ? (
                            <img
                              src={m.attachment.image.dataUrl}
                              alt={m.attachment.name}
                              className="h-8 w-8 shrink-0 rounded-lg object-cover"
                            />
                          ) : (
                            <Paperclip className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
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
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primaryContainer text-onPrimaryContainer">
                  <Bot className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <div className="flex items-center gap-1.5 rounded-[4px_16px_16px_16px] border border-outlineVariant bg-surfaceContainerHighest px-4 py-3 shadow-elevation1">
                  {isUploading ? (
                    <span className="flex items-center gap-1.5 text-xs text-ink-muted">
                      <FileUp className="h-3.5 w-3.5" aria-hidden="true" /> Đang đọc file…
                    </span>
                  ) : (
                    <>
                      <span className="typing-dot bg-primary" />
                      <span className="typing-dot bg-primary" />
                      <span className="typing-dot bg-primary" />
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Input — M3 pill field */}
          <form onSubmit={handleSubmit} className="shrink-0 border-t border-outlineVariant bg-surfaceContainerHigh p-3">
            <div className="flex items-end gap-2 rounded-xl border border-outlineVariant bg-surfaceContainerHighest px-2 py-2 shadow-elevation1 field-focus">
              <button
                type="button"
                onClick={pickFile}
                disabled={isTyping || isUploading || canUseAgent === false}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surfaceContainer text-ink-secondary transition-colors hover:bg-primaryContainer hover:text-onPrimaryContainer disabled:opacity-40"
                aria-label="Đính kèm file"
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
                aria-label="Nhắn tin cho AI Assistant"
                className="max-h-[120px] min-h-[36px] min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-ink placeholder:text-ink-muted disabled:opacity-50"
              />
              <Button
                type="submit"
                size="sm"
                variant="primary"
                className="h-9 w-9 shrink-0 rounded-full p-0"
                disabled={isTyping || isUploading || !draft.trim()}
                aria-label="Gửi tin nhắn"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            <p className="mt-2 text-center text-[10px] text-ink-muted">
              Kéo-thả file vào cửa sổ để đính kèm · tối đa 5 MB
            </p>
          </form>

          {/* History drawer — M3 sheet */}
          {historyOpen && (
            <div className="absolute inset-0 z-10 flex flex-col bg-surfaceContainerLow">
              <header className="flex shrink-0 items-center justify-between border-b border-outlineVariant bg-surfaceContainerHigh px-4 py-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <History className="h-4 w-4 text-ink-secondary" aria-hidden="true" />
                  Lịch sử hội thoại
                </h3>
                <button
                  type="button"
                  onClick={() => setHistoryOpen(false)}
                  className="rounded-full p-2 text-ink-secondary transition-colors hover:bg-surfaceContainerHighest hover:text-ink focus-m3-soft"
                  aria-label="Đóng lịch sử"
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
                          className={`group flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left transition-colors ${
                            conversationId === c.id
                              ? 'bg-primaryContainer text-onPrimaryContainer'
                              : 'hover:bg-surfaceContainerHighest'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => void loadConversation(c.id)}
                            className="min-w-0 flex-1 text-left focus-m3-soft"
                          >
                            <span
                              className={`block truncate text-sm ${
                                conversationId === c.id ? 'font-semibold' : 'font-medium text-ink'
                              }`}
                            >
                              {c.title || 'Cuộc trò chuyện'}
                            </span>
                            <span
                              className={`block text-[11px] ${conversationId === c.id ? 'text-onPrimaryContainer/70' : 'text-ink-muted'}`}
                            >
                              {c.projectId ? 'Trong dự án' : 'Workspace'} · {timeAgo(c.updatedAt)}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteConversation(c.id)}
                            className="shrink-0 rounded-full p-2 text-ink-muted opacity-0 transition-opacity hover:bg-errorContainer hover:text-error group-hover:opacity-100 focus-m3-soft"
                            aria-label="Xóa cuộc trò chuyện"
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