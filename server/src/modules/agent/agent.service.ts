import { extname } from 'path';
import { Prisma } from '@prisma/client';
import { extractText } from 'unpdf';
import { AppError } from '../../utils/errors';
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../lib/prisma';
import {
  chatCompletion,
  isLLMConfigured,
  LLMMessage,
  LLMContentPart,
} from './llm';
import { buildSystemPrompt } from './prompt';
import {
  AgentLanguage,
  ResolvedLanguage,
  resolveTurnLanguage,
  TurnLanguage,
} from './language';
import { env } from '../../config/env';

export interface AgentChatMessage {
  role: string;
  content: string;
  /** Optional image attachment for vision models (data: URI). */
  image?: { mime: string; dataUrl: string } | null;
}

/** A decoded image attachment returned by parseUpload for vision models. */
export interface AgentImageAttachment {
  type: 'image';
  mime: string;
  dataUrl: string;
  fileName: string;
  size: number;
}

export interface AgentTextAttachment {
  type: 'text';
  text: string;
  truncated: boolean;
  fileName: string;
  size: number;
}

export type AgentUploadResult = AgentImageAttachment | AgentTextAttachment;

export interface ChatOptions {
  language?: AgentLanguage | null;
  projectId?: string | null;
  conversationId?: string | null;
}

const MAX_HISTORY = 20;
const MAX_MESSAGE_LENGTH = 4000;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_UPLOAD_TEXT_CHARS = 20_000;
export const UPLOAD_EXTENSIONS = new Set(['.txt', '.md', '.csv', '.json', '.xml', '.log', '.pdf', '.docx']);
export const UPLOAD_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);

// Magic-byte signatures used to verify an uploaded "image" is genuine before
// we hand bytes to the model/embedding pipeline (prevents disguised payloads).
const IMAGE_MAGIC: Record<string, string[]> = {
  '.png': ['89504e470d0a1a0a'],
  '.jpg': ['ffd8ff'],
  '.jpeg': ['ffd8ff'],
  '.gif': ['47494638'],
  '.bmp': ['424d'],
  '.webp': ['52494646'], // RIFF....WEBP — validated more strictly below
};

const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.webp': 'image/webp',
};


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
): Promise<{ reply: string; conversationId: string; language: ResolvedLanguage }> {
  if (!isLLMConfigured()) {
    throw new AppError('AI assistant is not configured', StatusCodes.SERVICE_UNAVAILABLE);
  }

  const history: LLMMessage[] = [];
  for (const m of messages.slice(-MAX_HISTORY)) {
    const msg = toLLMMessage(m);
    if (msg) history.push(msg);
  }
  if (history.length === 0) {
    throw new AppError('No message content provided', StatusCodes.BAD_REQUEST);
  }

  // Load the persisted conversation preference (null on old/new conversations).
  // The SERVER is the single source of truth for response language.
  const existing = options.conversationId
    ? await prisma.agentConversation.findFirst({
        where: { id: options.conversationId, userId },
        select: { id: true, language: true },
      })
    : null;

  // Resolve the assistant language for THIS turn via the single deterministic
  // resolver. Precedence: explicit request > conversation preference >
  // current-turn detection > Vietnamese fallback. Detection only ever sees the
  // latest user message, so a stray foreign-language sentence cannot flip a
  // thread that already has a preference.
  const turn = resolveTurnLanguage({
    requested: options.language ?? null,
    conversationPreference: existing?.language ?? null,
    userTexts: lastUserTexts(messages),
  });
  const language = turn.language;

  const system: LLMMessage = { role: 'system', content: buildSystemPrompt(language) };
  const reply = await chatCompletion([system, ...history]);

  const conversationId = await persistConversation(userId, history, options, reply, existing, turn);

  return { reply, conversationId, language };
}

/** Plain text of the LATEST user message — the detection scope for one turn. */
function lastUserTexts(incoming: AgentChatMessage[]): string[] {
  const lastUser = [...incoming].reverse().find((m) => m.role === 'user');
  return lastUser ? [String(lastUser.content ?? '')] : [];
}

/**
 * Convert an incoming chat message into an LLM message. User messages with an
 * image attachment become multimodal content parts ([text, image]) so vision
 * models can inspect the screenshot/photo; the image is a data: URI, so no
 * server-side storage or external fetch is needed.
 */
function toLLMMessage(m: AgentChatMessage): LLMMessage | null {
  const role = m.role === 'user' || m.role === 'assistant' ? m.role : 'user';
  const text = String(m.content ?? '').slice(0, MAX_MESSAGE_LENGTH).trim();

  const image = m.image && typeof m.image?.dataUrl === 'string' ? m.image : undefined;
  const hasImage = Boolean(image && role === 'user');

  if (!text && !hasImage) return null;
  if (!hasImage) return { role, content: text };

  const parts: LLMContentPart[] = [
    ...(text ? [{ type: 'text' as const, text }] : []),
    {
      type: 'image_url',
      image_url: { url: image!.dataUrl.slice(0, MAX_MESSAGE_LENGTH) },
    },
  ];
  return { role, content: parts };
}

/** The plain-text contribution of an LLM message (for language detection). */
function textOf(m: LLMMessage): string {
  if (typeof m.content === 'string') return m.content;
  return m.content
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join(' ');
}

/** Saves or appends the exchanged messages to an AgentConversation row. */
async function persistConversation(
  userId: string,
  history: LLMMessage[],
  options: ChatOptions,
  reply: string,
  existing: { id: string; language: string | null } | null,
  turn: TurnLanguage
): Promise<string> {
  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'assistant' as const, content: reply },
  ] as Prisma.InputJsonValue;
  const projectId = options.projectId ?? null;

  if (existing) {
    // Persist language only when it genuinely changed:
    //  - an explicit per-request choice always updates the preference;
    //  - a conversation without any preference yet gets pinned ONCE to the
    //    resolved language (detected or fallback);
    //  - an existing preference is NEVER overwritten by detection — one
    //    foreign-language message must not flip the thread.
    const nextLanguage =
      turn.source === 'explicit' || existing.language == null ? turn.language : undefined;

    await prisma.agentConversation.update({
      where: { id: existing.id },
      data: { messages, projectId, ...(nextLanguage !== undefined ? { language: nextLanguage } : {}) },
    });
    return existing.id;
  }

  const firstUserText = history.find((m) => m.role === 'user');
  const created = await prisma.agentConversation.create({
    data: {
      userId,
      projectId,
      title: (firstUserText ? textOf(firstUserText) : '').slice(0, 80),
      messages,
      language: turn.language,
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

/**
 * Validate an uploaded file against its declared extension using magic bytes.
 * Returns the hex prefix matched (or null when the input is not a valid image).
 */
export function sniffImage(ext: string, buffer: Buffer): boolean {
  const signatures = IMAGE_MAGIC[ext];
  if (!signatures) return false;
  const hex = buffer.subarray(0, 16).toString('hex').toLowerCase();
  if (ext === '.webp') return hex.startsWith('52494646') && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  return signatures.some((sig) => hex.startsWith(sig));
}

/**
 * Extracts usable content from an uploaded file (no server-side storage).
 *
 * - Text documents (txt/md/csv/json/xml/log/pdf/docx) are decoded to text.
 * - Images (png/jpg/jpeg/webp/gif/bmp) are validated by magic bytes and
 *   returned as a base64 data: URI that vision models can inspect.
 */
export async function parseUpload(
  filename: string,
  buffer: Buffer
): Promise<AgentUploadResult> {
  const ext = extname(filename).toLowerCase();

  if (UPLOAD_IMAGE_EXTENSIONS.has(ext)) {
    if (!sniffImage(ext, buffer)) {
      throw new AppError('The file is not a valid image', StatusCodes.UNPROCESSABLE_ENTITY);
    }
    if (buffer.length > MAX_IMAGE_BYTES) {
      throw new AppError('Image too large, keep it under 2 MB', 413);
    }
    const mime = IMAGE_MIME[ext];
    return {
      type: 'image',
      mime,
      dataUrl: `data:${mime};base64,${buffer.toString('base64')}`,
      fileName: filename,
      size: buffer.length,
    };
  }

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
    type: 'text',
    fileName: filename,
    size: buffer.length,
    text: truncated ? trimmed.slice(0, MAX_UPLOAD_TEXT_CHARS) : trimmed,
    truncated,
  };
}