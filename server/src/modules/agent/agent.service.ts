import { AppError } from '../../utils/errors';
import { StatusCodes } from 'http-status-codes';
import { chatCompletion, isLLMConfigured, LLMMessage } from './llm';
import { SYSTEM_PROMPT } from './prompt';
import { env } from '../../config/env';

export interface AgentChatMessage {
  role: string;
  content: string;
}

const MAX_HISTORY = 20;
const MAX_MESSAGE_LENGTH = 4000;

export interface AgentStatus {
  enabled: boolean;
  provider: string;
  model: string | null;
}

export function agentStatus(): AgentStatus {
  return {
    enabled: isLLMConfigured(),
    provider: env.LLM_PROVIDER,
    model: env.LLM_MODEL ?? null,
  };
}

export async function chat(messages: AgentChatMessage[]): Promise<{ reply: string }> {
  if (!isLLMConfigured()) {
    throw new AppError('AI assistant is not configured', StatusCodes.SERVICE_UNAVAILABLE);
  }

  const history: LLMMessage[] = [];
  for (const m of messages.slice(-MAX_HISTORY)) {
    const role = m.role === 'user' || m.role === 'assistant' ? m.role : 'user';
    const content = String(m.content ?? '').slice(0, MAX_MESSAGE_LENGTH).trim();
    if (content) history.push({ role, content });
  }
  if (history.length === 0) {
    throw new AppError('No message content provided', StatusCodes.BAD_REQUEST);
  }

  const reply = await chatCompletion([{ role: 'system', content: SYSTEM_PROMPT }, ...history]);
  return { reply };
}