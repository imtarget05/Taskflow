import { extname } from 'path';
import { Prisma } from '@prisma/client';
import { extractText } from 'unpdf';
import { AppError } from '../../utils/errors';
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../lib/prisma';
import { chatCompletion, isLLMConfigured, LLMMessage } from './llm';
import { buildSystemPrompt } from './prompt';
import { AgentLanguage, resolveLanguage } from './language';
import { env } from '../../config/env';

export interface AgentChatMessage {
  role: string;
  content: string;
}

export interface ChatOptions {
  language?: AgentLanguage | null;
  projectId?: string | null;
  conversationId?: string | null;
}

const MAX_HISTORY = 20;
const MAX_MESSAGE_LENGTH = 4000;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_UPLOAD_TEXT_CHARS = 20_000;
export const UPLOAD_EXTENSIONS = new Set(['.txt', '.md', '.csv', '.json', '.xml', '.log', '.pdf', '.docx']);

export interface AgentStatus {
  enabled: boolean;
  provider: string;
  model: string | null;
  models?: {
    default: string | null;
    premium: string | null;
    reasoning: string | null;
    embed: string | null;
    rerank: string | null;
  };
}

export function agentStatus(): AgentStatus {
  return {
    enabled: isLLMConfigured(),
    provider: env.LLM_PROVIDER,
    model: env.LLM_MODEL ?? null,
    models: {
      default: env.LLM_MODEL ?? null,
      premium: env.LLM_MODEL_PREMIUM ?? null,
      reasoning: env.LLM_MODEL_REASONING ?? null,
      embed: env.LLM_EMBED_MODEL ?? null,
      rerank: env.LLM_RERANK_MODEL ?? null,
    },
  };
}

export async function chat(
  userId: string,
  messages: AgentChatMessage[],
  options: ChatOptions = {}
): Promise<{ reply: string; conversationId: string }> {
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

  // Resolve the assistant language: an explicit client preference wins;
  // otherwise detect it from the conversation and prioritize Vietnamese.
  const language = resolveLanguage(
    history.map((m) => m.content),
    options.language ?? undefined
  );

  const system: LLMMessage = { role: 'system', content: buildSystemPrompt(language) };
  const reply = await chatCompletion([system, ...history]);

  const conversationId = await persistConversation(userId, history, options, reply);

  return { reply, conversationId };
}

/** Saves or appends the exchanged messages to an AgentConversation row. */
async function persistConversation(
  userId: string,
  history: LLMMessage[],
  options: ChatOptions,
  reply: string
): Promise<string> {
  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'assistant' as const, content: reply },
  ] as Prisma.InputJsonValue;
  const projectId = options.projectId ?? null;

  const existing = options.conversationId
    ? await prisma.agentConversation.findFirst({
        where: { id: options.conversationId, userId },
        select: { id: true },
      })
    : null;

  if (existing) {
    await prisma.agentConversation.update({
      where: { id: existing.id },
      data: { messages, projectId },
    });
    return existing.id;
  }

  const firstUser = history.find((m) => m.role === 'user')?.content ?? '';
  const created = await prisma.agentConversation.create({
    data: {
      userId,
      projectId,
      title: firstUser.slice(0, 80),
      messages,
    },
  });
  return created.id;
}

export async function listConversations(userId: string, projectId?: string | null) {
  return prisma.agentConversation.findMany({
    where: { userId, ...(projectId ? { projectId } : {}) },
    orderBy: { updatedAt: 'desc' },
    take: 50,
    select: { id: true, title: true, projectId: true, createdAt: true, updatedAt: true },
  });
}

export async function getConversation(userId: string, conversationId: string) {
  const conversation = await prisma.agentConversation.findFirst({
    where: { id: conversationId, userId },
  });
  if (!conversation) throw new AppError('Conversation not found', StatusCodes.NOT_FOUND);

  const messages = Array.isArray(conversation.messages)
    ? (conversation.messages as unknown[]).filter(
        (m): m is { role: string; content: string } =>
          typeof m === 'object' && m !== null && 'role' in m && 'content' in m
      )
    : [];
  return {
    id: conversation.id,
    title: conversation.title,
    projectId: conversation.projectId,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messages,
  };
}

export async function deleteConversation(userId: string, conversationId: string): Promise<void> {
  const result = await prisma.agentConversation.deleteMany({
    where: { id: conversationId, userId },
  });
  if (result.count === 0) {
    throw new AppError('Conversation not found', StatusCodes.NOT_FOUND);
  }
}

/** Extracts plain text from an uploaded document (no server-side storage). */
export async function parseUpload(
  filename: string,
  buffer: Buffer
): Promise<{ fileName: string; size: number; text: string; truncated: boolean }> {
  const ext = extname(filename).toLowerCase();
  if (!UPLOAD_EXTENSIONS.has(ext)) {
    throw new AppError(`Unsupported file type "${ext}"`, StatusCodes.BAD_REQUEST);
  }

  let text = '';
  if (ext === '.pdf' || ext === '.docx') {
    try {
      const result = await extractText(new Uint8Array(buffer));
      text = Array.isArray(result.text) ? result.text.join('\n') : (result.text ?? '');
    } catch {
      throw new AppError('Unable to read the file content', StatusCodes.UNPROCESSABLE_ENTITY);
    }
  } else {
    text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  }

  const trimmed = text.trim();
  if (!trimmed) {
    throw new AppError('The file appears to be empty or unreadable', StatusCodes.UNPROCESSABLE_ENTITY);
  }

  const truncated = trimmed.length > MAX_UPLOAD_TEXT_CHARS;
  return {
    fileName: filename,
    size: buffer.length,
    text: truncated ? trimmed.slice(0, MAX_UPLOAD_TEXT_CHARS) : trimmed,
    truncated,
  };
}