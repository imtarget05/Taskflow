import { createContext, useContext, useState, ReactNode, useCallback, useRef, useEffect } from 'react';
import api from '@/lib/api';
import { useToast } from '@/store/toast';

export interface AgentChatItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface AgentContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  projectId: string | null;
  setProjectId: (id: string | null) => void;
  canUseAgent: boolean | null;
  messages: AgentChatItem[];
  isTyping: boolean;
  send: (text: string) => Promise<void>;
  clear: () => void;
}

const AgentContext = createContext<AgentContextValue | undefined>(undefined);

let idSeq = 0;
function nextId(): string {
  idSeq += 1;
  return String(idSeq);
}

export function AgentProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [canUseAgent, setCanUseAgent] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<AgentChatItem[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const historyRef = useRef<{ role: 'user' | 'assistant'; content: string }[]>([]);

  const checkStatus = useCallback(async () => {
    try {
      const res = await api.get<{ enabled: boolean }>('/agent/status');
      setCanUseAgent(Boolean(res.data.enabled));
    } catch {
      setCanUseAgent(false);
    }
  }, []);

  useEffect(() => {
    void checkStatus();
  }, [checkStatus]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isTyping) return;

    if (canUseAgent === false) {
      toast('error', 'AI assistant unavailable', 'The AI assistant is not configured on the server yet.');
      return;
    }

    const userMsg: AgentChatItem = { id: nextId(), role: 'user', content: trimmed };
    historyRef.current.push({ role: 'user', content: trimmed });
    setMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);
    try {
      const res = await api.post<{ reply: string }>('/agent/chat', {
        messages: historyRef.current.slice(-20),
        projectId,
      });
      const reply: AgentChatItem = { id: nextId(), role: 'assistant', content: res.data.reply };
      historyRef.current.push({ role: 'assistant', content: res.data.reply });
      setMessages((prev) => [...prev, reply]);
    } catch {
      toast('error', 'Agent request failed', 'Please try again in a moment.');
    } finally {
      setIsTyping(false);
    }
  }

  function clear() {
    historyRef.current = [];
    setMessages([]);
  }

  return (
    <AgentContext.Provider
      value={{ open, setOpen, projectId, setProjectId, canUseAgent, messages, isTyping, send, clear }}
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