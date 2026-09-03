import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/Toast';
import { AuthProvider } from '@/store/auth';
import ChatBox from '@/components/agent/ChatBox';

const mockSend = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

vi.mock('@/store/agent', () => ({
  useAgent: () => ({
    open: true,
    setOpen: vi.fn(),
    messages: [],
    isTyping: false,
    isUploading: false,
    send: mockSend,
    upload: vi.fn(),
    clear: vi.fn(),
    canUseAgent: true,
    conversations: [],
    historyOpen: false,
    setHistoryOpen: vi.fn(),
    conversationId: null,
    newConversation: vi.fn(),
    loadConversation: vi.fn(),
    deleteConversation: vi.fn(),
  }),
}));

function renderChatBox() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <AuthProvider>
          <ChatBox />
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('ChatBox', () => {
  it('renders the AI Assistant header', () => {
    renderChatBox();
    expect(screen.getByText('AI Assistant')).toBeInTheDocument();
  });

  it('calls send when submitting a message', async () => {
    renderChatBox();
    fireEvent.change(screen.getByLabelText('Nhắn tin cho AI Assistant'), { target: { value: 'Xin chào' } });
    fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));
    await waitFor(() => expect(mockSend).toHaveBeenCalledWith('Xin chào'));
  });

  it('shows suggestions when no messages', () => {
    renderChatBox();
    expect(screen.getByText(/Xin chào! Tôi là trợ lý AI/)).toBeInTheDocument();
  });

  it('has an input for typing messages', () => {
    renderChatBox();
    expect(screen.getByLabelText('Nhắn tin cho AI Assistant')).toBeInTheDocument();
  });

  it('shows FAB button', () => {
    renderChatBox();
    expect(screen.getByLabelText('Đóng AI Assistant')).toBeInTheDocument();
  });
});
