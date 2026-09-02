import { createContext, useContext, useState, ReactNode, useCallback, useRef, useEffect } from 'react';
import api from '@/lib/api';
import { useToast } from '@/store/toast';
import { useAuth } from '@/store/auth';
import { ResolvedLanguage } from '@/lib/language';

export type AgentLanguage = 'auto' | 'vi' | 'en' | 'zh';

export interface AgentAttachment {
  name: string;
  size: number;
  /** Present when the attached file is an image (data: URI) for vision models. */
  image?: { mime: string; dataUrl: string };
}

export interface AgentChatItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachment?: AgentAttachment;
  createdAt?: string;
}

export interface AgentConversationSummary {
  id: string;
  title: string | null;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AgentContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  projectId: string | null;
  setProjectId: (id: string | null) => void;
  canUseAgent: boolean | null;
  provider: string | null;
  model: string | null;
  language: AgentLanguage;
  setLanguage: (language: AgentLanguage) => void;
  /** Authoritative language the LLM replied in (null until the first response). */
  resolvedLanguage: ResolvedLanguage | null;
  messages: AgentChatItem[];
  isTyping: boolean;
  isUploading: boolean;
  conversationId: string | null;
  conversations: AgentConversationSummary[];
  historyOpen: boolean;
  setHistoryOpen: (open: boolean) => void;
  send: (text: string) => Promise<void>;
  upload: (file: File) => Promise<void>;
  clear: () => void;
  newConversation: () => void;
  loadConversation: (id: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
}

const AgentContext = createContext<AgentContextValue | undefined>(undefined);

const LANG_STORAGE_KEY = 'taskflow.agent.language';
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const UPLOAD_EXTENSIONS = new Set(['txt', 'md', 'csv', 'json', 'xml', 'log', 'pdf', 'docx']);
export const UPLOAD_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp']);

function normalizeLanguage(value: string | null): AgentLanguage {
  return value === 'vi' || value === 'en' || value === 'zh' || value === 'auto' ? value : 'auto';
}

function readStoredLanguage(): AgentLanguage {
  if (typeof window === 'undefined') return 'auto';
  try {
    return normalizeLanguage(window.localStorage.getItem(LANG_STORAGE_KEY));
  } catch {
    return 'auto';
  }
}

let idSeq = 0;
function nextId(): string {
  idSeq += 1;
  return String(idSeq);
}

export function AgentProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [canUseAgent, setCanUseAgent] = useState<boolean | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [language, setLanguageState] = useState<AgentLanguage>(readStoredLanguage);
  const [resolvedLanguage, setResolvedLanguage] = useState<ResolvedLanguage | null>(null);
  const [messages, setMessages] = useState<AgentChatItem[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<AgentConversationSummary[]>([]);
  const historyRef = useRef<{ role: 'user' | 'assistant'; content: string; image?: { mime: string; dataUrl: string } | null }[]>([]);

  const setLanguage = useCallback((next: AgentLanguage) => {
    setLanguageState(next);
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      // storage unavailable — preference just won't persist across reloads
    }
  }, []);

  const checkStatus = useCallback(async () => {
    try {
      const res = await api.get<{ enabled: boolean; provider: string; model: string | null }>('/agent/status');
      setCanUseAgent(Boolean(res.data.enabled));
      setProvider(res.data.provider ?? null);
      setModel(res.data.model ?? null);
    } catch {
      setCanUseAgent(false);
    }
  }, []);

  const refreshConversations = useCallback(async () => {
    try {
      const res = await api.get<{ data: AgentConversationSummary[] }>('/agent/conversations', {
        params: projectId ? { projectId } : undefined,
      });
      setConversations(res.data.data ?? []);
    } catch {
      // history list is best-effort
    }
  }, [projectId]);

  useEffect(() => {
    // Chưa đăng nhập thì bỏ qua — các call này sẽ 401 và không có ý nghĩa gì
    // trên trang guest (login/register).
    if (!user) return;
    void checkStatus();
    void refreshConversations();
  }, [checkStatus, refreshConversations, user]);

  async function runTurn(text: string, attachment?: AgentAttachment) {
    const trimmed = text.trim();
    // Images are valid even with empty text (pure "what's in this picture?").
    const hasImage = Boolean(attachment?.image);
    if ((!trimmed && !hasImage) || isTyping) return;

    if (canUseAgent === false) {
      toast('error', 'AI assistant unavailable', 'The AI assistant is not configured on the server yet.');
      return;
    }

    const userMsg: AgentChatItem = {
      id: nextId(),
      role: 'user',
      content: trimmed,
      attachment,
      createdAt: new Date().toISOString(),
    };
    historyRef.current.push({ role: 'user', content: trimmed, image: attachment?.image ?? null });
    setMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);
    try {
      const res = await api.post<{ reply: string; conversationId: string; language: ResolvedLanguage }>('/agent/chat', {
        messages: historyRef.current.slice(-20),
        language,
        projectId,
        conversationId,
      });
      const reply: AgentChatItem = {
        id: nextId(),
        role: 'assistant',
        content: res.data.reply,
        createdAt: new Date().toISOString(),
      };
      historyRef.current.push({ role: 'assistant', content: res.data.reply });
      setMessages((prev) => [...prev, reply]);
      setConversationId(res.data.conversationId ?? null);
      setResolvedLanguage(res.data.language ?? null);
      void refreshConversations();
    } catch {
      toast('error', 'Agent request failed', 'Please try again in a moment.');
    } finally {
      setIsTyping(false);
    }
  }

  async function send(text: string) {
    await runTurn(text);
  }

  async function upload(file: File) {
    if (canUseAgent === false) {
      toast('error', 'AI assistant unavailable', 'The AI assistant is not configured on the server yet.');
      return;
    }
    const ext = file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase();
    const isImage = UPLOAD_IMAGE_EXTENSIONS.has(ext);
    if (!isImage && !UPLOAD_EXTENSIONS.has(ext)) {
      toast('error', 'Unsupported file', 'Upload a text document (txt, md, csv, json, xml, log, pdf, docx) or an image (png, jpg, webp, gif).');
      return;
    }
    const sizeLimit = isImage ? MAX_IMAGE_BYTES : MAX_UPLOAD_BYTES;
    if (file.size > sizeLimit) {
      toast('error', 'File too large', isImage ? 'Keep images under 2 MB.' : 'Keep files under 5 MB.');
      return;
    }

    setIsUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post<{
        data:
          | { type: 'text'; text: string; fileName: string; size: number; truncated: boolean }
          | { type: 'image'; mime: string; dataUrl: string; fileName: string; size: number };
      }>('/agent/upload', form);
      const result = res.data.data;
      if (result.type === 'image') {
        await runTurn('', {
          name: result.fileName,
          size: result.size,
          image: { mime: result.mime, dataUrl: result.dataUrl },
        });
      } else {
        await runTurn(result.text, { name: result.fileName, size: result.size });
      }
    } catch (err: unknown) {
      const message =
        typeof err === 'object' && err !== null && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast('error', 'Upload failed', message || 'Could not read this file.');
    } finally {
      setIsUploading(false);
    }
  }

  function clear() {
    historyRef.current = [];
    setMessages([]);
    setConversationId(null);
    setResolvedLanguage(null);
  }

  function newConversation() {
    clear();
    setHistoryOpen(false);
  }

  async function loadConversation(id: string) {
    try {
      const res = await api.get<{
        data: { messages: { role: string; content: string | unknown[] }[]; projectId: string | null };
      }>(`/agent/conversations/${id}`);
      const loaded = res.data.data;
      // Stored multimodal messages may have array content (image parts); keep
      // only the joined text so history replay stays text-safe.
      const flatten = (content: string | unknown[]): string =>
        typeof content === 'string'
          ? content
          : content
              .filter(
                (p): p is { type: 'text'; text: string } =>
                  typeof p === 'object' && p !== null && (p as { type?: string }).type === 'text'
              )
              .map((p) => p.text)
              .join(' ');
      historyRef.current = loaded.messages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: flatten(m.content),
      }));
      setMessages(
        loaded.messages.map((m) => ({
          id: nextId(),
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: flatten(m.content),
          createdAt: new Date().toISOString(),
        }))
      );
      setConversationId(id);
      // Language preference lives on the server; it will be re-authoritative
      // with the next turn's response. Reset any stale value from a previous
      // conversation so the indicator doesn't lie.
      setResolvedLanguage(null);
      setHistoryOpen(false);
    } catch {
      toast('error', 'Could not load conversation');
    }
  }

  async function deleteConversation(id: string) {
    try {
      await api.delete(`/agent/conversations/${id}`);
      if (conversationId === id) clear();
      void refreshConversations();
    } catch {
      toast('error', 'Could not delete conversation');
    }
  }

  return (
    <AgentContext.Provider
      value={{
        open,
        setOpen,
        projectId,
        setProjectId,
        canUseAgent,
        provider,
        model,
        language,
        setLanguage,
        resolvedLanguage,
        messages,
        isTyping,
        isUploading,
        conversationId,
        conversations,
        historyOpen,
        setHistoryOpen,
        send,
        upload,
        clear,
        newConversation,
        loadConversation,
        deleteConversation,
      }}
    >
      {children}
    </AgentContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAgent(): AgentContextValue {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error('useAgent must be used within AgentProvider');
  return ctx;
}