import { extname } from 'path';
import { Prisma, TaskPriority } from '@prisma/client';
import { z } from 'zod';
import { extractText } from 'unpdf';
import { AppError } from '../../utils/errors';
import { StatusCodes } from 'http-status-codes';
import { prisma } from '../../lib/prisma';
import { createProject } from '../project/project.service';
import { createTask } from '../task/task.service';
import {
  chatCompletion,
  chatCompletionWithTools,
  isLLMConfigured,
  routeModel,
  LLMMessage,
  LLMContentPart,
  LLMFunctionTool,
  LLMToolCall,
    streamChatCompletionWithTools,
  LLMUsage,
} from './llm';
import {
  buildSystemPrompt,
  SUMMARIZER_SYSTEM_PROMPT,
} from './prompt';
import {
  AgentLanguage,
  ResolvedLanguage,
  resolveTurnLanguage,
  TurnLanguage,
} from './language';
import { env } from '../../config/env';
import { traceAgentTurn } from './tracer';
import { buildMemoryContext, extractMemories, storeMemories } from './memory.service';
import { RequestCoalescer } from '../cache/request-coalescer';
import { logger } from '../../lib/logger';
import { recordCost, recordError, recordLLMCall, recordTokens } from './metrics';

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
  skipPersist?: boolean;
}

/**
 * Persist per-user / per-project LLM usage + USD cost — best-effort only.
 *
 * Two observability layers are refreshed:
 * 1. Persistent ledger (AIUsage) — survives restarts, powers
 *    `GET /api/analytics/llm-cost`.
 * 2. In-memory Prometheus counters (`tf_llm_*`, incl. the `user` label).
 *
 * DB failures are logged + counted but NEVER thrown — cost observability must
 * not degrade the chat path. When `skipPersist` is set (eval/integrations mode),
 * the persistent row is skipped while counters still accrue.
 */
async function recordLLMUsage(
  userId: string,
  projectId: string | null | undefined,
  skipPersist: boolean,
  usage: LLMUsage
): Promise<void> {
  const { model, promptTokens, completionTokens, cost } = usage;
  recordTokens(model, promptTokens, completionTokens, userId);
  recordCost(model, cost.totalCostUsd, userId);
  recordLLMCall(model, 0, 200, userId);

  if (skipPersist) return;
  try {
    await prisma.aIUsage.create({
      data: {
        user: userId ? { connect: { id: userId } } : undefined,
        project: projectId ? { connect: { id: projectId } } : undefined,
        model,
        inputTokens: promptTokens,
        outputTokens: completionTokens,
        inputCostUsd: cost.inputCostUsd,
        outputCostUsd: cost.outputCostUsd,
        totalCostUsd: cost.totalCostUsd,
      },
    });
  } catch (err) {
    recordError('ai_usage_persist_failure');
    logger.error(
      {
        area: 'llm',
        event: 'ai_usage_persist_failure',
        error: err instanceof Error ? err.message : String(err),
      },
      'LLM usage persist failed'
    );
  }
}

/** A machine-readable create action the model may emit to actually change data. */
export interface AgentAction {
  name: AgentActionName;
  params: Record<string, unknown>;
}

export type AgentActionName = 'create_project' | 'create_workspace' | 'create_task';

export interface AgentActionResult {
  name: AgentActionName;
  ok: boolean;
  summary: string;
}

const ACTION_TAG_RE = /\[\[TASKFLOW_ACTION\]\]([\s\S]*?)\[\[\/TASKFLOW_ACTION\]\]/;
const SYSTEM_REMINDER_RE = /<system[_-]?reminder>[\s\S]*?<\/system[_-]?reminder>/gi;
const THINKING_RE = /<thinking>[\s\S]*?<\/thinking>/gi;

/**
 * Function tools advertised to the LLM via OpenAI-compatible `tools`. The model
 * returns a structured `tool_calls` request for an action — far more reliable
 * than coaxing a free-text JSON tag out of an instruct model. The provider maps
 * the function name to our create actions; `toolCallToAction` converts them.
 */
const AGENT_TOOLS: LLMFunctionTool[] = [
  {
    type: 'function',
    function: {
      name: 'create_project',
      description:
        "Create a new project/board (the top-level entity; also what a user calls a 'workspace'). Adds the current user as its owner. Only call this after the user has explicitly confirmed creation.",
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Project/board name' },
          description: { type: 'string', description: 'Optional description' },
          color: { type: 'string', description: 'Optional color hex or keyword' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_task',
      description:
        "Create a task in an existing project/board that the user is a member of, addressed by its name. Only call this after the user has explicitly confirmed creation.",
      parameters: {
        type: 'object',
        properties: {
          projectName: { type: 'string', description: 'Name of the existing project/board' },
          title: { type: 'string', description: 'Task title' },
          columnName: { type: 'string', description: 'Optional column name' },
          description: { type: 'string', description: 'Optional task description' },
          priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
          dueDate: { type: 'string', description: 'YYYY-MM-DD' },
        },
        required: ['projectName', 'title'],
      },
    },
  },
];

const MAX_HISTORY = 20;
const MAX_MESSAGE_LENGTH = 4000;
/**
 * Rolling-context budget (Phase 1+2 memory plan):
 *  - MIN_KEEP_RECENT messages are always sent verbatim, even over budget, so
 *    the user's latest request is never trimmed away.
 *  - When older messages no longer fit (char budget or MAX_HISTORY), they are
 *    folded into a rolling summary persisted on AgentConversation.summary and
 *    injected into the system prompt — the agent keeps full long-term context
 *    at a bounded token cost.
 */
const MIN_KEEP_RECENT = 2;
const MAX_CONTEXT_CHARS = 24_000;
const SUMMARY_MAX_CHARS = 1_500;
const SUMMARY_SOURCE_CHARS = 12_000;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_UPLOAD_TEXT_CHARS = 20_000;
export const UPLOAD_EXTENSIONS = new Set(['.txt', '.md', '.csv', '.json', '.xml', '.log', '.pdf', '.docx']);
export const UPLOAD_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);

// Request coalescer: deduplicates concurrent identical chat requests
interface ChatResult {
  completion: { content: string; toolCalls: LLMToolCall[] };
  reply: string;
  actionResult: AgentActionResult | null;
}
const chatCoalescer = new RequestCoalescer<ChatResult>(5000);

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
): Promise<{
  reply: string;
  conversationId: string;
  language: ResolvedLanguage;
  action?: AgentActionResult | null;
}> {
  if (!isLLMConfigured()) {
    throw new AppError('AI assistant is not configured', StatusCodes.SERVICE_UNAVAILABLE);
  }

  // No count-based pre-slice here: splitHistory() below owns BOTH the message
  // cap and the character budget, so overflow is summarized instead of lost.
  const history: LLMMessage[] = [];
  for (const m of messages) {
    const msg = toLLMMessage(m);
    if (msg) history.push(msg);
  }
  if (history.length === 0) {
    throw new AppError('No message content provided', StatusCodes.BAD_REQUEST);
  }

  // Load the persisted conversation preference and rolling summary (null on
  // old/new conversations). The SERVER is the single source of truth for the
  // response language and for long-term conversational memory.
  const existing = options.conversationId
    ? await prisma.agentConversation.findFirst({
        where: { id: options.conversationId, userId },
        select: { id: true, language: true, summary: true },
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

  // Split the history into a verbatim recent window and an overflow that gets
  // folded into the rolling summary. Only overflow triggers a summary call.
  const { kept, dropped } = splitHistory(history);
  let activeSummary = existing?.summary ?? null;
  let nextSummary: string | undefined;
  if (dropped.length > 0) {
    nextSummary = await rollingSummary(dropped, activeSummary);
    activeSummary = nextSummary;
  }

  // Cross-session memory: inject relevant memories into the system prompt
  // so the agent recalls user preferences/facts from prior conversations.
  // Skip when skipPersist is set (eval/integration mode) to avoid extra LLM calls.
  const memoryContext = options.skipPersist ? '' : await buildMemoryContext(userId, lastUserTexts(messages).join(' '));

  const systemContent =
    buildSystemPrompt(language) +
    (activeSummary ? `\n\n## EARLIER CONVERSATION SUMMARY\n${activeSummary}` : '') +
    (memoryContext ? `\n\n${memoryContext}` : '');
  const system: LLMMessage = { role: 'system', content: systemContent };

  // The whole turn is wrapped in a Langfuse trace (no-op when LANGFUSE_* keys
  // are absent). Inside, we record an LLM span (model + latency) and an action
  // span whose output carries the guardrail decision (accepted / rejected).
  // Coalesce concurrent requests with same message content
  const messageKey = JSON.stringify({ userId, messages, options });
  const result = await chatCoalescer.coalesce(messageKey, async () => {
    return await traceAgentTurn(
    {
      userId,
      conversationId: options.conversationId ?? 'new',
      userMessage: lastUserTexts(messages).join(' ').slice(0, 500),
      projectId: options.projectId,
    },
    async (trace) => {
      const llmStart = Date.now();
      const sanitized = sanitizeForLLM([system, ...kept]);
      const completion = await chatCompletionWithTools(sanitized, AGENT_TOOLS);
      const llmMs = Date.now() - llmStart;
      if (trace) {
        const span = trace.span({ name: 'llm' });
        span.update({
          input: { toolCount: AGENT_TOOLS.length },
          output: {
            model: env.LLM_MODEL,
            latencyMs: llmMs,
            toolCalls: completion.toolCalls.length,
          },
          metadata: { tier: routeModel(lastUserTexts(messages).join(' ')) },
        });
        span.end();
      }

      // Attribute token usage + USD cost to the calling user/project
      // (best-effort: never throws into the chat path).
      if (completion.usage) {
        void recordLLMUsage(
          userId,
          options.projectId,
          Boolean(options.skipPersist),
          completion.usage
        );
      }

      const originalContent = completion.content ?? '';
      const tagAction = parseAction(originalContent);
      let action: AgentAction | null = completion.toolCalls.length
        ? toolCallToAction(completion.toolCalls[0])
        : tagAction;
      // Guard: never execute a create action when the user's latest message
      // shows no intent to create (e.g. a simple "hi" greeting). This prevents
      // hallucinating a project board on casual greetings.
      if (action && !hasCreateIntent(lastUserTexts(messages).join(' '), action.name)) {
        action = null;
      }

      let reply = sanitizeAssistantContent(originalContent);
      reply = reply.replace(ACTION_TAG_RE, '').trim();
      // Final safety: strip any leaked internal tags that survived the first pass.
      reply = sanitizeAssistantContent(reply);
      let actionResult: AgentActionResult | null = null;

      if (action) {
        // executeAction is the guardrail: it validates params (Zod) and the
        // user's RBAC membership, and returns ok:false (never throws) on block.
        const res = await executeAction(action, userId);
        actionResult = res;
        if (trace) {
          const span = trace.span({ name: 'action' });
          span.update({
            input: { name: action.name, params: action.params },
            output: { decision: res.ok ? 'accepted' : 'rejected', summary: res.summary },
          });
          span.end();
        }
        reply = (reply ? `${reply}\n\n` : '') + res.summary;
        reply = sanitizeAssistantContent(reply.trim());
      }

      return { completion, reply, actionResult };
    }
    );
  });

  const { reply, actionResult } = result;

  // Extract and store memories from this turn (best-effort, never blocks the response).
  // Skip when skipPersist is set (eval/integration mode) to avoid extra LLM calls.
  if (!options.skipPersist) {
    const conversationText = history.map((m) => `${m.role}: ${textOf(m)}`).join('\n');
    const fullTurn = `${conversationText}\nassistant: ${reply}`;
    void (async () => {
      const extracted = await extractMemories(userId, fullTurn);
      await storeMemories(userId, extracted, 'conversation');
    })();
  }

  const conversationId =
    options.skipPersist && !options.conversationId
      ? `eval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      : await persistConversation(
          userId,
          history,
          options,
          reply,
          existing,
          turn,
          nextSummary
        );

  return { reply, conversationId, language, ...(actionResult ? { action: actionResult } : {}) };
}

/** SSE event types for streaming agent responses. */
export type SSEEventType = 'token' | 'action' | 'done' | 'error';

/** A single SSE event emitted during streaming. */
export interface SSEEvent {
  type: SSEEventType;
  data: unknown;
}

/**
 * Streaming version of `chat()`. Yields SSE events as tokens arrive from the
 * LLM provider. The final `done` event includes the full reply and metadata.
 * On error, an `error` event is emitted and the stream ends.
 *
 * Events emitted:
 *   - { type: 'token', data: string } — each content chunk
 *   - { type: 'action', data: AgentActionResult } — when a tool call is executed
 *   - { type: 'done', data: { reply, conversationId, language } } — completion
 *   - { type: 'error', data: { message } } — on failure
 */
export async function* chatStream(
  userId: string,
  messages: AgentChatMessage[],
  options: ChatOptions = {}
): AsyncIterable<SSEEvent> {
  if (!isLLMConfigured()) {
    yield { type: 'error', data: { message: 'AI assistant is not configured' } };
    return;
  }

  // Build history from incoming messages
  const history: LLMMessage[] = [];
  for (const m of messages) {
    const msg = toLLMMessage(m);
    if (msg) history.push(msg);
  }
  if (history.length === 0) {
    yield { type: 'error', data: { message: 'No message content provided' } };
    return;
  }

  // Load conversation preference and rolling summary
  const existing = options.conversationId
    ? await prisma.agentConversation.findFirst({
        where: { id: options.conversationId, userId },
        select: { id: true, language: true, summary: true },
      })
    : null;

  const turn = resolveTurnLanguage({
    requested: options.language ?? null,
    conversationPreference: existing?.language ?? null,
    userTexts: lastUserTexts(messages),
  });
  const language = turn.language;

  // Split history and handle rolling summary
  const { kept, dropped } = splitHistory(history);
  let activeSummary = existing?.summary ?? null;
  let nextSummary: string | undefined;
  if (dropped.length > 0) {
    try {
      nextSummary = await rollingSummary(dropped, activeSummary);
      activeSummary = nextSummary;
    } catch {
      // Continue without summary on failure
    }
  }

  // Cross-session memory: inject relevant memories into the system prompt
  // so the agent recalls user preferences/facts from prior conversations.
  // Skip when skipPersist is set (eval/integration mode) to avoid extra LLM calls.
  const memoryContext = options.skipPersist ? '' : await buildMemoryContext(userId, lastUserTexts(messages).join(' '));

  const systemContent =
    buildSystemPrompt(language) +
    (activeSummary ? `\n\n## EARLIER CONVERSATION SUMMARY\n${activeSummary}` : '') +
    (memoryContext ? `\n\n${memoryContext}` : '');
  const system: LLMMessage = { role: 'system', content: systemContent };

  const sanitized = sanitizeForLLM([system, ...kept]);

  // Stream from the LLM provider
  let fullContent = '';
  let toolCalls: LLMToolCall[] = [];
  let streamError: string | null = null;

  try {
    for await (const chunk of streamChatCompletionWithTools(sanitized, AGENT_TOOLS)) {
      switch (chunk.type) {
        case 'token':
          fullContent += chunk.data as string;
          yield { type: 'token', data: chunk.data as string };
          break;
        case 'tool_calls':
          toolCalls = chunk.data as LLMToolCall[];
          break;
        case 'error':
          streamError = (chunk.data as { message: string }).message;
          yield { type: 'error', data: chunk.data };
          return;
        case 'done':
          // Stream complete — process the result
          break;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Stream error';
    yield { type: 'error', data: { message: msg } };
    return;
  }

  if (streamError) {
    yield { type: 'error', data: { message: streamError } };
    return;
  }

  // Process action from tool calls or content tag
  const tagAction = parseAction(fullContent);
  let action: AgentAction | null = toolCalls.length ? toolCallToAction(toolCalls[0]) : tagAction;
  if (action && !hasCreateIntent(lastUserTexts(messages).join(' '), action.name)) {
    action = null;
  }

  let reply = sanitizeAssistantContent(fullContent.replace(ACTION_TAG_RE, '').trim());
  reply = sanitizeAssistantContent(reply);
  let actionResult: AgentActionResult | null = null;

  if (action) {
    const res = await executeAction(action, userId);
    actionResult = res;
    yield { type: 'action', data: res };
    reply = sanitizeAssistantContent((reply ? `${reply}\n\n` : '') + res.summary);
    reply = reply.trim();
  }

  // Persist conversation
  const conversationId =
    options.skipPersist && !options.conversationId
      ? `eval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      : await persistConversation(
          userId,
          history,
          options,
          reply,
          existing,
          turn,
          nextSummary
        );

  // Extract and store memories from this turn (best-effort, never blocks the stream).
  // Skip when skipPersist is set (eval/integration mode) to avoid extra LLM calls.
  if (!options.skipPersist) {
    const conversationText = history.map((m) => `${m.role}: ${textOf(m)}`).join('\n');
    const fullTurn = `${conversationText}\nassistant: ${reply}`;
    void (async () => {
      const extracted = await extractMemories(userId, fullTurn);
      await storeMemories(userId, extracted, 'conversation');
    })();
  }

  yield {
    type: 'done',
    data: { reply, conversationId, language, ...(actionResult ? { action: actionResult } : {}) },
  };
}

function sanitizeForLLM(messages: LLMMessage[]): LLMMessage[] {
  return messages.map((m) => ({
    ...m,
    content: m.role === 'user' && typeof m.content === 'string' ? `<user_message>\n${m.content}\n</user_message>` : m.content,
  }));
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

/**
 * Plain-text projection of an LLM message for PERSISTENCE: image parts become a
 * short placeholder instead of the full data URI, so stored conversations stay
 * small even when the user attaches screenshots.
 */
function persistedContent(m: LLMMessage): string {
  if (typeof m.content === 'string') return m.content;
  return m.content
    .map((p) => (p.type === 'text' ? p.text : '[image attachment]'))
    .join('\n')
    .trim();
}

export interface HistorySplit {
  /** Recent messages sent verbatim to the LLM this turn. */
  kept: LLMMessage[];
  /** Older messages that overflowed the context budget. */
  dropped: LLMMessage[];
}

/**
 * Split the history into the verbatim recent window and the overflow. Walks
 * backwards accumulating character cost; stops at MAX_CONTEXT_CHARS or
 * MAX_HISTORY messages, but ALWAYS keeps the last MIN_KEEP_RECENT messages so
 * the user's latest request is never trimmed.
 */
function splitHistory(history: LLMMessage[]): HistorySplit {
  const minKept = Math.min(MIN_KEEP_RECENT, history.length);
  let start = history.length;
  let chars = 0;
  // The most recent messages are always sent verbatim, even over budget.
  for (let i = 0; i < minKept; i += 1) {
    start -= 1;
    chars += textOf(history[start]).length;
  }
  // Extend further back only while the combined window fits the budget.
  while (start > 0) {
    const nextStart = start - 1;
    const len = textOf(history[nextStart]).length;
    if (history.length - nextStart > MAX_HISTORY || chars + len > MAX_CONTEXT_CHARS) break;
    start = nextStart;
    chars += len;
  }
  return { kept: history.slice(start), dropped: history.slice(0, start) };
}

/**
 * Fold overflow messages — plus the previous rolling summary, if any — into one
 * compact summary paragraph via an LLM side call. Never throws: on failure it
 * degrades to a truncated concatenation so chat keeps working.
 */
async function rollingSummary(dropped: LLMMessage[], previous: string | null): Promise<string> {
  let source = dropped.map((m) => `${m.role}: ${textOf(m)}`).join('\n');
  if (source.length > SUMMARY_SOURCE_CHARS) source = source.slice(-SUMMARY_SOURCE_CHARS);
  try {
    const out = await chatCompletion([
      { role: 'system', content: SUMMARIZER_SYSTEM_PROMPT },
      {
        role: 'user',
        content: previous
          ? `Previous summary:\n${previous}\n\nNewer messages to fold in:\n${source}`
          : `Messages to summarize:\n${source}`,
      },
    ]);
    return out.slice(0, SUMMARY_MAX_CHARS).trim() || fallbackSummary(previous, source);
  } catch {
    return fallbackSummary(previous, source);
  }
}

function fallbackSummary(previous: string | null, source: string): string {
  return `${previous ? `${previous}\n` : ''}${source.slice(0, SUMMARY_MAX_CHARS)}`.trim();
}

/** Extract and validate a [[TASKFLOW_ACTION]] tag from a model reply. */
export function parseAction(reply: string): AgentAction | null {
  const match = ACTION_TAG_RE.exec(reply);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim()) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { action, params } = parsed as { action?: unknown; params?: unknown };
    if (typeof action !== 'string') return null;
    switch (action) {
      case 'create_project':
      case 'create_workspace':
      case 'create_task':
        return { name: action, params: params && typeof params === 'object' ? (params as Record<string, unknown>) : {} };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/**
 * Convert a structured tool call from the provider into an AgentAction. Only
 * the tool names we advertised map to actions; unknown tool names are ignored.
 * The function arguments arrive as a JSON string, parsed into `params`.
 */
export function toolCallToAction(toolCall: LLMToolCall): AgentAction | null {
  if (toolCall.name !== 'create_project' && toolCall.name !== 'create_task') return null;
  let params: Record<string, unknown> = {};
  try {
    const parsed = toolCall.arguments ? (JSON.parse(toolCall.arguments) as unknown) : {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      params = parsed as Record<string, unknown>;
    }
  } catch {
    params = {};
  }
  return { name: toolCall.name, params };
}

const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1000).optional(),
  color: z.string().max(20).optional(),
});

const createTaskSchema = z.object({
  projectName: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(500),
  columnName: z.string().max(120).optional(),
  description: z.string().max(4000).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  dueDate: z.string().optional(),
});

/**
 * Execute a validated create action as the authenticated user. Never throws —
 * a failure is returned as a not-ok result so the model reply can still be
 * shown instead of killing the whole chat turn.
 */
export async function executeAction(action: AgentAction, userId: string): Promise<AgentActionResult> {
  try {
    if (action.name === 'create_project' || action.name === 'create_workspace') {
      const p = createProjectSchema.safeParse(action.params);
      if (!p.success) {
        return { name: action.name, ok: false, summary: `Không thể tạo: ${firstZodIssue(p.error)}` };
      }
      const created = await createProject(userId, p.data);
      return {
        name: action.name,
        ok: true,
        summary: `✅ Đã tạo board "${p.data.name}" (id ${created.id}).`,
      };
    }

    if (action.name === 'create_task') {
      const p = createTaskSchema.safeParse(action.params);
      if (!p.success) {
        return { name: action.name, ok: false, summary: `Không thể tạo task: ${firstZodIssue(p.error)}` };
      }
      const project = await prisma.projectMember.findFirst({
        where: { userId, project: { name: p.data.projectName } },
        select: { project: { select: { id: true } } },
      });
      if (!project) {
        return {
          name: action.name,
          ok: false,
          summary: `⚠️ Không tìm thấy board "${p.data.projectName}" mà bạn là thành viên. Hãy tạo nó trước hoặc kiểm tra lại tên.`,
        };
      }
      const projectId = project.project.id;
      let column = null;
      if (p.data.columnName) {
        column = await prisma.column.findFirst({ where: { projectId, name: p.data.columnName } });
      }
      if (!column) {
        column = await prisma.column.findFirst({ where: { projectId }, orderBy: { position: 'asc' } });
      }
      if (!column) {
        return { name: action.name, ok: false, summary: '⚠️ Board không có cột nào để thêm task.' };
      }
      await createTask(userId, {
        projectId,
        columnId: column.id,
        title: p.data.title,
        ...(p.data.description !== undefined ? { description: p.data.description } : {}),
        ...(p.data.priority !== undefined ? { priority: p.data.priority as TaskPriority } : {}),
        ...(p.data.dueDate !== undefined ? { dueDate: p.data.dueDate } : {}),
      });
      return {
        name: action.name,
        ok: true,
        summary: `✅ Đã tạo task "${p.data.title}" trong board "${p.data.projectName}" (cột "${column.name}").`,
      };
    }

    return { name: action.name, ok: false, summary: `⚠️ Thao tác "${action.name}" chưa được hỗ trợ.` };
  } catch (err) {
    const msg = err instanceof AppError ? err.message : 'lỗi không xác định';
    return { name: action.name, ok: false, summary: `⚠️ Không thể thực hiện: ${msg}` };
  }
}

function firstZodIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'dữ liệu không hợp lệ';
}

/** Saves or appends the exchanged messages to an AgentConversation row. */
async function persistConversation(
  userId: string,
  history: LLMMessage[],
  options: ChatOptions,
  reply: string,
  existing: { id: string; language: string | null; summary: string | null } | null,
  turn: TurnLanguage,
  nextSummary?: string
): Promise<string> {
  // Persist plain-text entries only — image data URIs never reach the database.
  const messages = [
    ...history.map((m) => ({ role: m.role, content: persistedContent(m) })),
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
      data: {
        messages,
        projectId,
        ...(nextLanguage !== undefined ? { language: nextLanguage } : {}),
        ...(nextSummary !== undefined ? { summary: nextSummary } : {}),
      },
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
      ...(nextSummary !== undefined ? { summary: nextSummary } : {}),
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

/**
 * Strip internal-only tags that must never be shown to the user (system
 * reminders, chain-of-thought, etc.). The provider may echo these back when
 * the model hallucinates a system message.
 */
export function sanitizeAssistantContent(content: string): string {
  return content
    .replace(SYSTEM_REMINDER_RE, '')
    .replace(THINKING_RE, '')
    .replace(ACTION_TAG_RE, '')
    .trim();
}

/**
 * Heuristic: does the latest user text contain real intent to call the given
 * create action? Prevents greeting-like messages ("hi") from triggering a
 * hallucinated board creation.
 */
export function hasCreateIntent(userText: string, actionName: string): boolean {
  const t = userText.toLowerCase().trim();
  if (!t) return false;
  // Pure greetings never count as create intent — blocks "hi" hallucinations.
  if (/^(hi|hello|hey|xin\s*chào|chào|yo|hola)[!.\s]*$/i.test(t)) return false;
  // Short explicit confirmations are treated as intent (user already said what
  // to create in an earlier turn; "có/ok" is the confirmation).
  if (/^(có|co|ok|oke|okay|yes|đồng\s*ý|dong\s*y|cứ\s*tạo|tạo\s*đi|go\s*ahead|confirm)[!.\s]*$/i.test(t)) return true;
  if (actionName === 'create_project' || actionName === 'create_workspace') {
    return /(tạo|tao|create|new\s*(project|board|workspace)|dự\s*án|board|workspace)/i.test(t);
  }
  if (actionName === 'create_task') {
    return /(tạo|tao|create|new\s*task|task|nhiệm\s*vụ|công\s*việc)/i.test(t);
  }
  return true;
}